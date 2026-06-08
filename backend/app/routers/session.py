import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ConditionType,
    Lexicon,
    OnboardingWords,
    ReadingSession,
    User,
    UserVocabularyVector,
    VocabularyTestResult,
    VocabStatus,
)
from app.schemas import GenerateSessionRequest, GenerateSessionResponse, WordInfo
from app.session_generator import (
    GenerationFailedError,
    GenerationRateLimitError,
    generate_session,
    generate_continuation,
)

router = APIRouter(prefix="/session", tags=["Session"])

READINGS_PER_PHASE = 3
FINAL_STUDY_PHASE = 2
TARGET_WORDS_PER_PHASE = 10


def _build_word_list(rows) -> list[dict]:
    return [
        _word_info(row.lexicon_entry)
        for row in rows
    ]


def _word_info(entry) -> dict:
    return {
        "word_id":    entry.word_id,
        "word":       entry.word,
        "translation":entry.translation,
        "cefr_level": entry.cefr_level,
        "examples":   entry.examples or [],
    }


def _build_lexicon_word_list(rows) -> list[dict]:
    return [
        {
            "word_id":    row.word_id,
            "word":       row.word,
            "translation":row.translation,
            "cefr_level": row.cefr_level,
            "examples":   row.examples or [],
        }
        for row in rows
    ]


def _phase_word_set_ready(db: Session, user_id: str, study_phase: int) -> bool:
    word_ids = [
        row.word_id
        for row in db.query(OnboardingWords)
        .filter(
            OnboardingWords.user_id == user_id,
            OnboardingWords.study_phase == study_phase,
        )
        .order_by(OnboardingWords.id.asc())
        .all()
    ]
    if len(word_ids) < TARGET_WORDS_PER_PHASE:
        return False

    learned_count = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.word_id.in_(word_ids),
            UserVocabularyVector.status.in_([VocabStatus.LEARNING, VocabStatus.MASTERED]),
        )
        .count()
    )
    return learned_count >= TARGET_WORDS_PER_PHASE

