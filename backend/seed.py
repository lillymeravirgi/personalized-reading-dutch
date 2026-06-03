
from __future__ import annotations

import csv
import os
import random
import secrets
import string
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(__file__))

from app.database import Base, SessionLocal, engine
from app.models import (
    AssessmentBatch,
    ConditionType,
    InteractionTelemetry,
    Lexicon,
    OnboardingWords,
    ReadingSession,
    RecommendedVocabulary,
    SurveyResult,
    User,
    UserTopic,
    UserVocabularyVector,
    VocabularyTestResult,
)
from app.routers.auth import hash_password, study_email
from main import _ensure_database_columns


print("Creating tables...")
Base.metadata.create_all(bind=engine)
_ensure_database_columns()
print("  tables ready")

db = SessionLocal()

from lexicon_data import LEXICON_DATA

print("Seeding lexicon...")
for entry in LEXICON_DATA:
    exists = db.query(Lexicon).filter(Lexicon.word == entry["word"]).first()
    if not exists:
        db.add(Lexicon(**entry))
db.commit()
print(f"  {len(LEXICON_DATA)} words processed")

seed_team_accounts = os.getenv("SEED_TEST_ACCOUNTS", "false").lower() in {
    "1",
    "true",
    "yes",
}
reset_team_accounts = os.getenv("RESET_TEAM_ACCOUNT_DATA", "false").lower() in {
    "1",
    "true",
    "yes",
}
seed_participant_accounts = os.getenv("SEED_PARTICIPANT_ACCOUNTS", "false").lower() in {
    "1",
    "true",
    "yes",
}
reset_participant_accounts = os.getenv("RESET_PARTICIPANT_ACCOUNT_DATA", "false").lower() in {
    "1",
    "true",
    "yes",
}


def random_password(length: int = 14) -> str:
    groups = [
        string.ascii_lowercase,
        string.ascii_uppercase,
        string.digits,
        "!@#$%&*?",
    ]
    chars = [secrets.choice(group) for group in groups]
    pool = "".join(groups)
    chars.extend(secrets.choice(pool) for _ in range(length - len(chars)))
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)


def reset_team_user(db, user: User, condition: ConditionType, display_name: str):
    session_ids = [
        row.session_id
        for row in db.query(ReadingSession.session_id)
        .filter(ReadingSession.user_id == user.user_id)
        .all()
    ]

    if session_ids:
        db.query(SurveyResult).filter(SurveyResult.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(InteractionTelemetry).filter(InteractionTelemetry.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(ReadingSession).filter(ReadingSession.user_id == user.user_id).delete(synchronize_session=False)

    db.query(VocabularyTestResult).filter(VocabularyTestResult.user_id == user.user_id).delete(synchronize_session=False)
    db.query(OnboardingWords).filter(OnboardingWords.user_id == user.user_id).delete(synchronize_session=False)
    db.query(RecommendedVocabulary).filter(RecommendedVocabulary.user_id == user.user_id).delete(synchronize_session=False)
    db.query(UserVocabularyVector).filter(UserVocabularyVector.user_id == user.user_id).delete(synchronize_session=False)
    db.query(AssessmentBatch).filter(AssessmentBatch.user_id == user.user_id).delete(synchronize_session=False)
    db.query(UserTopic).filter(UserTopic.user_id == user.user_id).delete(synchronize_session=False)

    user.display_name = display_name
    user.estimated_cefr = "B1"
    user.onboarding_completed = False
    user.current_condition = condition
    user.has_switched_conditions = False
    user.age = None
    user.city = None
    user.gender = None
    user.job = None
    user.academic_background = None
    user.mother_language = None
    user.other_languages = None
    user.purpose = None
    user.preferred_styles = None

if seed_team_accounts:
    team_accounts = [
        ("KIM", "Kim", ConditionType.ADAPTIVE),
        ("KIKI", "Kiki", ConditionType.BASELINE),
        ("JULIAN", "Julian", ConditionType.ADAPTIVE),
        ("TJ", "TJ", ConditionType.BASELINE),
        ("EVIE", "Evie", ConditionType.ADAPTIVE),
        ("JY", "Jy", ConditionType.BASELINE),
    ]
    password = os.getenv("SEED_TEST_PASSWORD")
    if not password:
        raise RuntimeError("Set SEED_TEST_PASSWORD before seeding team test accounts.")

    print("Seeding team test accounts...")
    db.query(User).filter(User.email.like("test%@leeswijs.local")).delete(synchronize_session=False)

    for study_id, display_name, condition in team_accounts:
        user = db.query(User).filter(User.study_code == study_id).first()
        if not user:
            user = User(
                user_id=f"team_{study_id.lower()}",
                email=study_email(study_id),
                username=study_id,
                password_hash=hash_password(password),
                display_name=display_name,
                study_code=study_id,
                estimated_cefr="B1",
                onboarding_completed=False,
                current_condition=condition,
                has_switched_conditions=False,
            )
            db.add(user)
            db.flush()
        else:
            user.email = study_email(study_id)
            user.username = study_id
            user.password_hash = hash_password(password)
            user.display_name = display_name
            user.study_code = study_id
            user.estimated_cefr = user.estimated_cefr or "B1"
            if reset_team_accounts:
                reset_team_user(db, user, condition, display_name)
    db.commit()
    print(f"  {len(team_accounts)} team accounts processed")
    if reset_team_accounts:
        print("  team account study data reset")
else:
    print("Skipping team test accounts. Set SEED_TEST_ACCOUNTS=true for local demos.")

if seed_participant_accounts:
    participant_ids = [f"LW-{i:02d}" for i in range(1, 21)]
    conditions = [ConditionType.ADAPTIVE] * 10 + [ConditionType.BASELINE] * 10
    random.SystemRandom().shuffle(conditions)
    output_path = Path(os.getenv(
        "SEED_PARTICIPANT_PASSWORDS_FILE",
        "/private/tmp/leeswijs_participant_accounts.csv",
    ))

    print("Seeding participant accounts...")
    rows: list[dict[str, str]] = []
    for study_id, condition in zip(participant_ids, conditions):
        password = random_password()
        user = db.query(User).filter(User.study_code == study_id).first()
        if not user:
            user = User(
                user_id=f"study_{study_id.lower().replace('-', '_')}",
                email=study_email(study_id),
                username=study_id,
                password_hash=hash_password(password),
                display_name=study_id,
                study_code=study_id,
                estimated_cefr="B1",
                onboarding_completed=False,
                current_condition=condition,
                has_switched_conditions=False,
            )
            db.add(user)
            db.flush()
        else:
            user.email = study_email(study_id)
            user.username = study_id
            user.password_hash = hash_password(password)
            user.display_name = study_id
            user.study_code = study_id
            user.current_condition = condition
            if reset_participant_accounts:
                reset_team_user(db, user, condition, study_id)

        rows.append({
            "study_id": study_id,
            "password": password,
            "condition": condition.value,
        })

    db.commit()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["study_id", "password", "condition"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"  {len(rows)} participant accounts processed")
    print(f"  passwords written to {output_path}")
    if reset_participant_accounts:
        print("  participant account study data reset")
else:
    print("Skipping participant accounts. Set SEED_PARTICIPANT_ACCOUNTS=true for study accounts.")

db.close()

print("\nSeed complete.")
print("  Use Study ID + password to log in.")
