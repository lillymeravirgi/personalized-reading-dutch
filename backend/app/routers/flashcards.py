from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserVocabularyVector, VocabStatus

router = APIRouter(prefix="/flashcards", tags=["Flashcards"])


def _example(entry) -> dict:
    examples = entry.examples or []
    if examples and isinstance(examples, list):
        first = examples[0]
        if isinstance(first, dict) and "nl" in first and "en" in first:
            return first
    return {"nl": entry.word, "en": entry.translation}


@router.get("")
def list_flashcards(user_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(UserVocabularyVector)
        .filter(UserVocabularyVector.user_id == user_id)
        .join(UserVocabularyVector.lexicon_entry)
        .all()
    )
    return [
        {
            "word_id": str(row.lexicon_entry.word_id),
            "dutch": row.lexicon_entry.word,
            "english": row.lexicon_entry.translation,
            "example_sentence": _example(row.lexicon_entry),
            "difficulty": max(0.0, min(1.0, 1.0 - row.mastery_score)),
            "mode": "review" if row.status == VocabStatus.MASTERED else "learning",
            "next_review_date": None,
            "review_interval": None,
        }
        for row in rows
    ]


@router.post("/review")
def review_flashcard(
    user_id: str,
    word_id: int,
    remembered: bool,
    db: Session = Depends(get_db),
):
    row = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.word_id == word_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    row.exposure_count += 1
    if remembered:
        row.mastery_score = min(1.0, row.mastery_score + 0.25)
        if row.mastery_score >= 0.75:
            row.status = VocabStatus.MASTERED
    else:
        row.mastery_score = max(0.0, row.mastery_score - 0.2)
        row.status = VocabStatus.LEARNING

    db.commit()
    return {"success": True}