def _tokenize_content(content: str, blue_words: list, yellow_words: list) -> list[dict]:
    word_map = {}
    for w in blue_words:
        word_map[w["word"].lower()] = {"word_id": w["word_id"], "status": "new"}
    for w in yellow_words:
        word_map[w["word"].lower()] = {"word_id": w["word_id"], "status": "learning"}

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
                "status": match["status"] if match else None,
                "word_id": match["word_id"] if match else None
            })
        else:
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
    req_user = db.query(User).filter(User.user_id == req.user_id).first()
    if not req_user:
        raise HTTPException(status_code=404, detail="User not found")

    current_phase = 2 if req_user.has_switched_conditions else 1
    server_condition = req_user.current_condition

    latest = (
        db.query(ReadingSession)
        .filter(
            ReadingSession.user_id == req.user_id,
            ReadingSession.study_phase == current_phase,
        )
        .order_by(ReadingSession.session_id.desc())
        .first()
    )
    if (
        latest
        and not latest.survey_completed
        and latest.reading_number <= READINGS_PER_PHASE
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Please finish reading #{latest.reading_number} and complete its survey "
                "before generating the next reading."
            ),
        )
    if latest and latest.survey_completed and latest.reading_number >= READINGS_PER_PHASE:
        checked = (
            db.query(VocabularyTestResult.id)
            .filter(
                VocabularyTestResult.user_id == req.user_id,
                VocabularyTestResult.study_phase == current_phase,
                VocabularyTestResult.test_type == "immediate",
            )
            .first()
        )
        if not checked:
            raise HTTPException(
                status_code=409,
                detail=f"Please complete the vocabulary check for phase {current_phase} before the next readings.",
            )
        if current_phase >= FINAL_STUDY_PHASE:
            raise HTTPException(
                status_code=409,
                detail="All study readings are complete.",
            )

    if not _phase_word_set_ready(db, req.user_id, current_phase):
        raise HTTPException(
            status_code=409,
            detail=f"Please complete the Phase {current_phase} word set before generating readings.",
        )

    try:
        result = generate_session(
            user_id=req.user_id,
            K=req.K,
            narrative_style=req.narrative_style,
            word_count_range=req.word_count_range,
            condition=server_condition,
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
    if previous.user_id != user_id:
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

    user = db.query(User).filter(User.user_id == user_id).first()

    # Build a comprehensive word list from ALL accumulated word_translations
    # so that _tokenize_content correctly highlights [[words]] from previous
    # sessions that are now part of the full accumulated content string.
    study_phase = previous.study_phase
    phase_word_ids = [
        row.word_id for row in db.query(OnboardingWords)
        .filter(
            OnboardingWords.user_id == user_id,
            OnboardingWords.study_phase == study_phase,
        ).all()
    ]
    yellow_vector_ids = set()
    for w in yellow_words:
        yellow_vector_ids.add(w.word_id)

    all_translations = result["word_translations"]  # already merged dict
    if all_translations:
        from sqlalchemy import func
        all_word_texts = [w.lower() for w in all_translations.keys()]
        lex_rows = db.query(Lexicon).filter(func.lower(Lexicon.word).in_(all_word_texts)).all()
        lex_by_word = {row.word.lower(): row for row in lex_rows}

        all_blue_words_for_tok = []
        all_yellow_words_for_tok = []
        for word_text, translation in all_translations.items():
            lex = lex_by_word.get(word_text.lower())
            if lex is None:
                continue
            entry = {
                "word_id": lex.word_id,
                "word": lex.word,
                "translation": translation,
                "cefr_level": lex.cefr_level,
                "examples": lex.examples or [],
            }
            if lex.word_id in yellow_vector_ids or lex.word_id in phase_word_ids:
                all_yellow_words_for_tok.append(entry)
            else:
                all_blue_words_for_tok.append(entry)
        tokens = _tokenize_content(result["content"], all_blue_words_for_tok, all_yellow_words_for_tok)
    else:
        tokens = _tokenize_content(result["content"], result["blue_words"], result["yellow_words"])

    return GenerateSessionResponse(
        session_id=result["session_id"],
        title=result["title"],
        content=result["content"],
        tokens=tokens,
        topic_used=result["topic_used"],
        blue_words=blue_words,
        yellow_words=yellow_words,
        word_translations=result["word_translations"],
        metadata=result["metadata"],
        reading_number=result["reading_number"],
        cefr_level=user.estimated_cefr if user else None,
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
    sessions = q.order_by(ReadingSession.created_at.desc()).all()
    return [
        {
            "session_id":       s.session_id,
            "user_id":          s.user_id,
            "title":            s.title or f"Reading #{s.reading_number}",
            "topic_used":       s.topic_used,
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
    if session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")

    phase_word_ids = [
        row.word_id
        for row in db.query(OnboardingWords)
        .filter(
            OnboardingWords.user_id == user_id,
            OnboardingWords.study_phase == session.study_phase,
        )
        .all()
    ]
    yellow = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.word_id.in_(phase_word_ids),
        )
        .join(UserVocabularyVector.lexicon_entry)
        .all()
    ) if phase_word_ids else []

    if session.condition == ConditionType.BASELINE:
        yellow_list = []
    else:
        yellow_list = _build_word_list(yellow)

    yellow_words = {item["word"].lower() for item in yellow_list}
    session_words = set()
    session_words.update(
        str(word).lower()
        for word in (session.word_translations or {}).keys()
    )
    session_words.update(
        word.lower()
        for word in re.findall(r"\[\[([^\]]+)\]\]", session.content or "")
    )
    blue_keys = sorted(session_words - yellow_words)
    if blue_keys:
        from sqlalchemy import func
        blue_entries = (
            db.query(Lexicon)
            .filter(func.lower(Lexicon.word).in_(blue_keys))
            .all()
        )
    else:
        blue_entries = []
    blue_list = _build_lexicon_word_list(blue_entries)

    user = db.query(User).filter(User.user_id == session.user_id).first()

    return {
        "session_id":        session.session_id,
        "title":             session.title or f"Reading #{session.reading_number}",
        "content":           session.content,
        "tokens":            _tokenize_content(session.content, blue_list, yellow_list),
        "topic_used":        session.topic_used,
        "reading_number":    session.reading_number,
        "survey_completed":  session.survey_completed,
        "word_translations": session.word_translations or {},
        "blue_words":        blue_list,
        "yellow_words":      yellow_list,
        "cefr_level":        user.estimated_cefr if user else None,
    }
