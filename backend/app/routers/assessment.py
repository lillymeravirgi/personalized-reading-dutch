import json
import logging
import re

from google import genai
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import GEMINI_MODEL, GOOGLE_API_KEY
from app.database import get_db
from app.models import AssessmentBatch, Lexicon, User, UserVocabularyVector, VocabStatus
from app.schemas import AssessmentSubmitRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assessment", tags=["Assessment"])

_client = genai.Client(api_key=GOOGLE_API_KEY)

PSEUDO_WORDS = [
    "mivelen", "drokkel", "plinterig", "zomberen", "kluftig",
    "trieven", "bleksel", "vorfelen", "snuiselen", "galperen",
]


def _generate_second_pitch(user: User, known_words: list[str], all_words: list[str], cefr_level: str) -> list[dict]:
    success_rate = (len(known_words) / len(all_words)) * 100 if all_words else 0

    prompt = f"""\
You are a Dutch vocabulary specialist for second-language learners.
Age: {user.age or 'Unknown'}
Job: {user.job or 'Unknown'}
Academic Background: {user.academic_background or 'Unknown'}
Purpose of Learning: {user.purpose or 'Unknown'}
Initial CEFR Level: {cefr_level}
Success Rate on Baseline: {success_rate:.1f}%

Task:
Generate exactly 50 adaptive Dutch words for the second assessment batch.

Personalization Logic:
If the user is a student, prioritize academic and campus vocabulary.
If the user is a professional, prioritize business/industry-specific terms.
Success > 80%: Move up one CEFR level to find their 'ceiling'.
Success 50-80%: Stay in the current level but use highly specific/niche 'frontier' words.
Success < 50%: Drop down one level to find their stable 'floor'.

Formatting: Return ONLY a JSON array: [{{"word": "Dutch", "translation": "English", "cefr": "Level"}}]
"""
    try:
        response = _client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        text = response.text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        words = json.loads(text)
        if isinstance(words, list):
            return words
    except Exception as e:
        logger.error("[Assessment] Gemini second pitch generation failed: %s", e)
    return []


def _fallback_second_pitch(db: Session, cefr_level: str, all_words: list[str], limit: int = 50) -> list[dict]:
    seen = {str(word).strip().lower() for word in all_words if str(word).strip()}
    rows = (
        db.query(Lexicon)
        .filter(Lexicon.cefr_level == cefr_level)
        .order_by(Lexicon.word_id)
        .all()
    )
    candidates = [row for row in rows if row.word.lower() not in seen]

    if len(candidates) < limit:
        extra_rows = (
            db.query(Lexicon)
            .filter(Lexicon.cefr_level != cefr_level)
            .order_by(Lexicon.word_id)
            .all()
        )
        existing_ids = {row.word_id for row in candidates}
        candidates.extend(
            row
            for row in extra_rows
            if row.word_id not in existing_ids and row.word.lower() not in seen
        )

    return [
        {"word": row.word, "translation": row.translation, "cefr": row.cefr_level}
        for row in candidates[:limit]
    ]


@router.post("/batch/generate")
def generate_batch(
    payload: dict,
    db: Session = Depends(get_db),
):
    user_id      = payload.get("user_id", "")
    batch_number = int(payload.get("batch_number", 1))
    cefr_level   = payload.get("self_reported_cefr", "B1")
    known_words  = payload.get("known_words", [])
    all_words    = payload.get("all_words", [])

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    word_objects = []

    if batch_number == 1:
        cefr_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
        levels_to_try = [cefr_level]
        idx = cefr_order.index(cefr_level) if cefr_level in cefr_order else len(cefr_order) - 1
        for i in range(1, len(cefr_order)):
            if idx - i >= 0:
                levels_to_try.append(cefr_order[idx - i])
            if idx + i < len(cefr_order):
                levels_to_try.append(cefr_order[idx + i])

        lex_words = []
        for lvl in levels_to_try:
            lex_words = db.query(Lexicon).filter(Lexicon.cefr_level == lvl).all()
            if lex_words:
                break

        for lex in lex_words[:100]:
            word_objects.append({
                "word_id":   str(lex.word_id),
                "dutch":     lex.word,
                "english":   lex.translation,
                "is_pseudo": False,
            })

        for pw in PSEUDO_WORDS[:5]:
            word_objects.append({
                "word_id":   f"pseudo-{pw}",
                "dutch":     pw,
                "english":   None,
                "is_pseudo": True,
            })

    else:
        words_data = _generate_second_pitch(user, known_words, all_words, cefr_level)
        if not words_data:
            words_data = _fallback_second_pitch(db, cefr_level, all_words)

        for w in words_data[:50]:
            word = w.get("word", "")
            if not word:
                continue
            lex = db.query(Lexicon).filter(Lexicon.word == word.lower()).first()
            word_objects.append({
                "word_id":   str(lex.word_id) if lex else f"gen-{word}",
                "dutch":     word,
                "english":   w.get("translation") or (lex.translation if lex else None),
                "is_pseudo": False,
            })

        for pw in PSEUDO_WORDS[5:10]:
            word_objects.append({
                "word_id":   f"pseudo-{pw}",
                "dutch":     pw,
                "english":   None,
                "is_pseudo": True,
            })

    return {
        "batch_number":  batch_number,
        "total_batches": 2,
        "words":         word_objects,
    }


@router.post("/submit")
def submit_assessment(payload: AssessmentSubmitRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.user_id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    batch_record = AssessmentBatch(
        user_id=payload.user_id,
        batch_number=payload.batch_number,
        word_ids=[wid for wid in payload.all_word_ids if not str(wid).startswith("pseudo")],
        known_word_ids=[wid for wid in payload.known_word_ids if not str(wid).startswith("pseudo")],
    )
    db.add(batch_record)

    if payload.is_final:
        user.estimated_cefr = payload.estimated_level

        for raw_id in payload.known_word_ids:
            if not str(raw_id).isdigit():
                continue
            word_id = int(raw_id)
            existing = (
                db.query(UserVocabularyVector)
                .filter(
                    UserVocabularyVector.user_id == payload.user_id,
                    UserVocabularyVector.word_id == word_id,
                )
                .first()
            )
            if existing:
                existing.status        = VocabStatus.MASTERED
                existing.mastery_score = max(existing.mastery_score, 0.9)
            else:
                db.add(UserVocabularyVector(
                    user_id=payload.user_id,
                    word_id=word_id,
                    status=VocabStatus.MASTERED,
                    mastery_score=0.9,
                    exposure_count=1,
                ))

    db.commit()
    return {"success": True, "is_final": payload.is_final}
