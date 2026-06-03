"""
Session Generator
Executes the K-probability topic roll, injects Blue and Yellow words,
generates a reading text via Gemini, and persists the ReadingSession.

Survey → Prompt:
  _survey_signal_prompt_block() reads the survey_signal stored on the user's
  most recent completed session. The TLX-MD score is the difficulty proxy:
    TLX-MD ≥ 5 → easier next session
    TLX-MD ≤ 2 → harder next session
    TLX-MD 3-4 → keep same level
  This happens silently (not shown to the user).
"""

from __future__ import annotations

import json
import logging
import math
import random
import re
import time
from typing import Any, Optional

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


class GenerationRateLimitError(RuntimeError):
    """Raised when Gemini quota/rate limits prevent text generation."""


class GenerationFailedError(RuntimeError):
    """Raised when Gemini fails for a non-quota reason."""


def _is_rate_limit_error(error: Exception) -> bool:
    message = str(error).lower()
    return (
        "429" in message
        or "quota" in message
        or "resource_exhausted" in message
        or "rate limit" in message
    )

_SYSTEM_INSTRUCTION = """\
You are an expert Dutch Pedagogical Content Creator and Linguist. \
Your goal is to write highly personalized reading materials for L2 Dutch learners.

Your writing must adhere to three strict pillars:

1. CEFR Alignment: Strictly follow the specified CEFR level's grammatical structures and sentence lengths.
2. Contextual Relevance: Use the user's city, job, purpose, and background to make the text feel 'real'.
3. Lexical Injection: Naturally weave every word from the provided Target Lists into the narrative.

Formatting Rule: Every time you use a word from the provided 'Target Lists,' \
you MUST wrap it in double brackets, like this: [[woord]].\
"""

# Extra topic pool for NEUTRAL rolls
_NEUTRAL_POOL = [
    "winkelen", "reizen", "technologie", "muziek",
    "film", "natuur", "gezondheid", "wetenschap",
]

READING_STYLES = [
    "Narrative (Story)",
    "Discussion",
    "Diary/Journal Entry",
    "Descriptive",
    "Dialogue",
    "News",
]


# ─────────────────────────────────────────────
#  Survey → Prompt signal
# ─────────────────────────────────────────────

