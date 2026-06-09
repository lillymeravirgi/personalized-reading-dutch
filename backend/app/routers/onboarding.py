import logging
import random

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.krs_service import run_baseline_krs, run_krs
from app.models import ConditionType, Lexicon, OnboardingWords, RecommendedVocabulary, User
from app.schemas import LexiconEntry, OnboardingPersonalInfoRequest


class MarkDecisionRequest(BaseModel):
    user_id: str
    word_id: int
    study_phase: int = 1
    to_be_tested: bool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["Onboarding"])

ONBOARDING_WORD_COUNT = 20
VOCAB_TEST_WORD_COUNT = 10
PHASE_BUFFER_WORD_COUNT = 20


def _run_krs_background(user_id: str, is_refill: bool):
    db = SessionLocal()
    try:
        run_krs(user_id=user_id, db=db, is_refill=is_refill)
    except Exception as e:
        logger.warning("[Onboarding] Background KRS failed for %s: %s", user_id, e)
    finally:
        db.close()


def _phase_words(db: Session, user_id: str, study_phase: int):
    rows = (
        db.query(OnboardingWords)
        .filter(
            OnboardingWords.user_id == user_id,
            OnboardingWords.study_phase == study_phase,
        )
        .join(OnboardingWords.lexicon_entry)
        .order_by(OnboardingWords.id.asc())
        .limit(PHASE_BUFFER_WORD_COUNT)
        .all()
    )
    return [LexiconEntry.model_validate(row.lexicon_entry).model_dump() for row in rows]


def _entry_from_row(row):
    return getattr(row, "lexicon_entry", row)


