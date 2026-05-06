from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lexicon, User, UserVocabularyVector, VocabStatus

router = APIRouter(prefix="/assessment", tags=["Assessment"])

WORDS_PER_BATCH = 10
PSEUDO_WORDS = ["mivelen", "drokkel", "plinterig", "zomberen", "kluftig"]


class AssessmentSubmitRequest(BaseModel):
    user_id: str
    known_word_ids: list[str]
    unknown_word_ids: list[str]
    estimated_level: str
    confidence_score: float


@router.get("/batch/{batch_number}")
def get_batch(batch_number: int, db: Session = Depends(get_db)):
    if batch_number < 1:
        raise HTTPException(status_code=404, detail="Batch not found")

    words = db.query(Lexicon).order_by(Lexicon.word_id).all()
    total_real_batches = max(1, (len(words) + WORDS_PER_BATCH - 1) // WORDS_PER_BATCH)
    start = (batch_number - 1) * WORDS_PER_BATCH
    batch_words = words[start : start + WORDS_PER_BATCH]
    if not batch_words and batch_number > total_real_batches:
        raise HTTPException(status_code=404, detail="Batch not found")

    payload_words = [
        {
            "word_id": str(word.word_id),
            "dutch": word.word,
            "english": word.translation,
            "is_pseudo": False,
        }
        for word in batch_words
    ]

    if batch_number == total_real_batches:
        payload_words.extend(
            {
                "word_id": f"pseudo-{i}",
                "dutch": word,
                "english": None,
                "is_pseudo": True,
            }
            for i, word in enumerate(PSEUDO_WORDS, start=1)
        )

    return {
        "batch_number": batch_number,
        "total_batches": total_real_batches,
        "words": payload_words,
    }


@router.post("/submit")
def submit_assessment(payload: AssessmentSubmitRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.estimated_cefr = payload.estimated_level

    for raw_id in payload.known_word_ids:
        if not raw_id.isdigit():
            continue
        word_id = int(raw_id)
        existing = (
            db.query(UserVocabularyVector)
            .filter(
                UserVocabularyVector.user_id == payload.user_id,
                UserVocabularyVector.word_id == word_id,
            )
            .first()
        )
        if existing:
            existing.status = VocabStatus.MASTERED
            existing.mastery_score = max(existing.mastery_score, 0.9)
        else:
            db.add(
                UserVocabularyVector(
                    user_id=payload.user_id,
                    word_id=word_id,
                    status=VocabStatus.MASTERED,
                    mastery_score=0.9,
                    exposure_count=1,
                )
            )

    db.commit()
    return {"success": True}
