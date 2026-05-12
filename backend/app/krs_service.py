"""
KRS Service — Knowledge-Based Recommender System
Maintains a 50-word reservoir in RecommendedVocabulary per user.
"""
from __future__ import annotations

import json
import logging
import re

from google import genai
from sqlalchemy.orm import Session

from app.config import GOOGLE_API_KEY, GEMINI_MODEL
from app.models import (
    Lexicon, RecommendedVocabulary, TopicStatus, User, UserTopic,
    UserVocabularyVector, VocabStatus
)

logger = logging.getLogger(__name__)

_client = genai.Client(api_key=GOOGLE_API_KEY)

RESERVOIR_TARGET   = 50   # desired pool size — top-off target
GATEKEEPER_FLOOR   = 25   # minimum before a Gemini call is allowed
LOW_WATERMARK      = 25   # alias used by discover-prefetch endpoint


# ─────────────────────────────────────────────
#  Public entry point
# ─────────────────────────────────────────────

def run_krs(user_id: str, db: Session, is_refill: bool = False) -> dict:
    """
    Main KRS pipeline — maintains a 50-word reservoir in RecommendedVocabulary.

    Gatekeeper logic (cost-control):
      - If usable reservoir >= 25 words → ABORT (reservoir is adequate, skip Gemini).
      - If usable reservoir <  25 words → PROCEED and top off to 50.

    This prevents redundant API calls after every reading / word action.
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found.")

    # 1. Count current usable reservoir FIRST (gatekeeper check)
    vector_ids = {
        v.word_id for v in db.query(UserVocabularyVector)
        .filter(UserVocabularyVector.user_id == user_id).all()
    }
    current_recs = (
        db.query(RecommendedVocabulary)
        .filter(RecommendedVocabulary.user_id == user_id)
        .all()
    )
    usable_count = sum(1 for r in current_recs if r.word_id not in vector_ids)

    # ── Gatekeeper: abort if reservoir is adequate ──────────────────────────
    if usable_count >= GATEKEEPER_FLOOR:
        logger.info(
            f"[KRS] user={user_id} | reservoir={usable_count} >= {GATEKEEPER_FLOOR} "
            f"— skipping Gemini call (adequate buffer)"
        )
        return {"user_id": user_id, "words_recommended": 0, "new_entries_saved": 0, "skipped": True}

    # 2. Gather context (only if we need to call Gemini)
    interests      = _get_interests(user_id, db)
    excluded_words = _get_excluded_words(user_id, db)

    # 3. Calculate exactly how many words are needed to reach RESERVOIR_TARGET
    needed = max(1, RESERVOIR_TARGET - usable_count)

    # 4. Call Gemini
    raw_words = _call_gemini_krs(user, interests, excluded_words, needed, is_refill)

    # 5. Save matches
    matched, new_count = _save_matches(user_id, raw_words, db)

    logger.info(
        f"[KRS] user={user_id} | was={usable_count} | needed={needed} "
        f"| gemini={len(raw_words)} | matched={matched} | saved={new_count}"
    )
    return {
        "user_id":           user_id,
        "words_recommended": len(raw_words),
        "words_matched":     matched,
        "new_entries_saved": new_count,
        "skipped":           False,
    }


def reservoir_count(user_id: str, db: Session) -> int:
    """Return the number of usable (not yet learned) words in the reservoir."""
    vector_ids = {
        v.word_id for v in db.query(UserVocabularyVector)
        .filter(UserVocabularyVector.user_id == user_id).all()
    }
    recs = (
        db.query(RecommendedVocabulary)
        .filter(RecommendedVocabulary.user_id == user_id)
        .all()
    )
    return sum(1 for r in recs if r.word_id not in vector_ids)


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def _get_excluded_words(user_id: str, db: Session) -> list[str]:
    """Words the user already knows or is learning — never recommend these."""
    rows = (
        db.query(Lexicon.word)
        .join(UserVocabularyVector, UserVocabularyVector.word_id == Lexicon.word_id)
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.status.in_([VocabStatus.MASTERED, VocabStatus.LEARNING])
        )
        .all()
    )
    # Also exclude words already in the reservoir (don't recommend duplicates)
    rec_rows = (
        db.query(Lexicon.word)
        .join(RecommendedVocabulary, RecommendedVocabulary.word_id == Lexicon.word_id)
        .filter(RecommendedVocabulary.user_id == user_id)
        .all()
    )
    return list({row.word for row in rows} | {row.word for row in rec_rows})


def _get_interests(user_id: str, db: Session) -> list[str]:
    rows = (
        db.query(UserTopic)
        .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.INTERESTED)
        .all()
    )
    return [r.topic_name for r in rows]


def _call_gemini_krs(
    user: User,
    interests: list[str],
    excluded_words: list[str],
    count: int,
    is_refill: bool = False,
) -> list[str]:
    """Ask Gemini for exactly `count` personalised Dutch words."""
    interests_str = ", ".join(interests) if interests else "general life"
    excluded_str  = ", ".join(excluded_words) if excluded_words else "none"

    prompt = (
        f"You are an Expert Dutch Linguist and CEFR Examiner.\n\n"
        f"USER PROFILE:\n"
        f"- Age: {user.age}\n"
        f"- Location: {user.city}\n"
        f"- Job: {user.job}\n"
        f"- Academic Background: {user.academic_background}\n"
        f"- Purpose of learning Dutch: {user.purpose}\n"
        f"- Estimated CEFR Level: {user.estimated_cefr}\n"
        f"- Vocabulary Acquisition Score: {user.acquisition_score}%\n"
        f"- Interests: {interests_str}\n\n"
        f"EXCLUSION LIST — Do NOT recommend any of these words: {excluded_str}\n\n"
        f"TASK:\n"
        f"Recommend exactly {count} Dutch words that are highly relevant to this user's "
        f"job, age, and interests. "
        f"{'Focus on challenging boundary words' if user.acquisition_score > 70 else 'Focus on core foundational words'} "
        f"within the {user.estimated_cefr} CEFR level.\n"
    )

    if is_refill:
        prompt += (
            "\nIMPORTANT: This is a REFILL request — the user has already seen and processed "
            "many words. Increase the complexity and rarity slightly to keep them challenged.\n"
        )

    prompt += (
        f"\nReturn ONLY a valid JSON array of exactly {count} lowercase Dutch words.\n"
        f'Example: ["onderhandelen", "vrijwilliger", ...]'
    )

    try:
        response = _client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        text = response.text.strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        words = json.loads(text)
        if isinstance(words, list):
            return [w.lower().strip() for w in words if isinstance(w, str)]
    except Exception as e:
        logger.error(f"[KRS] Gemini call failed: {e}")

    return []


def _save_matches(user_id: str, words: list[str], db: Session) -> tuple[int, int]:
    """Cross-reference against lexicon; insert into RecommendedVocabulary if new."""
    matched   = 0
    new_count = 0

    for word in words:
        lex = db.query(Lexicon).filter(Lexicon.word == word).first()
        if not lex:
            continue
        matched += 1

        exists_in_rec = db.query(RecommendedVocabulary).filter(
            RecommendedVocabulary.user_id  == user_id,
            RecommendedVocabulary.word_id  == lex.word_id,
        ).first()

        exists_in_vector = db.query(UserVocabularyVector).filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.word_id == lex.word_id,
        ).first()

        if not exists_in_rec and not exists_in_vector:
            db.add(RecommendedVocabulary(user_id=user_id, word_id=lex.word_id))
            new_count += 1

    db.commit()
    return matched, new_count