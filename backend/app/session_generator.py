"""Reading generation for adaptive and baseline study sessions."""

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
    OnboardingWords,
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
    pass


class GenerationFailedError(RuntimeError):
    pass


def _is_rate_limit_error(error: Exception) -> bool:
    message = str(error).lower()
    return (
        "429" in message
        or "quota" in message
        or "resource_exhausted" in message
        or "rate limit" in message
    )

_SYSTEM_INSTRUCTION = """\
Write Dutch reading texts for second-language learners.
Match the requested CEFR level, use the supplied learner context when allowed,
and place each target word naturally in the text.
Wrap every target word in double brackets, like [[woord]].
"""

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

_FIXED_STYLE = "Informative Educational Semi-Narrative Article"


def _survey_signal_prompt_block(session: ReadingSession | None) -> str:
    if session is None or not session.survey_signal:
        return ""

    sig = session.survey_signal
    lines: list[str] = []

    tlx_md = sig.get("tlx_md", 4)
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

    if sig.get("engagement_boost"):
        lines.append(
            "The learner's engagement score was LOW. "
            "Vary the genre or narrative style (e.g. switch from informational to story-based, "
            "or use an unexpected setting). Make the topic feel fresh and surprising."
        )

    if not sig.get("felt_personalised", True):
        lines.append(
            "The learner did NOT feel the previous text was personalised. "
            "Make the connection to their stated interests more explicit — "
            "mention those interests directly in the text."
        )

    return "\n".join(lines)


def generate_session(
    user_id: str,
    K: float,
    word_count_range: str,
    condition: ConditionType,
    db: Session,
    narrative_style: str = _FIXED_STYLE,
) -> dict:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found.")

    study_phase = 2 if user.has_switched_conditions else 1
    reading_number = _next_reading_number(user_id, study_phase, db)

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

    recent_sessions = (
        db.query(ReadingSession)
        .filter(
            ReadingSession.user_id == user_id,
            ReadingSession.study_phase == study_phase,
        )
        .order_by(ReadingSession.session_id.desc())
        .limit(6)
        .all()
    )
    used_topics = {s.topic_used for s in recent_sessions if s.topic_used}
    recent_titles = [s.title for s in recent_sessions if s.title]

    if condition == ConditionType.ADAPTIVE:
        selected_topic = _topic_roll(user_id, K, db, used_topics=used_topics)
        blue_entries   = _fetch_blue_words(user_id, db)
        yellow_entries = _fetch_yellow_words(user_id, study_phase, db)
        blue_words     = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
        yellow_words   = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]
        story_json = _generate_story_content(
            user=user,
            selected_topic=selected_topic,
            narrative_style=narrative_style,
            word_count_range=word_count_range,
            blue_words=[w["word"] for w in blue_words],
            yellow_words=[w["word"] for w in yellow_words],
            survey_block=survey_block,
            recent_titles=recent_titles,
        )
    else:
        neutral_unused = [t for t in _NEUTRAL_POOL if t not in used_topics]
        selected_topic = random.choice(neutral_unused or _NEUTRAL_POOL)
        blue_entries   = _fetch_blue_words(user_id, db)
        yellow_entries = _fetch_yellow_words(user_id, study_phase, db)
        blue_words     = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
        yellow_words   = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]
        story_json = _generate_baseline_content(
            cefr_level=user.estimated_cefr or "B1",
            topic=selected_topic,
            word_count_range=word_count_range,
            blue_words=[w["word"] for w in blue_words],
            yellow_words=[w["word"] for w in yellow_words],
            recent_titles=recent_titles,
        )

    word_translations: dict[str, str] = {}
    for w in blue_words + yellow_words:
        word_translations[w["word"].lower()] = w["translation"]

    session = ReadingSession(
        user_id=user_id,
        title=story_json.get("title", ""),
        content=story_json.get("content", ""),
        topic_used=selected_topic,
        condition=condition,
        reading_number=reading_number,
        study_phase=study_phase,
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
        "study_phase":      study_phase,
        "condition":        condition.value,
    }


def _next_reading_number(user_id: str, study_phase: int, db: Session) -> int:
    count = (
        db.query(ReadingSession)
        .filter(
            ReadingSession.user_id == user_id,
            ReadingSession.study_phase == study_phase,
        )
        .count()
    )
    return count + 1


