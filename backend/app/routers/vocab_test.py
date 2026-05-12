"""
vocab_test.py — Post-3-readings vocabulary test using the 7 onboarding words.
"""
import random

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lexicon, OnboardingWords, VocabularyTestResult
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
def start_vocab_test(user_id: str, session_group_id: int, db: Session = Depends(get_db)):
    """
    Generate the vocab test from the user's OnboardingWords (7 words).
    Falls back to CEFR-level lexicon words if OnboardingWords is empty
    (e.g. for existing users who completed onboarding before this feature).
    """
    try:
        rows = (
            db.query(OnboardingWords)
            .filter(OnboardingWords.user_id == user_id)
            .join(OnboardingWords.lexicon_entry)
            .all()
        )

        # ── Fallback: no onboarding words saved → use CEFR-level lexicon words
        if not rows:
            from app.models import User
            user = db.query(User).filter(User.user_id == user_id).first()
            level = user.estimated_cefr if user and user.estimated_cefr else "B1"
            lex_rows = (
                db.query(Lexicon)
                .filter(Lexicon.cefr_level == level)
                .limit(50)
                .all()
            )
            random.shuffle(lex_rows)
            lex_rows = lex_rows[:7]

            if not lex_rows:
                raise HTTPException(
                    status_code=404,
                    detail="No vocabulary words available for this user. Please complete the onboarding first."
                )

            # Persist them now so next time we don't need the fallback
            for lex in lex_rows:
                exists = db.query(OnboardingWords).filter(
                    OnboardingWords.user_id == user_id,
                    OnboardingWords.word_id == lex.word_id,
                ).first()
                if not exists:
                    db.add(OnboardingWords(user_id=user_id, word_id=lex.word_id))
            try:
                db.commit()
            except Exception:
                db.rollback()

            # Build mock rows compatible with .lexicon_entry access
            class _MockRow:
                def __init__(self, l): self.lexicon_entry = l
            rows = [_MockRow(l) for l in lex_rows]

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
                "questions": questions,
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
    """Persist per-word results and total score."""
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

    return {"success": True, "score": payload.score, "total": len(payload.answers)}
