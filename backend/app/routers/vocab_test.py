"""
vocab_test.py — Post-3-readings vocabulary test using the 7 onboarding words.
Supports the within-subjects crossover design:
  study_phase=1 submit → flips condition, returns next_action="transition"
  study_phase=2 submit → final, returns next_action="finish"
"""
import random

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ConditionType, Lexicon, OnboardingWords, User, VocabularyTestResult
from app.schemas import VocabTestSubmitRequest

router = APIRouter(prefix="/vocab-test", tags=["VocabTest"])


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


@router.get("/start")
def start_vocab_test(
    user_id: str,
    session_group_id: int,
    study_phase: int = 1,
    db: Session = Depends(get_db),
):
    """
    Generate the vocab test strictly from the 7 OnboardingWords tagged for this study_phase.

    STRICT ISOLATION: no cross-phase mixing, no random fallback words.
    Phase 1 tests only Phase-1 words; Phase 2 tests only Phase-2 words.
    If the words were never saved for this phase a 404 is raised so the
    researcher can diagnose the data issue rather than silently contaminating results.
    """
    try:
        rows = (
            db.query(OnboardingWords)
            .filter(
                OnboardingWords.user_id   == user_id,
                OnboardingWords.study_phase == study_phase,
            )
            .join(OnboardingWords.lexicon_entry)
            .all()
        )

        if not rows:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No vocabulary words found for user '{user_id}' in study_phase={study_phase}. "
                    "Please ensure the onboarding word-selection step completed successfully for this phase."
                ),
            )

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
    Phase 1: flip condition → next_action = "transition"
    Phase 2 (final): nothing to flip → next_action = "finish"
    """
    for answer in payload.answers:
        word_id_raw = answer.get("word_id", "")
        if not str(word_id_raw).isdigit():
            continue
        word_id = int(word_id_raw)
        db.add(VocabularyTestResult(
            user_id=payload.user_id,
            session_group_id=payload.session_group_id,
            word_id=word_id,
            chosen_answer=str(answer.get("chosen_answer", "")),
            is_correct=bool(answer.get("is_correct", False)),
            score=payload.score if answer == payload.answers[-1] else None,
        ))

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    # ── Crossover transition logic ────────────────────────────────────────────
    if not payload.is_final:
        # Phase 1 complete → flip the user's condition for Phase 2
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
            "success":     True,
            "score":       payload.score,
            "total":       len(payload.answers),
            "next_action": "transition",
            "new_condition": user.current_condition.value if user else None,
        }

    # Phase 2 final submit
    return {
        "success":     True,
        "score":       payload.score,
        "total":       len(payload.answers),
        "next_action": "finish",
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


