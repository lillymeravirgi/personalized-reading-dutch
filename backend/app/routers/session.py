from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.models import ReadingSession, RecommendedVocabulary, UserVocabularyVector
from app.schemas import GenerateSessionRequest, GenerateSessionResponse, WordInfo
from app.session_generator import generate_session

router = APIRouter(prefix="/session", tags=["Session"])


# ── Generate ──────────────────────────────────
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


# ── List all sessions ─────────────────────────
@router.get("/list")
def list_sessions(user_id: Optional[str] = None, db: Session = Depends(get_db)):
    """Return all sessions (optional filter by user_id), newest first."""
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


# ── Get a single session ──────────────────────
@router.get("/{session_id}")
def get_session(session_id: int, user_id: str, db: Session = Depends(get_db)):
    """Return full session detail including word lists (for the reader page)."""
    s = db.query(ReadingSession).filter(ReadingSession.session_id == session_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    # Rebuild blue/yellow lists from DB so the reader can highlight correctly
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
        "session_id": s.session_id,
        "title": s.title or f"Session #{s.session_id}",
        "content": s.content,
        "topic_used": s.topic_used,
        "condition": s.condition.value,
        "blue_words": [
            {"word_id": r.lexicon_entry.word_id, "word": r.lexicon_entry.word,
             "translation": r.lexicon_entry.translation, "cefr_level": r.lexicon_entry.cefr_level}
            for r in blue
        ],
        "yellow_words": [
            {"word_id": r.lexicon_entry.word_id, "word": r.lexicon_entry.word,
             "translation": r.lexicon_entry.translation, "cefr_level": r.lexicon_entry.cefr_level}
            for r in yellow
        ],
    }
