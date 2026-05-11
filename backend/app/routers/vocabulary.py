from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lexicon, RecommendedVocabulary, UserVocabularyVector, VocabStatus
from app.schemas import AddToLearnRequest, LexiconEntry

router = APIRouter(prefix="/vocab", tags=["Vocabulary"])


class PlainWordRequest(BaseModel):
    user_id: str
    word: str
    english: str | None = None


@router.get("/word/{word_id}", response_model=LexiconEntry)
def get_word(word_id: int, db: Session = Depends(get_db)):
    entry = db.query(Lexicon).filter(Lexicon.word_id == word_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail=f"word_id={word_id} not found in lexicon")
    return LexiconEntry.model_validate(entry)


import datetime

def _add_vector(user_id: str, word_id: int, db: Session, interval_days: int | None = None) -> None:
    existing = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.word_id == word_id,
        )
        .first()
    )
    if existing:
        existing.exposure_count += 1
        if existing.status != VocabStatus.MASTERED:
            existing.status = VocabStatus.LEARNING
        vector = existing
    else:
        vector = UserVocabularyVector(
            user_id=user_id,
            word_id=word_id,
            status=VocabStatus.LEARNING,
            mastery_score=0.0,
            exposure_count=1,
        )
        db.add(vector)

    if interval_days is not None:
        vector.review_interval_days = interval_days
        if interval_days == 0:
            # Set to 1 minute ago so it is definitely "Due" immediately
            vector.next_review_at = datetime.datetime.utcnow() - datetime.timedelta(minutes=1)
        else:
            vector.next_review_at = datetime.datetime.utcnow() + datetime.timedelta(days=interval_days)

    # FIX 2: Evict from reservoir — keeps the low-watermark count accurate
    db.query(RecommendedVocabulary).filter(
        RecommendedVocabulary.user_id == user_id,
        RecommendedVocabulary.word_id == word_id,
    ).delete(synchronize_session=False)


@router.patch("/add-to-learn")
def add_to_learn(req: AddToLearnRequest, db: Session = Depends(get_db)):
    lex = db.query(Lexicon).filter(Lexicon.word_id == req.word_id).first()
    if not lex:
        raise HTTPException(status_code=404, detail="Word not found in lexicon")

    try:
        _add_vector(req.user_id, req.word_id, db, req.review_interval_days)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {"success": True, "message": f"'{lex.word}' added to learning list"}


class MarkKnownRequest(BaseModel):
    user_id: str
    word_id: int

@router.patch("/mark-known")
def mark_known(req: MarkKnownRequest, db: Session = Depends(get_db)):
    # Add or update to MASTERED
    existing = db.query(UserVocabularyVector).filter(
        UserVocabularyVector.user_id == req.user_id,
        UserVocabularyVector.word_id == req.word_id,
    ).first()

    if existing:
        existing.status = VocabStatus.MASTERED
        existing.mastery_score = 1.0
    else:
        db.add(
            UserVocabularyVector(
                user_id=req.user_id,
                word_id=req.word_id,
                status=VocabStatus.MASTERED,
                mastery_score=1.0,
                exposure_count=1,
            )
        )

    # FIX 2: Evict from reservoir
    db.query(RecommendedVocabulary).filter(
        RecommendedVocabulary.user_id == req.user_id,
        RecommendedVocabulary.word_id == req.word_id,
    ).delete(synchronize_session=False)

    db.commit()
    return {"success": True}


@router.patch("/add-plain-word")
def add_plain_word(req: PlainWordRequest, db: Session = Depends(get_db)):
    clean_word = req.word.strip().lower()
    if not req.user_id:
        raise HTTPException(status_code=401, detail="Missing user_id")
    if not clean_word:
        raise HTTPException(status_code=422, detail="word is required")

    lex = db.query(Lexicon).filter(Lexicon.word == clean_word).first()
    if not lex:
        lex = Lexicon(
            word=clean_word,
            translation=req.english or "unknown",
            cefr_level="B1",
            examples=[],
            use_cases=[],
        )
        db.add(lex)
        db.flush()

    try:
        _add_vector(req.user_id, lex.word_id, db)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {"success": True, "word_id": lex.word_id}