def _topic_roll(user_id: str, K: float, db: Session, used_topics: set[str] | None = None) -> str:
    hated = {
        t.topic_name
        for t in db.query(UserTopic)
        .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.HATED)
        .all()
    }
    excluded = hated | (used_topics or set())

    r = random.random()

    if r < K:
        candidates = [
            t.topic_name
            for t in db.query(UserTopic)
            .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.INTERESTED)
            .all()
            if t.topic_name not in excluded
        ]
        if not candidates:
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
            if t.topic_name not in excluded
        ]
        candidates = neutral + [t for t in _NEUTRAL_POOL if t not in excluded]
        if not candidates:
            candidates = [t for t in _NEUTRAL_POOL if t not in hated]

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


def _fetch_yellow_words(user_id: str, study_phase: int, db: Session) -> list[UserVocabularyVector]:
    phase_learning = (
        db.query(UserVocabularyVector)
        .join(Lexicon)
        .join(
            OnboardingWords,
            (OnboardingWords.user_id == UserVocabularyVector.user_id)
            & (OnboardingWords.word_id == UserVocabularyVector.word_id),
        )
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.status == VocabStatus.LEARNING,
            OnboardingWords.study_phase == study_phase,
        )
        .order_by(OnboardingWords.id.asc())
        .all()
    )

    if phase_learning:
        return phase_learning[:5]

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


def _generate_story_content(
    user: User,
    selected_topic: str,
    narrative_style: str,
    word_count_range: str,
    blue_words: list[str],
    yellow_words: list[str],
    survey_block: str,
    recent_titles: list[str] | None = None,
) -> dict:
    blue_str   = ", ".join(blue_words)   if blue_words   else "(none)"
    yellow_str = ", ".join(yellow_words) if yellow_words else "(none)"

    survey_section = (
        f"\n### FEEDBACK FROM LEARNER'S PREVIOUS SESSION\n{survey_block}\n"
        if survey_block else ""
    )

    titles_to_avoid_section = ""
    if recent_titles:
        avoid_list = "\n".join(f"- {t}" for t in recent_titles)
        titles_to_avoid_section = f"\n### TITLES ALREADY USED (do NOT reuse or closely paraphrase these)\n{avoid_list}\n"

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
{survey_section}{titles_to_avoid_section}
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
                logger.warning(f"[SessionGen] Gemini rate-limited (attempt {attempt}): {e}")
                if attempt < 3:
                    wait = 15 * attempt
                    logger.info(f"[SessionGen] Waiting {wait}s before retry...")
                    time.sleep(wait)
                    continue
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
    topic: str,
    word_count_range: str,
    blue_words: list[str],
    yellow_words: list[str],
    recent_titles: list[str] | None = None,
) -> dict:
    blue_str   = ", ".join(blue_words)   if blue_words   else "(none)"
    yellow_str = ", ".join(yellow_words) if yellow_words else "(none)"

    titles_section = ""
    if recent_titles:
        avoid_list = "\n".join(f"- {t}" for t in recent_titles)
        titles_section = f"\n### TITLES ALREADY USED (do NOT reuse)\n{avoid_list}\n"

    prompt = f"""\
### TASK
Write a Dutch reading text for a language learner at CEFR level {cefr_level}.

### CONTENT CONFIGURATION
- Topic: {topic}
- Style: Informative Educational Semi-Narrative Article
{titles_section}
### MANDATORY VOCABULARY INJECTION
1. BLUE WORDS (New — must appear at least once, wrapped in [[word]]): {blue_str}
2. YELLOW WORDS (Review — reinforce naturally, wrapped in [[word]]): {yellow_str}

### INSTRUCTIONS
Write a cohesive Dutch text of approximately {word_count_range} words.
- Ensure ALL Blue and Yellow words appear at least once, bracketed as [[word]].
- Ensure difficulty does not exceed CEFR {cefr_level}.
- Write for a general adult learner. Do NOT personalise with names, cities, or jobs.

### OUTPUT SPECIFICATION
Return ONLY a valid JSON object:
{{
  "title": "A Dutch headline",
  "content": "The full Dutch text with [[target_words]] bracketed",
  "metadata": {{
    "topic_used": "{topic}",
    "cefr_actual": "{cefr_level}",
    "narrative_style": "Informative Educational Semi-Narrative Article",
    "injected_blue_count": 0,
    "injected_yellow_count": 0
  }}
}}
"""
    logger.info("[SessionGen] BASELINE generating topic=%s level=%s blue=%d yellow=%d",
                topic, cefr_level, len(blue_words), len(yellow_words))
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
            logger.info("[SessionGen] BASELINE title=%r", result.get("title"))
            return result
        except Exception as e:
            last_error = e
            if _is_rate_limit_error(e):
                if attempt < 3:
                    time.sleep(15 * attempt)
                    continue
                raise GenerationRateLimitError(
                    "The text generator is temporarily rate limited. Please wait a moment and try again."
                ) from e
            if attempt < 3:
                time.sleep(2)
    raise GenerationFailedError(
        "The text generator could not create a reading right now. Please try again."
    ) from last_error


