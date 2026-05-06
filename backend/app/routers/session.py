from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ReadingSession, RecommendedVocabulary, UserVocabularyVector
from app.schemas import GenerateSessionRequest, GenerateSessionResponse, WordInfo
from app.session_generator import (
    GenerationFailedError,
    GenerationRateLimitError,
    generate_session,
)

router = APIRouter(prefix="/session", tags=["Session"])


@router.post("/generate", response_model=GenerateSessionResponse)
def generate(req: GenerateSessionRequest, db: Session = Depends(get_db)):
    try:
        result = generate_session(
            user_id=req.user_id,
            K=req.K,
            narrative_style=req.narrative_style,
            word_count_range=req.word_count_range,
            condition=req.condition,
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except GenerationRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except GenerationFailedError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return GenerateSessionResponse(
        session_id=result["session_id"],
        title=result["title"],
        content=result["content"],
        topic_used=result["topic_used"],
        blue_words=[WordInfo(**w) for w in result["blue_words"]],
        yellow_words=[WordInfo(**w) for w in result["yellow_words"]],
        metadata=result["metadata"],
    )


@router.post("/continue", response_model=GenerateSessionResponse)
def continue_reading(payload: dict, db: Session = Depends(get_db)):
    user_id = payload.get("user_id")
    previous_session_id = payload.get("previous_session_id")
    if not user_id or previous_session_id is None:
        raise HTTPException(status_code=422, detail="user_id and previous_session_id are required")

    previous = (
        db.query(ReadingSession)
        .filter(ReadingSession.session_id == int(previous_session_id))
        .first()
    )
    if not previous:
        raise HTTPException(status_code=404, detail="Previous session not found")

    req = GenerateSessionRequest(user_id=user_id, condition=previous.condition)
    return generate(req, db)


@router.get("/list")
def list_sessions(user_id: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(ReadingSession)
    if user_id:
        q = q.filter(ReadingSession.user_id == user_id)
    sessions = q.order_by(ReadingSession.session_id.desc()).all()
    return [
        {
            "session_id": s.session_id,
            "user_id": s.user_id,
            "title": s.title or f"Session #{s.session_id}",
            "topic_used": s.topic_used,
            "condition": s.condition.value,
        }
        for s in sessions
    ]


@router.get("/{session_id}")
def get_session(session_id: int, user_id: str, db: Session = Depends(get_db)):
    session = db.query(ReadingSession).filter(ReadingSession.session_id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    blue = (
        db.query(RecommendedVocabulary)
        .filter(RecommendedVocabulary.user_id == user_id)
        .join(RecommendedVocabulary.lexicon_entry)
        .all()
    )
    yellow = (
        db.query(UserVocabularyVector)
        .filter(UserVocabularyVector.user_id == user_id)
        .join(UserVocabularyVector.lexicon_entry)
        .all()
    )

    return {
        "session_id": session.session_id,
        "title": session.title or f"Session #{session.session_id}",
        "content": session.content,
        "topic_used": session.topic_used,
        "condition": session.condition.value,
        "blue_words": [
            {
                "word_id": row.lexicon_entry.word_id,
                "word": row.lexicon_entry.word,
                "translation": row.lexicon_entry.translation,
                "cefr_level": row.lexicon_entry.cefr_level,
                "examples": row.lexicon_entry.examples or [],
            }
            for row in blue
        ],
        "yellow_words": [
            {
                "word_id": row.lexicon_entry.word_id,
                "word": row.lexicon_entry.word,
                "translation": row.lexicon_entry.translation,
                "cefr_level": row.lexicon_entry.cefr_level,
                "examples": row.lexicon_entry.examples or [],
            }
            for row in yellow
        ],
    }