def _survey_signal_prompt_block(session: ReadingSession | None) -> str:
    """
    Translate the survey_signal stored on the previous session into
    natural-language instructions for the LLM.
    Uses TLX-MD as the sole difficulty proxy (not shown to user).
    Returns "" on first session.
    """
    if session is None or not session.survey_signal:
        return ""

    sig = session.survey_signal
    lines: list[str] = []

    # ── Challenge direction — driven by TLX-MD only (as per spec)
    tlx_md = sig.get("tlx_md", 4)  # raw NASA-TLX score 1-7
    if tlx_md >= 5:
        lines.append(
            "The learner found the previous text TOO DIFFICULT (high mental effort). "
            "Use simpler sentence structures and prefer more familiar vocabulary. "
            "Avoid long subordinate clauses and low-frequency words."
        )
    elif tlx_md <= 2:
        lines.append(
            "The learner found the previous text TOO EASY (very low mental effort). "
            "Slightly increase complexity — introduce more varied sentence structures "
            "and include a higher proportion of target (blue) words."
        )
    else:
        lines.append(
            "The previous text was at the right difficulty level (TLX-MD 3-4). "
            "Maintain a similar difficulty and sentence complexity."
        )

    # ── Engagement refresh (UES composite < 3)
    if sig.get("engagement_boost"):
        lines.append(
            "The learner's engagement score was LOW. "
            "Vary the genre or narrative style (e.g. switch from informational to story-based, "
            "or use an unexpected setting). Make the topic feel fresh and surprising."
        )

    # ── Perceived personalisation (manipulation check failed)
    if not sig.get("felt_personalised", True):
        lines.append(
            "The learner did NOT feel the previous text was personalised. "
            "Make the connection to their stated interests more explicit — "
            "mention those interests directly in the text."
        )

    return "\n".join(lines)


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

    # 1. Determine reading number (max 3 in experiment; unlimited after)
    reading_number = _next_reading_number(user_id, db)

    # 2. Fetch previous session's survey signal (drives prompt adaptation)
    prev_session = (
        db.query(ReadingSession)
        .filter(
            ReadingSession.user_id == user_id,
            ReadingSession.survey_signal.isnot(None),
        )
        .order_by(ReadingSession.session_id.desc())
        .first()
    )
    survey_block = _survey_signal_prompt_block(prev_session)

    # 3. Topic Roll + Word Injection (ADAPTIVE only)
    if condition == ConditionType.BASELINE:
        selected_topic = random.choice(_NEUTRAL_POOL)
        blue_entries   = _fetch_blue_words(user_id, db)
        yellow_entries = _fetch_yellow_words(user_id, db)
        blue_words     = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
        yellow_words   = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]
        story_json     = _generate_baseline_content(
            cefr_level=user.estimated_cefr or "B1",
            selected_topic=selected_topic,
            narrative_style=narrative_style,
            word_count_range=word_count_range,
            blue_words=[w["word"] for w in blue_words],
            yellow_words=[w["word"] for w in yellow_words],
        )
    else:
        selected_topic = _topic_roll(user_id, K, db)
        blue_entries   = _fetch_blue_words(user_id, db)
        yellow_entries = _fetch_yellow_words(user_id, db)
        blue_words     = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
        yellow_words   = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]
        story_json     = _generate_story_content(
            user=user,
            selected_topic=selected_topic,
            narrative_style=narrative_style,
            word_count_range=word_count_range,
            blue_words=[w["word"] for w in blue_words],
            yellow_words=[w["word"] for w in yellow_words],
            survey_block=survey_block,
        )

    # 6. Build word_translations dict (ADAPTIVE only — baseline has no injected words)
    word_translations: dict[str, str] = {}
    for w in blue_words + yellow_words:
        word_translations[w["word"].lower()] = w["translation"]

    # 7. Persist session
    session = ReadingSession(
        user_id=user_id,
        title=story_json.get("title", ""),
        content=story_json.get("content", ""),
        topic_used=selected_topic,
        condition=condition,
        reading_number=reading_number,
        survey_completed=False,
        word_translations=word_translations,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id":       session.session_id,
        "title":            story_json.get("title", ""),
        "content":          story_json.get("content", ""),
        "topic_used":       selected_topic,
        "blue_words":       blue_words,
        "yellow_words":     yellow_words,
        "word_translations":word_translations,
        "metadata":         story_json.get("metadata", {}),
        "reading_number":   reading_number,
        "condition":        condition.value,
    }


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def _next_reading_number(user_id: str, db: Session) -> int:
    count = (
        db.query(ReadingSession)
        .filter(ReadingSession.user_id == user_id)
        .count()
    )
    return count + 1


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
        "word_id":     entry.word_id,
        "word":        entry.word,
        "translation": entry.translation,
        "cefr_level":  entry.cefr_level,
        "examples":    entry.examples or [],
    }


# ─────────────────────────────────────────────
#  Text generation
# ─────────────────────────────────────────────