def _generate_session_summary(content: str, topic: str) -> str:
    summary_prompt = (
        f"Read the following Dutch educational text about '{topic}' and write a concise "
        f"3-5 sentence summary IN ENGLISH covering: the main topic, key entities or characters "
        f"mentioned, key concepts or scenarios explained, and how the text ended. "
        f"Return ONLY the plain summary text, no labels or JSON.\n\n"
        f"TEXT:\n{content[:3000]}"
    )
    try:
        response = _client.models.generate_content(
            model=GEMINI_MODEL,
            contents=summary_prompt,
        )
        return response.text.strip()
    except Exception as exc:
        logger.warning("[SessionGen] Summary generation failed, using tail excerpt: %s", exc)
        return content[-400:].strip()


def _build_narrative_memory(
    content: str,
    topic: str,
    blue_words: list[str],
    yellow_words: list[str],
    existing_memory: dict | None = None,
) -> dict:
    prev = existing_memory or {}

    subtopics_used: list[str] = list(prev.get("subtopics_used", []))
    if topic and topic not in subtopics_used:
        subtopics_used.append(topic)

    vocabulary_used: list[str] = list(prev.get("vocabulary_used", []))
    for w in blue_words + yellow_words:
        if w not in vocabulary_used:
            vocabulary_used.append(w)

    discourse_summary = _generate_session_summary(content, topic)

    last_ending_context = content.strip()[-300:].strip()

    return {
        "topic": topic,
        "subtopics_used": subtopics_used,
        "entities": prev.get("entities", []),
        "concepts_explained": prev.get("concepts_explained", []),
        "vocabulary_used": vocabulary_used,
        "discourse_summary": discourse_summary,
        "last_ending_context": last_ending_context,
    }


def generate_continuation(
    user_id: str,
    previous_session: ReadingSession,
    condition: ConditionType,
    db: Session,
) -> dict:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found.")

    reading_number = previous_session.reading_number
    study_phase = previous_session.study_phase

    blue_entries   = _fetch_blue_words(user_id, db)
    yellow_entries = _fetch_yellow_words(user_id, study_phase, db)
    blue_words     = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
    yellow_words   = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]

    word_translations: dict[str, str] = {}
    for w in blue_words + yellow_words:
        word_translations[w["word"].lower()] = w["translation"]

    blue_str   = ", ".join(w["word"] for w in blue_words)   or "(none)"
    yellow_str = ", ".join(w["word"] for w in yellow_words) or "(none)"

    prev_content  = (previous_session.content or "")[:800]
    prev_topic    = previous_session.topic_used or "Dutch everyday life"
    cefr_level    = user.estimated_cefr or "B1"

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

            previous_session.content += "\n\n" + story_json.get("content", "")
            existing_translations = previous_session.word_translations or {}
            existing_translations.update(word_translations)
            previous_session.word_translations = existing_translations

            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(previous_session, "word_translations")

            db.commit()
            db.refresh(previous_session)

            return {
                "session_id":        previous_session.session_id,
                "title":             previous_session.title,
                "content":           previous_session.content,
                "topic_used":        prev_topic,
                "blue_words":        blue_words,
                "yellow_words":      yellow_words,
                "word_translations": existing_translations,
                "metadata":          story_json.get("metadata", {}),
                "reading_number":    reading_number,
                "condition":         condition.value,
            }
        except Exception as e:
            last_error = e
            if _is_rate_limit_error(e):
                logger.warning(f"[SessionGen] Gemini rate-limited continuation (attempt {attempt}): {e}")
                if attempt < 3:
                    wait = 15 * attempt
                    logger.info(f"[SessionGen] Waiting {wait}s before retry...")
                    time.sleep(wait)
                    continue
                raise GenerationRateLimitError(
                    "The text generator is temporarily rate limited. Please wait a moment."
                ) from e
            logger.warning(f"[SessionGen] Continuation attempt {attempt} failed: {e}")
            if attempt < 3:
                time.sleep(2)

    raise GenerationFailedError(
        "Could not generate a continuation. Please try again."
    ) from last_error
