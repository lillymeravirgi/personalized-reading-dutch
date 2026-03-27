"""
KRS Service — Knowledge-Based Recommender System
Calls Gemini with a user's profile, parses 15 recommended Dutch words,
cross-references the lexicon, and saves new matches to recommended_vocabulary.
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
)

logger = logging.getLogger(__name__)

_client = genai.Client(api_key=GOOGLE_API_KEY)


# ─────────────────────────────────────────────
#  Public entry point
# ─────────────────────────────────────────────

def run_krs(user_id: str, db: Session) -> dict:
    """
    Main KRS pipeline:
    1. Load user profile + interests
    2. Call Gemini for 15 word recommendations
    3. Cross-reference against lexicon
    4. Save new matches to recommended_vocabulary
    Returns a summary dict.
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found.")

    interests = _get_interests(user_id, db)
    raw_words = _call_gemini_krs(user, interests)
    matched, new_count = _save_matches(user_id, raw_words, db)

    logger.info(f"[KRS] user={user_id} | recommended={len(raw_words)} | matched={matched} | new={new_count}")
    return {
        "user_id": user_id,
        "words_recommended": len(raw_words),
        "words_matched_in_lexicon": matched,
        "new_entries_saved": new_count,
    }


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def _get_interests(user_id: str, db: Session) -> list[str]:
    rows = (
        db.query(UserTopic)
        .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.INTERESTED)
        .all()
    )
    return [r.topic_name for r in rows]


def _call_gemini_krs(user: User, interests: list[str]) -> list[str]:
    """Call Gemini and return a list of recommended Dutch words."""
    interests_str = ", ".join(interests) if interests else "general everyday topics"

    prompt = (
        f"As a pedagogical expert, recommend exactly 15 Dutch words for a "
        f"{user.age}-year-old in {user.location} studying for {user.learning_purpose} "
        f"at {user.estimated_cefr} level. Their interests are: {interests_str}. "
        f"Focus on high-utility words for their specific context.\n\n"
        f"Return ONLY a valid JSON array of 15 lowercase Dutch words, no extra text.\n"
        f'Example: ["woord1", "woord2", ...]'
    )

    try:
        response = _client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        text = response.text.strip()
        # Strip markdown code fences if present
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        words = json.loads(text)
        if isinstance(words, list):
            return [w.lower().strip() for w in words if isinstance(w, str)]
    except Exception as e:
        logger.error(f"[KRS] Gemini call failed: {e}")

    return []


def _save_matches(user_id: str, words: list[str], db: Session) -> tuple[int, int]:
    """Cross-reference words against lexicon; insert new recommendations."""
    matched = 0
    new_count = 0

    for word in words:
        lex = db.query(Lexicon).filter(Lexicon.word == word).first()
        if not lex:
            continue
        matched += 1

        exists = (
            db.query(RecommendedVocabulary)
            .filter(
                RecommendedVocabulary.user_id == user_id,
                RecommendedVocabulary.word_id == lex.word_id,
            )
            .first()
        )
        if not exists:
            db.add(RecommendedVocabulary(user_id=user_id, word_id=lex.word_id))
            new_count += 1

    db.commit()
    return matched, new_count
