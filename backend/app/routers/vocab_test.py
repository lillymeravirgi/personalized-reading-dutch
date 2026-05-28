"""Vocabulary tests for the reading study."""
import datetime
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import DELAYED_VOCAB_TEST_MINUTES
from app.database import get_db
from app.models import ConditionType, Lexicon, OnboardingWords, User, VocabularyTestResult
from app.schemas import VocabTestSubmitRequest

router = APIRouter(prefix="/vocab-test", tags=["VocabTest"])

VOCAB_TEST_WORD_COUNT = 10


@router.get("/progress")
def vocab_test_progress(user_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(VocabularyTestResult.study_phase, VocabularyTestResult.test_type)
        .filter(VocabularyTestResult.user_id == user_id)
        .all()
    )
    immediate = sorted({phase for phase, test_type in rows if test_type == "immediate"})
    delayed = sorted({phase for phase, test_type in rows if test_type == "delayed"})
    return {
        "immediate_completed": immediate,
        "delayed_completed": delayed,
    }


@router.get("/start")
def start_vocab_test(
    user_id: str,
    session_group_id: int,
    study_phase: int = 1,
    db: Session = Depends(get_db),
):
    """Generate the vocab test from the user's saved words for this phase."""
    try:
        rows = (
            db.query(OnboardingWords)
            .filter(
                OnboardingWords.user_id   == user_id,
                OnboardingWords.study_phase == study_phase,
            )
            .join(OnboardingWords.lexicon_entry)
            .order_by(OnboardingWords.id.asc())
            .limit(VOCAB_TEST_WORD_COUNT)
            .all()
        )

        if not rows:
            user = db.query(User).filter(User.user_id == user_id).first()
            level = user.estimated_cefr if user and user.estimated_cefr else "B1"
            lex_rows = (
                db.query(Lexicon)
                .filter(Lexicon.cefr_level == level)
                .limit(50)
                .all()
            )
            random.shuffle(lex_rows)
            lex_rows = lex_rows[:VOCAB_TEST_WORD_COUNT]

            if not lex_rows:
                raise HTTPException(
                    status_code=404,
                    detail="No vocabulary words available for this user. Please complete onboarding first.",
                )

            for lex in lex_rows:
                exists = (
                    db.query(OnboardingWords)
                    .filter(
                        OnboardingWords.user_id == user_id,
                        OnboardingWords.word_id == lex.word_id,
                    )
                    .first()
                )
                if not exists:
                    db.add(OnboardingWords(
                        user_id=user_id,
                        word_id=lex.word_id,
                        study_phase=study_phase,
                    ))
            try:
                db.commit()
            except Exception:
                db.rollback()

            class _MockRow:
                def __init__(self, lex):
                    self.lexicon_entry = lex
            rows = [_MockRow(lex) for lex in lex_rows]

        questions = []
        for idx, row in enumerate(rows):
            word = row.lexicon_entry
            distractors = _get_distractors(word.translation, word.cefr_level, db)
            correct_index = idx % 4
            options = list(distractors)
            options.insert(correct_index, word.translation)

            questions.append({
                "questionId":   f"{session_group_id}-{word.word_id}",
                "wordId":       str(word.word_id),
                "dutch":        word.word,
                "prompt":       f"What does '{word.word}' mean?",
                "options":      options,
                "correctIndex": correct_index,
            })

        return {
            "success": True,
            "data": {
                "sessionGroupId": session_group_id,
                "studyPhase":     study_phase,
                "questions":      questions,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Could not generate vocabulary test: {str(e)}"
        )


@router.post("/submit")
def submit_vocab_test(payload: VocabTestSubmitRequest, db: Session = Depends(get_db)):
    """
    Persist per-word results and total score.
    Phase 1 switches the user into the other reading condition.
    """
    test_type = payload.test_type.lower()
    if test_type not in {"immediate", "delayed"}:
        raise HTTPException(status_code=400, detail="Unknown vocabulary test type.")

    last_index = len(payload.answers) - 1
    for index, answer in enumerate(payload.answers):
        word_id_raw = answer.get("word_id", "")
        if not str(word_id_raw).isdigit():
            continue
        word_id = int(word_id_raw)
        db.add(VocabularyTestResult(
            user_id=payload.user_id,
            session_group_id=payload.session_group_id,
            study_phase=payload.study_phase,
            test_type=test_type,
            word_id=word_id,
            chosen_answer=str(answer.get("chosen_answer", "")),
            is_correct=bool(answer.get("is_correct", False)),
            score=payload.score if index == last_index else None,
        ))

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    if test_type == "delayed":
        return {
            "success":     True,
            "score":       payload.score,
            "total":       len(payload.answers),
            "next_action": "finish",
        }

    if not payload.is_final:
        user = db.query(User).filter(User.user_id == payload.user_id).first()
        if user and not user.has_switched_conditions:
            user.current_condition = (
                ConditionType.BASELINE
                if user.current_condition == ConditionType.ADAPTIVE
                else ConditionType.ADAPTIVE
            )
            user.has_switched_conditions = True
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                raise HTTPException(status_code=500, detail=str(e))

        return {
            "success":       True,
            "score":         payload.score,
            "total":         len(payload.answers),
            "next_action":   "transition",
            "new_condition": user.current_condition.value if user else None,
        }

    return {
        "success":     True,
        "score":       payload.score,
        "total":       len(payload.answers),
        "next_action": "finish",
    }


@router.get("/delayed-status")
def delayed_vocab_status(user_id: str, db: Session = Depends(get_db)):
    now = datetime.datetime.utcnow()
    immediate_rows = (
        db.query(VocabularyTestResult)
        .filter(
            VocabularyTestResult.user_id == user_id,
            VocabularyTestResult.test_type == "immediate",
        )
        .all()
    )

    completed: dict[tuple[int, int], datetime.datetime] = {}
    for row in immediate_rows:
        key = (row.session_group_id, row.study_phase)
        if row.timestamp and (key not in completed or row.timestamp > completed[key]):
            completed[key] = row.timestamp

    due_tests: list[tuple[datetime.datetime, int, int]] = []
    next_due_at: datetime.datetime | None = None

    for (session_group_id, study_phase), submitted_at in completed.items():
        delayed_exists = (
            db.query(VocabularyTestResult.id)
            .filter(
                VocabularyTestResult.user_id == user_id,
                VocabularyTestResult.session_group_id == session_group_id,
                VocabularyTestResult.study_phase == study_phase,
                VocabularyTestResult.test_type == "delayed",
            )
            .first()
        )
        if delayed_exists:
            continue

        due_at = submitted_at + datetime.timedelta(minutes=DELAYED_VOCAB_TEST_MINUTES)
        if now >= due_at:
            due_tests.append((due_at, session_group_id, study_phase))
        elif next_due_at is None or due_at < next_due_at:
            next_due_at = due_at

    if due_tests:
        due_at, session_group_id, study_phase = sorted(due_tests, key=lambda item: item[0])[0]
        return {
            "due": True,
            "session_group_id": session_group_id,
            "study_phase": study_phase,
            "due_at": due_at.isoformat(),
            "minutes_remaining": 0,
            "delay_minutes": DELAYED_VOCAB_TEST_MINUTES,
        }

    minutes_remaining = None
    if next_due_at:
        minutes_remaining = max(0, int((next_due_at - now).total_seconds() // 60))

    return {
        "due": False,
        "session_group_id": None,
        "study_phase": None,
        "due_at": next_due_at.isoformat() if next_due_at else None,
        "minutes_remaining": minutes_remaining,
        "delay_minutes": DELAYED_VOCAB_TEST_MINUTES,
    }



def _get_distractors(correct_translation: str, cefr_level: str, db: Session, count: int = 3) -> list[str]:
    """Pick distractor translations from the lexicon at a similar CEFR level."""
    candidates = (
        db.query(Lexicon)
        .filter(Lexicon.cefr_level == cefr_level, Lexicon.translation != correct_translation)
        .limit(50)
        .all()
    )
    random.shuffle(candidates)
    distractors: list[str] = []
    for c in candidates:
        if c.translation not in distractors and c.translation != correct_translation:
            distractors.append(c.translation)
        if len(distractors) == count:
            break
    # Fallback if not enough
    fallback = ["development", "choice", "environment", "question", "system", "example"]
    for fb in fallback:
        if len(distractors) < count and fb != correct_translation and fb not in distractors:
            distractors.append(fb)
    return distractors[:count]
