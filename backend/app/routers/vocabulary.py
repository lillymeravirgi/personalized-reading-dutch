from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lexicon, UserVocabularyVector, VocabStatus
from app.schemas import AddToLearnRequest, LexiconEntry

router = APIRouter(prefix="/vocab", tags=["Vocabulary"])


@router.get("/word/{word_id}", response_model=LexiconEntry)
def get_word(word_id: int, db: Session = Depends(get_db)):
    entry = db.query(Lexicon).filter(Lexicon.word_id == word_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail=f"word_id={word_id} not found in lexicon")
    return LexiconEntry.model_validate(entry)


@router.patch("/add-to-learn")
def add_to_learn(req: AddToLearnRequest, db: Session = Depends(get_db)):
    """
    Upsert a word into the user's vocabulary vector with status=LEARNING.
    Also logs ACQUISITION_INTENT — this endpoint should be called alongside
    the telemetry/log endpoint from the frontend.
    """
    # Verify word exists
    lex = db.query(Lexicon).filter(Lexicon.word_id == req.word_id).first()
    if not lex:
        raise HTTPException(status_code=404, detail="Word not found in lexicon")

    existing = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == req.user_id,
            UserVocabularyVector.word_id == req.word_id,
        )
        .first()
    )

    if existing:
        existing.exposure_count += 1
        # Only upgrade — never downgrade from MASTERED
        if existing.status != VocabStatus.MASTERED:
            existing.status = VocabStatus.LEARNING
    else:
        db.add(
            UserVocabularyVector(
                user_id=req.user_id,
                word_id=req.word_id,
                status=VocabStatus.LEARNING,
                mastery_score=0.0,
                exposure_count=1,
            )
        )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return {"message": f"'{lex.word}' added to learning list for user {req.user_id}"}