def _generate_story_content(
    user: User,
    selected_topic: str,
    narrative_style: str,
    word_count_range: str,
    blue_words: list[str],
    yellow_words: list[str],
    survey_block: str,
) -> dict:
    blue_str   = ", ".join(blue_words)   if blue_words   else "(none)"
    yellow_str = ", ".join(yellow_words) if yellow_words else "(none)"

    survey_section = (
        f"\n### FEEDBACK FROM LEARNER'S PREVIOUS SESSION\n{survey_block}\n"
        if survey_block else ""
    )

    # Build rich profile section
    languages = user.other_languages or "none specified"
    styles    = ", ".join(user.preferred_styles or []) or "any"
    purpose   = user.purpose or user.learning_purpose or "general learning"
    city      = user.city or user.location or "their city"
    job       = user.job or "not specified"
    academic  = user.academic_background or user.education_level or "not specified"
    mother_l  = user.mother_language or user.native_language or "not specified"

    prompt = f"""\
### USER PROFILE
- Name: {user.display_name or "the learner"}
- Age: {user.age or "unknown"}
- City: {city} (incorporate local landmarks or regional context where natural)
- Gender: {user.gender or "not specified"}
- Job / Occupation: {job}
- Academic Background: {academic}
- Mother Language: {mother_l}
- Other Languages: {languages}
- Purpose of Learning Dutch: {purpose}
- Current CEFR Level: {user.estimated_cefr or "B1"} Dutch
- Preferred Reading Styles: {styles}

### CONTENT CONFIGURATION
- Selected Topic: {selected_topic}
- Narrative Style: {narrative_style}

### MANDATORY VOCABULARY INJECTION
1. BLUE WORDS (New Recommendations — must appear at least once): {blue_str}
2. YELLOW WORDS (Active Learning — reinforce by using them naturally): {yellow_str}
{survey_section}
### INSTRUCTIONS
Write a cohesive Dutch text of approximately {word_count_range} words.
- Ensure ALL Blue and Yellow words appear at least once, bracketed as [[word]].
- Ensure difficulty does not exceed CEFR {user.estimated_cefr or "B1"}.
- Connect the text to the learner's goal: '{purpose}'.
- Match the narrative style: {narrative_style}.
- Make the text feel genuinely personalised — reference their city, job, or background naturally.

### OUTPUT SPECIFICATION
Return ONLY a valid JSON object with these exact keys:
{{
  "title": "A catchy headline in Dutch",
  "content": "The full Dutch text with [[target_words]] bracketed",
  "metadata": {{
    "topic_used": "{selected_topic}",
    "cefr_actual": "{user.estimated_cefr or "B1"}",
    "narrative_style": "{narrative_style}",
    "injected_blue_count": 0,
    "injected_yellow_count": 0
  }}
}}
"""

    logger.info(
        "[SessionGen] generating text for user=%s topic=%s level=%s style=%s blue=%d yellow=%d survey=%s",
        user.user_id, selected_topic, user.estimated_cefr, narrative_style,
        len(blue_words), len(yellow_words), "yes" if survey_block else "none",
    )

    last_error = None
    for attempt in range(1, 4):
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
            logger.info("[SessionGen] generated title=%r", result.get("title"))
            return result
        except Exception as e:
            last_error = e
            if _is_rate_limit_error(e):
                logger.warning(f"[SessionGen] Gemini rate-limited: {e}")
                raise GenerationRateLimitError(
                    "The text generator is temporarily rate limited. Please wait a moment and try again."
                ) from e
            logger.warning(f"[SessionGen] Attempt {attempt} failed: {e}")
            if attempt < 3:
                time.sleep(2)

    logger.error(f"[SessionGen] All attempts failed: {last_error}")
    raise GenerationFailedError(
        "The text generator could not create a reading right now. Please try again."
    ) from last_error


