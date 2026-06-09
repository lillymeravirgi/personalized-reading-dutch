"""Create local TST-xx accounts for full-flow testing.

The script only touches the test_local_xx namespace. Accounts are paired by
level so the two reading conditions can be compared locally.

Run with the same interpreter the server uses, e.g.:
    /opt/homebrew/anaconda3/bin/python3.13 seed_local_test_accounts.py
"""
from __future__ import annotations

import os
import sys
import datetime

sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import DATABASE_URL
from app.models import (
    ConditionType,
    Lexicon,
    OnboardingWords,
    RecommendedVocabulary,
    TopicStatus,
    User,
    UserTopic,
    UserVocabularyVector,
    VocabStatus,
)
from app.routers.auth import hash_password, study_email

# Own engine with a busy timeout so we don't deadlock the live uvicorn process.
_connect_args = {"timeout": 30} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

password = "test1234"
now = datetime.datetime.utcnow()

next_cefr = {"A1": "A2", "A2": "B1", "B1": "B2", "B2": "C1", "C1": "C1"}

# (suffix, condition, cefr, interests, age, city, job, purpose)
account_specs = [
    ("01", ConditionType.ADAPTIVE, "A1", ["cooking", "family", "travel"], 24, "Utrecht", "student", "daily life"),
    ("02", ConditionType.BASELINE, "A1", ["cooking", "family", "travel"], 27, "Utrecht", "barista", "daily life"),
    ("03", ConditionType.ADAPTIVE, "A2", ["technology", "music", "sports"], 31, "Amsterdam", "developer", "work"),
    ("04", ConditionType.BASELINE, "A2", ["technology", "music", "sports"], 29, "Amsterdam", "designer", "work"),
    ("05", ConditionType.ADAPTIVE, "B1", ["science", "health", "nature"], 35, "Leiden", "nurse", "study"),
    ("06", ConditionType.BASELINE, "B1", ["science", "health", "nature"], 38, "Leiden", "lab technician", "study"),
    ("07", ConditionType.ADAPTIVE, "B2", ["business", "history", "politics"], 42, "Rotterdam", "manager", "work"),
    ("08", ConditionType.BASELINE, "B2", ["business", "history", "politics"], 45, "Rotterdam", "consultant", "work"),
    ("09", ConditionType.ADAPTIVE, "C1", ["art", "literature", "philosophy"], 33, "Den Haag", "researcher", "academic"),
    ("10", ConditionType.BASELINE, "C1", ["art", "literature", "philosophy"], 36, "Den Haag", "lecturer", "academic"),
]

neutral_topics = ["weather", "shopping"]

onboarding_words_per_user = 15
learning_words_per_user = 12
reservoir_words_per_account = 40


def _lexicon_pool(db, cefr: str) -> list[Lexicon]:
    return (
        db.query(Lexicon)
        .filter(Lexicon.cefr_level == cefr)
        .order_by(Lexicon.word_id.asc())
        .all()
    )


def _purge_existing(db) -> None:
    """Remove only TST-xx / test_local_xx rows so re-runs are idempotent."""
    user_ids = [
        row.user_id
        for row in db.query(User.user_id)
        .filter(User.user_id.like("test_local_%"))
        .all()
    ]
    if not user_ids:
        return

    from app.models import (
        AssessmentBatch,
        InteractionTelemetry,
        ReadingSession,
        SurveyResult,
        VocabularyTestResult,
    )

    session_ids = [
        row.session_id
        for row in db.query(ReadingSession.session_id)
        .filter(ReadingSession.user_id.in_(user_ids))
        .all()
    ]
    if session_ids:
        db.query(SurveyResult).filter(SurveyResult.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(InteractionTelemetry).filter(InteractionTelemetry.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(ReadingSession).filter(ReadingSession.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(VocabularyTestResult).filter(VocabularyTestResult.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(OnboardingWords).filter(OnboardingWords.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(RecommendedVocabulary).filter(RecommendedVocabulary.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(UserVocabularyVector).filter(UserVocabularyVector.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(AssessmentBatch).filter(AssessmentBatch.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(UserTopic).filter(UserTopic.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.query(User).filter(User.user_id.in_(user_ids)).delete(synchronize_session=False)
    db.commit()
    print(f"  purged {len(user_ids)} pre-existing test_local accounts")


def main() -> None:
    db = SessionLocal()
    try:
        print("Purging any previous TST-xx test accounts...")
        _purge_existing(db)

        print("Creating 10 fully-onboarded test accounts...")
        for suffix, condition, cefr, interests, age, city, job, purpose in account_specs:
            study_id = f"TST-{suffix}"
            user_id = f"test_local_{suffix}"

            user = User(
                user_id=user_id,
                email=study_email(study_id),
                username=study_id,
                password_hash=hash_password(password),
                display_name=f"Test {study_id}",
                study_code=study_id,
                estimated_cefr=cefr,
                onboarding_completed=True,
                current_condition=condition,
                has_switched_conditions=False,
                age=age,
                city=city,
                job=job,
                academic_background="bachelor",
                mother_language="English",
                other_languages="German",
                purpose=purpose,
            )
            db.add(user)

            for topic in interests:
                db.add(UserTopic(user_id=user_id, topic_name=topic, status=TopicStatus.INTERESTED))
            for topic in neutral_topics:
                db.add(UserTopic(user_id=user_id, topic_name=topic, status=TopicStatus.NEUTRAL))

            pool = _lexicon_pool(db, cefr)
            if len(pool) < onboarding_words_per_user + reservoir_words_per_account:
                pool = pool + _lexicon_pool(db, next_cefr[cefr])

            onboarding_pool = pool[:onboarding_words_per_user]
            for idx, lex in enumerate(onboarding_pool):
                db.add(OnboardingWords(user_id=user_id, word_id=lex.word_id, study_phase=1))
                if idx < learning_words_per_user:
                    db.add(UserVocabularyVector(
                        user_id=user_id,
                        word_id=lex.word_id,
                        status=VocabStatus.LEARNING,
                        mastery_score=0.1,
                        exposure_count=1,
                        review_priority=50 - idx,
                        next_review_at=now,
                    ))

            used_ids = {lex.word_id for lex in onboarding_pool}
            remark = "adaptive" if condition == ConditionType.ADAPTIVE else "baseline"
            reservoir_pool = _lexicon_pool(db, cefr) + _lexicon_pool(db, next_cefr[cefr])
            added = 0
            for lex in reservoir_pool:
                if added >= reservoir_words_per_account:
                    break
                if lex.word_id in used_ids:
                    continue
                db.add(RecommendedVocabulary(user_id=user_id, word_id=lex.word_id, remark=remark))
                used_ids.add(lex.word_id)
                added += 1

            db.commit()
            print(f"  {study_id:7} {condition.value:8} {cefr}  interests={interests}  "
                  f"onboarding=15 learning=12 reservoir={added}")

        print("\nDone. Login with Study ID + password.")
        print(f"  Password (all): {password}")
        total = db.query(User).filter(User.user_id.like("test_local_%")).count()
        print(f"  Verified {total} test accounts in DB.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
