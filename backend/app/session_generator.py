"""
Session Generator
Executes the K-probability topic roll, injects Blue and Yellow words,
calls the Gemini Storyteller, and persists the ReadingSession.
"""
from __future__ import annotations

import json
import logging
import math
import random
import re
import time
from typing import Optional

from google import genai

from sqlalchemy.orm import Session

from app.config import GOOGLE_API_KEY, GEMINI_MODEL
from app.models import (
    ConditionType,
    Lexicon,
    ReadingSession,
    RecommendedVocabulary,
    TopicStatus,
    User,
    UserTopic,
    UserVocabularyVector,
    VocabStatus,
)

logger = logging.getLogger(__name__)

_client = genai.Client(api_key=GOOGLE_API_KEY)

_SYSTEM_INSTRUCTION = """\
You are an expert Dutch Pedagogical Content Creator and Linguist. \
Your goal is to write highly personalized reading materials for L2 Dutch learners.

Your writing must adhere to three strict pillars:

1. CEFR Alignment: Strictly follow the specified CEFR level's grammatical structures and sentence lengths.
2. Contextual Relevance: Use the user's location and purpose to make the text feel 'real.'
3. Lexical Injection: Naturally weave every word from the provided Target Lists into the narrative.

Formatting Rule: Every time you use a word from the provided 'Target Lists,' \
you MUST wrap it in double brackets, like this: [[woord]].\
"""

# Extra topic pool for NEUTRAL rolls
_NEUTRAL_POOL = [
    "winkelen", "reizen", "technologie", "muziek",
    "film", "natuur", "gezondheid", "wetenschap",
]


# ─────────────────────────────────────────────
#  Public entry point
# ─────────────────────────────────────────────

def generate_session(
    user_id: str,
    K: float,
    narrative_style: str,
    word_count_range: str,
    condition: ConditionType,
    db: Session,
) -> dict:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found.")

    # 1. Topic Roll
    selected_topic = _topic_roll(user_id, K, db)

    # 2. Word Injection
    blue_entries  = _fetch_blue_words(user_id, db)
    yellow_entries = _fetch_yellow_words(user_id, db)

    blue_words  = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
    yellow_words = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]

    # 3. Gemini Storyteller
    story_json = _call_gemini_storyteller(
        user=user,
        selected_topic=selected_topic,
        narrative_style=narrative_style,
        word_count_range=word_count_range,
        blue_words=[w["word"] for w in blue_words],
        yellow_words=[w["word"] for w in yellow_words],
    )

    # 4. Persist session
    session = ReadingSession(
        user_id=user_id,
        title=story_json.get("title", ""),
        content=story_json.get("content", ""),
        topic_used=selected_topic,
        condition=condition,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id": session.session_id,
        "title": story_json.get("title", ""),
        "content": story_json.get("content", ""),
        "topic_used": selected_topic,
        "blue_words": blue_words,
        "yellow_words": yellow_words,
        "metadata": story_json.get("metadata", {}),
    }


# ─────────────────────────────────────────────
#  Topic Roll
# ─────────────────────────────────────────────

def _topic_roll(user_id: str, K: float, db: Session) -> str:
    hated = {
        t.topic_name
        for t in db.query(UserTopic)
        .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.HATED)
        .all()
    }

    r = random.random()

    if r < K:
        candidates = [
            t.topic_name
            for t in db.query(UserTopic)
            .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.INTERESTED)
            .all()
            if t.topic_name not in hated
        ]
    else:
        neutral = [
            t.topic_name
            for t in db.query(UserTopic)
            .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.NEUTRAL)
            .all()
            if t.topic_name not in hated
        ]
        candidates = neutral + [t for t in _NEUTRAL_POOL if t not in hated]

    if not candidates:
        candidates = [t for t in _NEUTRAL_POOL if t not in hated] or ["dagelijks leven"]

    return random.choice(candidates)


# ─────────────────────────────────────────────
#  Word Injection (5% of pool, min 1, max 5)
# ─────────────────────────────────────────────