def _generate_baseline_content(
    cefr_level: str,
    selected_topic: str,
    narrative_style: str,
    word_count_range: str,
    blue_words: list[str],
    yellow_words: list[str],
) -> dict:
    blue_str   = ", ".join(blue_words)   if blue_words   else "(none)"
    yellow_str = ", ".join(yellow_words) if yellow_words else "(none)"

    prompt = f"""\
### TASK
Write a Dutch reading text for a language learner at CEFR level {cefr_level}.

### CONTENT CONFIGURATION
- Topic: {selected_topic}
- Narrative Style: {narrative_style}
- Length: approximately {word_count_range} words

### MANDATORY VOCABULARY INJECTION
1. BLUE WORDS (New — must appear at least once, wrapped in [[word]]): {blue_str}
2. YELLOW WORDS (Review — reinforce naturally, wrapped in [[word]]): {yellow_str}

### INSTRUCTIONS
- Write a coherent, self-contained Dutch text on the given topic.
- Ensure ALL Blue and Yellow words appear at least once, bracketed as [[word]].
- Ensure vocabulary and grammar stay within CEFR {cefr_level}.
- Do not personalise the text — it should be suitable for any learner at this level.

### OUTPUT SPECIFICATION
Return ONLY a valid JSON object with these exact keys:
{{
  "title": "A short Dutch headline",
  "content": "The full Dutch text with [[target_words]] bracketed",
  "metadata": {{
    "topic_used": "{selected_topic}",
    "cefr_actual": "{cefr_level}",
    "narrative_style": "{narrative_style}",
    "injected_blue_count": 0,
    "injected_yellow_count": 0
  }}
}}
"""

    logger.info(
        "[SessionGen] generating BASELINE text topic=%s level=%s blue=%d yellow=%d",
        selected_topic, cefr_level, len(blue_words), len(yellow_words),
    )

    last_error = None
    for attempt in range(1, 4):
        try:
            response = _client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config={"system_instruction": (
                    "You are an expert Dutch language teacher. "
                    "Write clear, natural Dutch reading texts appropriate for the specified CEFR level."
                )},
            )
            text = response.text.strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            result = json.loads(text)
            logger.info("[SessionGen] baseline title=%r", result.get("title"))
            return result
        except Exception as e:
            last_error = e
            if _is_rate_limit_error(e):
                raise GenerationRateLimitError(
                    "The text generator is temporarily rate limited. Please wait a moment and try again."
                ) from e
            logger.warning(f"[SessionGen] Baseline attempt {attempt} failed: {e}")
            if attempt < 3:
                time.sleep(2)

    raise GenerationFailedError(
        "The text generator could not create a reading right now. Please try again."
    ) from last_error


# ─────────────────────────────────────────────
#  Continuation generator (Continue button)
# ─────────────────────────────────────────────

def generate_continuation(
    user_id: str,
    previous_session: ReadingSession,
    condition: ConditionType,
    db: Session,
) -> dict:
    """
    Generate a genuine story continuation from the previous session's text.
    Carries the narrative forward rather than starting a fresh topic.
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found.")

    reading_number = _next_reading_number(user_id, db)

    prev_content = (previous_session.content or "")[:800]
    prev_topic   = previous_session.topic_used or "Dutch everyday life"
    cefr_level   = user.estimated_cefr or "B1"

    if condition == ConditionType.BASELINE:
        blue_entries   = _fetch_blue_words(user_id, db)
        yellow_entries = _fetch_yellow_words(user_id, db)
        blue_words     = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
        yellow_words   = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]

        word_translations = {}
        for w in blue_words + yellow_words:
            word_translations[w["word"].lower()] = w["translation"]

        blue_str   = ", ".join(w["word"] for w in blue_words)   or "(none)"
        yellow_str = ", ".join(w["word"] for w in yellow_words) or "(none)"

        continuation_prompt = f"""\
### CONTINUATION TASK
Continue the Dutch text below for a learner at CEFR {cefr_level}.

### PREVIOUS EXCERPT (do NOT repeat this)
\"\"\"{prev_content}...\"\"\"

### VOCABULARY TO WEAVE IN
1. NEW WORDS (wrap in [[word]]): {blue_str}
2. REVIEW WORDS (wrap in [[word]]): {yellow_str}

### INSTRUCTIONS
- Continue the narrative naturally for approximately 180–220 Dutch words.
- Write EXACTLY two (2) paragraphs.
- Maintain the same characters, setting and tone as the excerpt above.
- Wrap every Blue/Yellow word in [[double brackets]] when it appears.
- Ensure the Dutch is natural and grammatically correct for CEFR {cefr_level}.

