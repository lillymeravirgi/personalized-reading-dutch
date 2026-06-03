import logging
import random

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.krs_service import run_krs
from app.models import Lexicon, OnboardingWords, RecommendedVocabulary, User, UserVocabularyVector, VocabStatus
from app.schemas import LexiconEntry, OnboardingPersonalInfoRequest

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
        logger.warning(f"[Onboarding] Background KRS failed for {user_id}: {e}")
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


@router.post("/personal-info")
def save_personal_info(payload: OnboardingPersonalInfoRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.display_name       is not None: user.display_name       = payload.display_name
    if payload.age                is not None: user.age                = payload.age
    if payload.city               is not None: user.city               = payload.city
    if payload.gender             is not None: user.gender             = payload.gender
    if payload.job                is not None: user.job                = payload.job
    if payload.academic_background is not None: user.academic_background = payload.academic_background
    if payload.mother_language    is not None: user.mother_language    = payload.mother_language
    if payload.other_languages    is not None: user.other_languages    = payload.other_languages
    if payload.purpose            is not None: user.purpose            = payload.purpose
    if payload.preferred_styles   is not None: user.preferred_styles   = payload.preferred_styles
    if payload.self_reported_cefr is not None: user.estimated_cefr    = payload.self_reported_cefr

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

    background_tasks.add_task(_run_krs_background, user_id, is_refill)

    recs = (
        db.query(RecommendedVocabulary)
        .filter(RecommendedVocabulary.user_id == user_id)
        .join(RecommendedVocabulary.lexicon_entry)
        .all()
    )

    if len(recs) < ONBOARDING_WORD_COUNT:
        level = user.estimated_cefr or "B1"
        extra = (
            db.query(Lexicon)
            .filter(Lexicon.cefr_level == level)
            .limit(ONBOARDING_WORD_COUNT * 3)
            .all()
        )
        rec_word_ids = {r.word_id for r in recs}

        used_ids = {
            ow.word_id for ow in
            db.query(OnboardingWords)
            .filter(OnboardingWords.user_id == user_id)
            .all()
        }
        rec_word_ids |= used_ids

        for lex in extra:
            if lex.word_id not in rec_word_ids and len(recs) < ONBOARDING_WORD_COUNT:
                class _FakRec:
                    lexicon_entry = lex
                recs.append(_FakRec())

    selected = recs[:ONBOARDING_WORD_COUNT]
    random.shuffle(selected)

    used_ids = {
        ow.word_id for ow in
        db.query(OnboardingWords)
        .filter(OnboardingWords.user_id == user_id)
        .all()
    }

    saved_count = 0
    for rec in selected:
        if saved_count >= PHASE_BUFFER_WORD_COUNT:
            break
        word_id = rec.lexicon_entry.word_id
        if word_id in used_ids:
            continue
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
    try:
        db.commit()
    except Exception:
        db.rollback()

    words_out = [LexiconEntry.model_validate(rec.lexicon_entry) for rec in selected]
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

    learning_count = 0
    if len(phase_word_ids) >= VOCAB_TEST_WORD_COUNT:
        learning_count = (
            db.query(UserVocabularyVector)
            .filter(
                UserVocabularyVector.user_id == user_id,
                UserVocabularyVector.word_id.in_(phase_word_ids),
                UserVocabularyVector.status.in_([VocabStatus.LEARNING, VocabStatus.MASTERED]),
            )
            .count()
        )

    return {
        "study_phase": study_phase,
        "target_count": VOCAB_TEST_WORD_COUNT,
        "selected_count": min(len(phase_word_ids), VOCAB_TEST_WORD_COUNT),
        "learning_count": learning_count,
        "ready": len(phase_word_ids) >= VOCAB_TEST_WORD_COUNT and learning_count >= VOCAB_TEST_WORD_COUNT,
    }