def _fetch_blue_words(user_id: str, db: Session) -> list[RecommendedVocabulary]:
    all_recs = (
        db.query(RecommendedVocabulary)
        .filter(RecommendedVocabulary.user_id == user_id)
        .join(Lexicon)
        .all()
    )
    k = max(1, min(5, math.ceil(len(all_recs) * 0.05))) if all_recs else 0
    return random.sample(all_recs, min(k, len(all_recs)))


def _fetch_yellow_words(user_id: str, db: Session) -> list[UserVocabularyVector]:
    all_learning = (
        db.query(UserVocabularyVector)
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.status == VocabStatus.LEARNING,
        )
        .join(Lexicon)
        .all()
    )
    k = max(1, min(5, math.ceil(len(all_learning) * 0.05))) if all_learning else 0
    return random.sample(all_learning, min(k, len(all_learning)))


def _lex_to_dict(entry: Lexicon) -> dict:
    return {
        "word_id": entry.word_id,
        "word": entry.word,
        "translation": entry.translation,
        "cefr_level": entry.cefr_level,
    }


# ─────────────────────────────────────────────
#  Gemini Storyteller
# ─────────────────────────────────────────────

def _call_gemini_storyteller(
    user: User,
    selected_topic: str,
    narrative_style: str,
    word_count_range: str,
    blue_words: list[str],
    yellow_words: list[str],
) -> dict:
    blue_str   = ", ".join(blue_words)   if blue_words   else "(none)"
    yellow_str = ", ".join(yellow_words) if yellow_words else "(none)"

    prompt = f"""\
### USER PROFILE
- Age: {user.age}
- Location: {user.location} (Incorporate local landmarks or regional context)
- Education Level: {user.education_level}
- Learning Goal: {user.learning_purpose}
- Current Level: {user.estimated_cefr} Dutch

### CONTENT CONFIGURATION
- Selected Topic: {selected_topic}
- Narrative Style: {narrative_style}

### MANDATORY VOCABULARY INJECTION
1. BLUE WORDS (New Recommendations): {blue_str}
2. YELLOW WORDS (Active Learning): {yellow_str}

### INSTRUCTIONS
Write a cohesive Dutch text of approximately {word_count_range} words.
- Ensure ALL Blue and Yellow words are used at least once.
- Ensure the difficulty does not exceed {user.estimated_cefr}.
- Relate the text back to the user's goal of '{user.learning_purpose}'.

### OUTPUT SPECIFICATION
Return ONLY a valid JSON object with these exact keys:
{{
  "title": "A catchy headline in Dutch",
  "content": "The full Dutch text with [[target_words]] bracketed",
  "metadata": {{
    "topic_used": "{selected_topic}",
    "cefr_actual": "{user.estimated_cefr}",
    "injected_blue_count": 0,
    "injected_yellow_count": 0
  }}
}}
"""

    # ── Log prompt to Uvicorn terminal ───────────────────────────────────────
    full_log = (
        "\n\n--- GEMINI PROMPT START ---\n"
        f"[SYSTEM INSTRUCTION]\n{_SYSTEM_INSTRUCTION}\n\n"
        f"[USER PROMPT]\n{prompt}"
        "\n--- GEMINI PROMPT END ---\n"
    )
    logger.info(full_log)

    last_error = None
    for attempt in range(1, 4):  # up to 3 attempts
        try:
            response = _client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config={"system_instruction": _SYSTEM_INSTRUCTION},
            )
            text = response.text.strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            result = json.loads(text)
            logger.info(
                "\n--- GEMINI RESPONSE START ---\n"
                f"{json.dumps(result, ensure_ascii=False, indent=2)}"
                "\n--- GEMINI RESPONSE END ---\n"
            )
            return result
        except Exception as e:
            last_error = e
            logger.warning(f"[SessionGen] Attempt {attempt} failed: {e}")
            if attempt < 3:
                time.sleep(2)

    logger.error(f"[SessionGen] All attempts failed: {last_error}")
    return {
        "title": "Oefentekst",
        "content": f"Er is een fout opgetreden bij het genereren van de tekst. ({last_error})",
        "metadata": {"topic_used": selected_topic, "cefr_actual": user.estimated_cefr},
    }