@router.post("/personal-info")
def save_personal_info(payload: OnboardingPersonalInfoRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.display_name is not None: user.display_name = payload.display_name
    if payload.age is not None: user.age = payload.age
    if payload.city is not None: user.city = payload.city
    if payload.job is not None: user.job = payload.job
    if payload.academic_background is not None: user.academic_background = payload.academic_background
    if payload.mother_language is not None: user.mother_language = payload.mother_language
    if payload.other_languages is not None: user.other_languages = payload.other_languages
    if payload.purpose is not None: user.purpose = payload.purpose
    if payload.self_reported_cefr is not None: user.estimated_cefr = payload.self_reported_cefr

    db.commit()
    return {"success": True}


@router.post("/words/mark-decision")
def mark_word_decision(payload: MarkDecisionRequest, db: Session = Depends(get_db)):
    """Set is_to_be_tested on an OnboardingWords row after the user clicks
    'I know it' (to_be_tested=False) or 'Add to learn' (to_be_tested=True)."""
    row = (
        db.query(OnboardingWords)
        .filter(
            OnboardingWords.user_id == payload.user_id,
            OnboardingWords.word_id == payload.word_id,
            OnboardingWords.study_phase == payload.study_phase,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Word not found in this phase's word set.")

    row.is_to_be_tested = payload.to_be_tested
    db.commit()
    return {"success": True}


@router.post("/words/{user_id}")
def select_onboarding_words(
    user_id: str,
    background_tasks: BackgroundTasks,
    is_refill: bool = False,
    study_phase: int = 1,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    used_ids = {
        ow.word_id for ow in
        db.query(OnboardingWords)
        .filter(OnboardingWords.user_id == user_id)
        .all()
    }

    if user.current_condition == ConditionType.BASELINE:
        # run_baseline_krs selects random CEFR-matched words, saves them to
        # RecommendedVocabulary with remark="baseline", and returns the word IDs.
        run_baseline_krs(user_id, db, target_count=ONBOARDING_WORD_COUNT, study_phase=study_phase)
        recs = (
            db.query(RecommendedVocabulary)
            .filter(
                RecommendedVocabulary.user_id == user_id,
                RecommendedVocabulary.remark == "baseline",
            )
            .join(RecommendedVocabulary.lexicon_entry)
            .all()
        )
        valid_recs = [rec for rec in recs if _entry_from_row(rec).word_id not in used_ids]
        selected = [_entry_from_row(rec) for rec in valid_recs[:ONBOARDING_WORD_COUNT]]
        random.shuffle(selected)
    else:
        background_tasks.add_task(_run_krs_background, user_id, is_refill)
        recs = (
            db.query(RecommendedVocabulary)
            .filter(
                RecommendedVocabulary.user_id == user_id,
                RecommendedVocabulary.remark == "adaptive"
            )
            .join(RecommendedVocabulary.lexicon_entry)
            .all()
        )
        # Filter out already-used words first
        valid_recs = [_entry_from_row(r) for r in recs if _entry_from_row(r).word_id not in used_ids]

        # If KRS pool is too small, pad with Lexicon words from user's CEFR level (+ adjacent)
        if len(valid_recs) < ONBOARDING_WORD_COUNT:
            level = user.estimated_cefr or "B1"
            cefr_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
            levels_to_try = [level]
            idx = cefr_order.index(level) if level in cefr_order else 2
            if idx > 0:
                levels_to_try.append(cefr_order[idx - 1])
            if idx < len(cefr_order) - 1:
                levels_to_try.append(cefr_order[idx + 1])
            extra = (
                db.query(Lexicon)
                .filter(Lexicon.cefr_level.in_(levels_to_try))
                .limit(ONBOARDING_WORD_COUNT * 10)
                .all()
            )
            existing_ids = {r.word_id for r in valid_recs} | used_ids
            for lex in extra:
                if lex.word_id not in existing_ids:
                    valid_recs.append(lex)
                    existing_ids.add(lex.word_id)
                if len(valid_recs) >= ONBOARDING_WORD_COUNT:
                    break

        selected = valid_recs[:ONBOARDING_WORD_COUNT]
        random.shuffle(selected)

    saved_count = 0
    saved_entries = []
    for entry in selected:
        if saved_count >= PHASE_BUFFER_WORD_COUNT:
            break
        word_id = entry.word_id
        already = (
            db.query(OnboardingWords)
            .filter(
                OnboardingWords.user_id == user_id,
                OnboardingWords.word_id == word_id,
                OnboardingWords.study_phase == study_phase,
            )
            .first()
        )
        if not already:
            db.add(OnboardingWords(user_id=user_id, word_id=word_id, study_phase=study_phase))
            saved_count += 1
        
        saved_entries.append(entry)
    try:
        db.commit()
    except Exception as e:
        logger.error("DB error in select_onboarding_words: %s", e)
        db.rollback()

    words_out = [LexiconEntry.model_validate(entry) for entry in saved_entries]
    return {"words": [w.model_dump() for w in words_out]}


@router.get("/words/{user_id}")
def get_onboarding_words(
    user_id: str,
    study_phase: int = 1,
    db: Session = Depends(get_db),
):
    words = _phase_words(db, user_id, study_phase)
    if not words:
        raise HTTPException(status_code=404, detail="No words found for this vocabulary set.")

    return {"words": words}





@router.get("/words/{user_id}/status")
def get_onboarding_word_status(
    user_id: str,
    study_phase: int = 1,
    db: Session = Depends(get_db),
):
    phase_word_ids = [
        row.word_id
        for row in db.query(OnboardingWords)
        .filter(
            OnboardingWords.user_id == user_id,
            OnboardingWords.study_phase == study_phase,
        )
        .order_by(OnboardingWords.id.asc())
        .all()
    ]

    # Count words explicitly flagged to be tested (user clicked "Add to learn")
    # Strictly check that the word successfully saved to UserVocabularyVector as LEARNING
    from app.models import UserVocabularyVector, VocabStatus
    to_be_tested_count = (
        db.query(OnboardingWords)
        .join(
            UserVocabularyVector,
            (OnboardingWords.user_id == UserVocabularyVector.user_id) &
            (OnboardingWords.word_id == UserVocabularyVector.word_id)
        )
        .filter(
            OnboardingWords.user_id == user_id,
            OnboardingWords.study_phase == study_phase,
            OnboardingWords.is_to_be_tested == True,
            UserVocabularyVector.status == VocabStatus.LEARNING,
        )
        .count()
    )

    return {
        "study_phase": study_phase,
        "target_count": VOCAB_TEST_WORD_COUNT,
        "selected_count": min(len(phase_word_ids), VOCAB_TEST_WORD_COUNT),
        "learning_count": to_be_tested_count,
        "ready": to_be_tested_count >= VOCAB_TEST_WORD_COUNT,
    }
