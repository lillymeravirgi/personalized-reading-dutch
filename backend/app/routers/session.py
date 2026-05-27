"""
session.py — Reading session endpoints.

Reading flow:
  - /generate:  Create a new session. Enforces that the previous session's survey
                must be completed before generating the next one (up to reading 3).
  - /continue:  Extend from a previous session (same topic/condition).
  - /list:      List all sessions for a user.
  - /{id}:      Fetch full session with word_translations.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lexicon, ReadingSession, RecommendedVocabulary, UserVocabularyVector
from app.schemas import GenerateSessionRequest, GenerateSessionResponse, SessionDetailResponse, WordInfo
from app.session_generator import (
    GenerationFailedError,
    GenerationRateLimitError,
    generate_session,
    generate_continuation,
)

router = APIRouter(prefix="/session", tags=["Session"])

MAX_GATED_READINGS = 3  # survey gate applies only for readings 1–3


import re

def _build_word_list(rows) -> list[dict]:
    return [
        {
            "word_id":    row.lexicon_entry.word_id,
            "word":       row.lexicon_entry.word,
            "translation":row.lexicon_entry.translation,
            "cefr_level": row.lexicon_entry.cefr_level,
            "examples":   row.lexicon_entry.examples or [],
        }
        for row in rows
    ]

def _tokenize_content(content: str, blue_words: list, yellow_words: list) -> list[dict]:
    """
    Tokenizes content into words, spaces, and punctuation.
    Assigns status (new, learning, known) and word_id where applicable.
    """
    word_map = {}
    for w in blue_words:
        word_map[w["word"].lower()] = {"word_id": w["word_id"], "status": "new"}
    for w in yellow_words:
        word_map[w["word"].lower()] = {"word_id": w["word_id"], "status": "learning"}

    # Pattern splits by [[word]], keeping the delimiters
    parts = re.split(r"(\[\[[^\]]+\]\])", content or "")
    tokens = []

    for part in parts:
        if not part:
            continue
        if part.startswith("[[") and part.endswith("]]"):
            raw_word = part[2:-2]
            low = raw_word.lower()
            match = word_map.get(low)
            tokens.append({
                "text": raw_word,
                "type": "word",
                "status": match["status"] if match else "new",
                "word_id": match["word_id"] if match else None
            })
        else:
            # Plain text: split by non-word characters while preserving them
            # Including Dutch characters: \u00C0-\u017F
            sub_parts = re.split(r"([^\w\u00C0-\u017F]+)", part)
            for sp in sub_parts:
                if not sp:
                    continue
                if re.match(r"^[^\w\u00C0-\u017F]+$", sp):
                    t_type = "space" if sp.isspace() else "punctuation"
                    tokens.append({"text": sp, "type": t_type})
                else:
                    low = sp.lower()
                    match = word_map.get(low)
                    tokens.append({
                        "text": sp,
                        "type": "word",
                        "status": match["status"] if match else None,
                        "word_id": match["word_id"] if match else None
                    })
    return tokens


@router.post("/generate", response_model=GenerateSessionResponse)
def generate(req: GenerateSessionRequest, db: Session = Depends(get_db)):
    """
    Generate a new reading.
    Blocks if the user has an incomplete survey on their most-recent session
    within the current study phase, and that phase session count is within the
    first 3 readings (same gate applies to both Phase 1 and Phase 2).
    """
    from app.models import User
    req_user = db.query(User).filter(User.user_id == req.user_id).first()
    current_phase = 2 if (req_user and req_user.has_switched_conditions) else 1

    # Gate: check the most-recent session *in the current phase*
    latest = (
        db.query(ReadingSession)
        .filter(
            ReadingSession.user_id  == req.user_id,
            ReadingSession.study_phase == current_phase,
        )
        .order_by(ReadingSession.session_id.desc())
        .first()
    )
    if (
        latest
        and not latest.survey_completed
        and latest.reading_number <= MAX_GATED_READINGS
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Please finish reading #{latest.reading_number} and complete its survey "
                "before generating the next reading. 😊"
            ),
        )

    try:
        result = generate_session(
            user_id=req.user_id,
            K=req.K,
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

    blue_words   = [WordInfo(**w) for w in result["blue_words"]]
    yellow_words = [WordInfo(**w) for w in result["yellow_words"]]

    return GenerateSessionResponse(
        session_id=result["session_id"],
        title=result["title"],
        content=result["content"],
        tokens=_tokenize_content(result["content"], result["blue_words"], result["yellow_words"]),
        topic_used=result["topic_used"],
        blue_words=blue_words,
        yellow_words=yellow_words,
        word_translations=result["word_translations"],
        metadata=result["metadata"],
        reading_number=result["reading_number"],
        condition=result["condition"],
    )


@router.post("/continue", response_model=GenerateSessionResponse)
def continue_reading(payload: dict, db: Session = Depends(get_db)):
    user_id             = payload.get("user_id")
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

    try:
        result = generate_continuation(
            user_id=user_id,
            previous_session=previous,
            condition=previous.condition,
            db=db,
        )
    except GenerationRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except GenerationFailedError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    blue_words = [WordInfo(**w) for w in result["blue_words"]]
    yellow_words = [WordInfo(**w) for w in result["yellow_words"]]

    return GenerateSessionResponse(
        session_id=result["session_id"],
        title=result["title"],
        content=result["content"],
        tokens=_tokenize_content(result["content"], result["blue_words"], result["yellow_words"]),
        topic_used=result["topic_used"],
        blue_words=blue_words,
        yellow_words=yellow_words,
        word_translations=result["word_translations"],
        metadata=result["metadata"],
        reading_number=result["reading_number"],
        condition=result["condition"],
    )


@router.get("/list")
def list_sessions(
    user_id: Optional[str] = None,
    study_phase: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(ReadingSession)
    if user_id:
        q = q.filter(ReadingSession.user_id == user_id)
    if study_phase is not None:
        q = q.filter(ReadingSession.study_phase == study_phase)
    # Sort by newest first
    sessions = q.order_by(ReadingSession.created_at.desc()).all()
    return [
        {
            "session_id":       s.session_id,
            "user_id":          s.user_id,
            "title":            s.title or f"Reading #{s.reading_number}",
            "topic_used":       s.topic_used,
            "condition":        s.condition.value,
            "reading_number":   s.reading_number,
            "study_phase":      s.study_phase,
            "survey_completed": s.survey_completed,
            "created_at":       s.created_at.isoformat() if s.created_at else None,
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

    blue_list = _build_word_list(blue)
    yellow_list = _build_word_list(yellow)

    return {
        "session_id":        session.session_id,
        "title":             session.title or f"Reading #{session.reading_number}",
        "content":           session.content,
        "tokens":            _tokenize_content(session.content, blue_list, yellow_list),
        "topic_used":        session.topic_used,
        "condition":         session.condition.value,
        "reading_number":    session.reading_number,
        "survey_completed":  session.survey_completed,
        "word_translations": session.word_translations or {},
        "blue_words":        blue_list,
        "yellow_words":      yellow_list,
    }
