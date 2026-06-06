import datetime
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import DELAYED_VOCAB_TEST_MINUTES
from app.database import get_db
from app.models import (
    ConditionType,
    Lexicon,
    OnboardingWords,
    ReadingSession,
    User,
    VocabularyTestResult,
)
from app.schemas import VocabTestSubmitRequest

router = APIRouter(prefix="/vocab-test", tags=["VocabTest"])

VOCAB_TEST_WORD_COUNT = 10
READINGS_PER_PHASE = 3
FINAL_STUDY_PHASE = 2


def _phase_word_rows(db: Session, user_id: str, study_phase: int) -> list[OnboardingWords]:
    return (
        db.query(OnboardingWords)
        .join(OnboardingWords.lexicon_entry)
        .filter(
            OnboardingWords.user_id == user_id,
            OnboardingWords.study_phase == study_phase,
            OnboardingWords.is_to_be_tested == True,
        )
        .order_by(OnboardingWords.id.asc())
        .limit(VOCAB_TEST_WORD_COUNT)
        .all()
    )


def _require_session_group(db: Session, user_id: str, session_group_id: int, study_phase: int) -> None:
    session = (
        db.query(ReadingSession.session_id)
        .filter(
            ReadingSession.session_id == session_group_id,
            ReadingSession.user_id == user_id,
            ReadingSession.study_phase == study_phase,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Reading block not found")


def _completed_readings(db: Session, user_id: str, study_phase: int) -> int:
    return (
        db.query(ReadingSession)
        .filter(
            ReadingSession.user_id == user_id,
            ReadingSession.study_phase == study_phase,
            ReadingSession.survey_completed.is_(True),
        )
        .count()
    )


def _normalise_answers(answers: list[dict], expected_word_ids: list[int]) -> list[dict]:
    expected = set(expected_word_ids)
    by_word: dict[int, dict] = {}

    for answer in answers:
        raw_word_id = answer.get("word_id", answer.get("wordId"))
        if not str(raw_word_id).isdigit():
            raise HTTPException(status_code=400, detail="Invalid vocabulary answer")
        word_id = int(raw_word_id)
        if word_id not in expected:
            raise HTTPException(status_code=400, detail="Answer does not belong to this vocabulary check")
        by_word[word_id] = {
            "word_id": word_id,
            "chosen_answer": str(answer.get("chosen_answer", answer.get("chosenAnswer", ""))),
            "is_correct": bool(answer.get("is_correct", answer.get("isCorrect", False))),
        }

    missing = [word_id for word_id in expected_word_ids if word_id not in by_word]
    if missing:
        raise HTTPException(status_code=400, detail="Please answer all vocabulary questions")

    return [by_word[word_id] for word_id in expected_word_ids]


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
    try:
        _require_session_group(db, user_id, session_group_id, study_phase)
        rows = _phase_word_rows(db, user_id, study_phase)
        if len(rows) < VOCAB_TEST_WORD_COUNT:
            raise HTTPException(
                status_code=409,
                detail="Please complete the phase word set before starting the vocabulary check.",
            )

        questions = []
        for row in rows:
            word = row.lexicon_entry
            distractors = _get_distractors(word.translation, word.cefr_level, db)
            correct_index = random.randint(0, 3)
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
    test_type = payload.test_type.lower()
    if test_type not in {"immediate", "delayed"}:
        raise HTTPException(status_code=400, detail="Unknown vocabulary test type.")

    user = db.query(User).filter(User.user_id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.study_phase < 1 or payload.study_phase > FINAL_STUDY_PHASE:
        raise HTTPException(status_code=400, detail="Unknown study phase.")

    _require_session_group(db, payload.user_id, payload.session_group_id, payload.study_phase)

    rows = _phase_word_rows(db, payload.user_id, payload.study_phase)
    if len(rows) < VOCAB_TEST_WORD_COUNT:
        raise HTTPException(status_code=409, detail="Vocabulary check is not ready yet.")
    expected_word_ids = [row.word_id for row in rows]
    answers = _normalise_answers(payload.answers, expected_word_ids)
    score = sum(1 for answer in answers if answer["is_correct"])

    if test_type == "immediate":
        current_phase = 2 if user.has_switched_conditions else 1
        if payload.study_phase != current_phase:
            raise HTTPException(status_code=409, detail="This vocabulary check is not active.")
        if _completed_readings(db, payload.user_id, payload.study_phase) < READINGS_PER_PHASE:
            raise HTTPException(status_code=409, detail="Please complete the readings before the vocabulary check.")
    else:
        immediate_exists = (
            db.query(VocabularyTestResult.id)
            .filter(
                VocabularyTestResult.user_id == payload.user_id,
                VocabularyTestResult.session_group_id == payload.session_group_id,
                VocabularyTestResult.study_phase == payload.study_phase,
                VocabularyTestResult.test_type == "immediate",
            )
            .first()
        )
        if not immediate_exists:
            raise HTTPException(status_code=409, detail="Immediate vocabulary check must be completed first.")

    last_index = len(answers) - 1
    for index, answer in enumerate(answers):
        db.add(VocabularyTestResult(
            user_id=payload.user_id,
            session_group_id=payload.session_group_id,
            study_phase=payload.study_phase,
            test_type=test_type,
            word_id=answer["word_id"],
            chosen_answer=answer["chosen_answer"],
            is_correct=answer["is_correct"],
            score=score if index == last_index else None,
        ))

    next_action = "finish"
    phase_switched = False
    if test_type == "immediate" and payload.study_phase < FINAL_STUDY_PHASE:
        user.current_condition = (
            ConditionType.BASELINE
            if user.current_condition == ConditionType.ADAPTIVE
            else ConditionType.ADAPTIVE
        )
        user.has_switched_conditions = True
        next_action = "transition"
        phase_switched = True

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    if test_type == "delayed":
        return {
            "success":     True,
            "score":       score,
            "total":       len(answers),
            "next_action": "finish",
        }

    if next_action == "transition":
        return {
            "success":       True,
            "score":         score,
            "total":         len(answers),
            "next_action":   "transition",
            "phase_switched": phase_switched,
        }

    return {
        "success":     True,
        "score":       score,
        "total":       len(answers),
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
    fallback = ["development", "choice", "environment", "question", "system", "example"]
    for fb in fallback:
        if len(distractors) < count and fb != correct_translation and fb not in distractors:
            distractors.append(fb)
    return distractors[:count]
