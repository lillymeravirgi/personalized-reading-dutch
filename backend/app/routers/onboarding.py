"""
onboarding.py — Endpoints for onboarding completion and 7-word flashcard selection.
"""
import logging
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.krs_service import run_krs
from app.models import Lexicon, OnboardingWords, RecommendedVocabulary, User
from app.schemas import LexiconEntry, OnboardingPersonalInfoRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/onboarding", tags=["Onboarding"])

ONBOARDING_WORD_COUNT = 20


@router.post("/personal-info")
def save_personal_info(payload: OnboardingPersonalInfoRequest, db: Session = Depends(get_db)):
    """Save Step 1 personal info fields to the User table."""
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
    # Self-reported CEFR is the starting point for the assessment
    if payload.self_reported_cefr is not None: user.estimated_cefr    = payload.self_reported_cefr

    db.commit()
    return {"success": True}


@router.post("/words/{user_id}")
def select_onboarding_words(user_id: str, is_refill: bool = False, db: Session = Depends(get_db)):
    """
    After assessment completes, run the KRS and pick words as onboarding flashcards.
    Saves them to OnboardingWords table.
    Returns the LexiconEntry objects.
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Run KRS to populate RecommendedVocabulary
    try:
        run_krs(user_id=user_id, db=db, is_refill=is_refill)
    except Exception as e:
        logger.warning(f"[Onboarding] KRS failed for {user_id}: {e}")

    # Fetch recommended words
    recs = (
        db.query(RecommendedVocabulary)
        .filter(RecommendedVocabulary.user_id == user_id)
        .join(RecommendedVocabulary.lexicon_entry)
        .all()
    )

    # Fall back to lexicon words at user's CEFR level if KRS produced too few
    if len(recs) < ONBOARDING_WORD_COUNT:
        level = user.estimated_cefr or "B1"
        extra = (
            db.query(Lexicon)
            .filter(Lexicon.cefr_level == level)
            .limit(ONBOARDING_WORD_COUNT * 3)
            .all()
        )
        rec_word_ids = {r.word_id for r in recs}
        for lex in extra:
            if lex.word_id not in rec_word_ids and len(recs) < ONBOARDING_WORD_COUNT:
                # wrap in a mock-like object for uniform handling
                class _FakRec:
                    lexicon_entry = lex
                recs.append(_FakRec())

    selected = recs[:ONBOARDING_WORD_COUNT]
    random.shuffle(selected)

    # Persist up to 7 words into OnboardingWords for the vocab test
    # (upsert-safe: skip duplicates)
    VOCAB_TEST_WORD_COUNT = 7
    saved_count = 0
    for rec in selected:
        if saved_count >= VOCAB_TEST_WORD_COUNT:
            break
        word_id = rec.lexicon_entry.word_id
        already = (
            db.query(OnboardingWords)
            .filter(OnboardingWords.user_id == user_id, OnboardingWords.word_id == word_id)
            .first()
        )
        if not already:
            db.add(OnboardingWords(user_id=user_id, word_id=word_id))
            saved_count += 1
    try:
        db.commit()
    except Exception:
        db.rollback()

    words_out = [
        LexiconEntry.model_validate(rec.lexicon_entry)
        for rec in selected
    ]
    return {"words": [w.model_dump() for w in words_out]}


@router.get("/words/{user_id}")
def get_onboarding_words(user_id: str, db: Session = Depends(get_db)):
    """Retrieve the onboarding words for a user."""
    rows = (
        db.query(OnboardingWords)
        .filter(OnboardingWords.user_id == user_id)
        .join(OnboardingWords.lexicon_entry)
        .order_by(OnboardingWords.id.asc())
        .limit(ONBOARDING_WORD_COUNT)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No onboarding words found for this user.")

    return {
        "words": [
            LexiconEntry.model_validate(row.lexicon_entry).model_dump()
            for row in rows
        ]
    }