### OUTPUT SPECIFICATION
Return ONLY valid JSON:
{{
  "title": "A short continuation headline in Dutch",
  "content": "The continuation text with [[target_words]] bracketed",
  "metadata": {{
    "topic_used": "{prev_topic}",
    "cefr_actual": "{cefr_level}",
    "narrative_style": "Continuation",
    "injected_blue_count": 0,
    "injected_yellow_count": 0
  }}
}}
"""
    else:
        blue_entries   = _fetch_blue_words(user_id, db)
        yellow_entries = _fetch_yellow_words(user_id, db)
        blue_words     = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
        yellow_words   = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]

        word_translations = {}
        for w in blue_words + yellow_words:
            word_translations[w["word"].lower()] = w["translation"]

        blue_str   = ", ".join(w["word"] for w in blue_words)   or "(none)"
        yellow_str = ", ".join(w["word"] for w in yellow_words) or "(none)"

        continuation_prompt = f"""\
### CONTINUATION TASK
You are continuing the Dutch story that was started below. The learner is at CEFR {cefr_level}.

### PREVIOUS STORY EXCERPT (for context – do NOT repeat this)
\"\"\"{prev_content}...\"\"\"

### VOCABULARY TO WEAVE IN
1. NEW WORDS (wrap in [[word]]): {blue_str}
2. REVIEW WORDS (wrap in [[word]]): {yellow_str}

### INSTRUCTIONS
- Continue the narrative naturally for approximately 180–220 Dutch words.
- Write EXACTLY two (2) paragraphs.
- Maintain the same characters, setting and tone as the excerpt above.
- Wrap every Blue/Yellow word in [[double brackets]] when it appears.
- Ensure the Dutch is natural and grammatically correct for the specified level.
- Do not exceed CEFR {cefr_level} difficulty.

### OUTPUT SPECIFICATION
Return ONLY valid JSON:
{{
  "title": "A short continuation headline in Dutch",
  "content": "The continuation text with [[target_words]] bracketed",
  "metadata": {{
    "topic_used": "{prev_topic}",
    "cefr_actual": "{cefr_level}",
    "narrative_style": "Continuation",
    "injected_blue_count": 0,
    "injected_yellow_count": 0
  }}
}}
"""

    logger.info(
        "[SessionGen] generating continuation for user=%s prev_session=%s",
        user_id, previous_session.session_id,
    )

    last_error = None
    for attempt in range(1, 4):
        try:
            response = _client.models.generate_content(
                model=GEMINI_MODEL,
                contents=continuation_prompt,
                config={"system_instruction": _SYSTEM_INSTRUCTION},
            )
            text = response.text.strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            story_json = json.loads(text)
            logger.info("[SessionGen] continuation title=%r", story_json.get("title"))

            # Append to existing session
            previous_session.content += "\n\n" + story_json.get("content", "")
            
            # Merge translations
            existing_translations = previous_session.word_translations or {}
            existing_translations.update(word_translations)
            previous_session.word_translations = existing_translations
            
            # Use SQLAlchemy flag_modified if word_translations is JSON
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(previous_session, "word_translations")
            
            db.commit()
            db.refresh(previous_session)

            return {
                "session_id":       previous_session.session_id,
                "title":            previous_session.title,
                "content":          previous_session.content,
                "topic_used":       prev_topic,
                "blue_words":       blue_words,
                "yellow_words":     yellow_words,
                "word_translations":existing_translations,
                "metadata":         story_json.get("metadata", {}),
                "reading_number":   reading_number,
                "condition":        condition.value,
            }
        except Exception as e:
            last_error = e
            if _is_rate_limit_error(e):
                raise GenerationRateLimitError(
                    "The text generator is temporarily rate limited. Please wait a moment."
                ) from e
            logger.warning(f"[SessionGen] Continuation attempt {attempt} failed: {e}")
            if attempt < 3:
                time.sleep(2)

    raise GenerationFailedError(
        "Could not generate a continuation. Please try again."
    ) from last_error
