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
You are an expert Dutch Pedagogical Content Creator specialising in L2 educational reading.
Your target style is: Personalized Informative Exploration — halfway between National Geographic
(simplified) and a CEFR reading comprehension passage.

Your writing must adhere to five strict pillars:

1. CEFR Alignment: Follow the specified CEFR level's grammar and sentence length strictly.

2. Educational Article Style: Write like an informative Dutch magazine or cultural-explainer
   article. Prefer events, discoveries, named places, real organizations, and factual
   explanations over fiction, diary entries, or emotional reflection.

3. Informational Density: Every paragraph must teach something concrete and specific.
   Include real statistics, named locations, studies, comparisons, rankings, cultural
   facts, historical context, or expert examples. Generic statements like 'movement is
   healthy' are NOT acceptable unless immediately followed by a real number, study, or
   concrete example. Write like a journalist, not like a brochure.

4. Subtle Personalisation: Let the learner's interests and location INSPIRE the specific
   angle — a sports fan gets cycling statistics, a tech fan gets AI examples, a traveller
   gets cultural comparisons. Do NOT make the article 'about' the learner.
   The reader thinks: 'this topic fits my world', not 'this text is about me'.

5. Lexical Injection: Weave every Target Word naturally into an informative, contextual
   sentence. Vocabulary must feel integral to the facts, not bolted on.

Formatting Rule: Every time you use a word from the provided Target Lists,
you MUST wrap it in double brackets, like this: [[woord]].\
"""

# Extra topic pool for NEUTRAL rolls — broad, educationally grounded topics
_NEUTRAL_POOL = [
    "reizen", "technologie", "muziek", "natuur", "gezondheid",
    "wetenschap", "duurzaamheid", "sport", "cultuur", "innovatie",
    "voedsel", "media", "geschiedenis", "steden", "onderwijs",
]

# Fixed internal style — no longer user-selectable
_FIXED_STYLE = "Informative Educational Semi-Narrative Article"


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
    word_count_range: str,
    condition: ConditionType,
    db: Session,
    narrative_style: str = _FIXED_STYLE,   # kept for schema compat; always overridden
) -> dict:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found.")

    # Derive the current study phase from the user's crossover state
    study_phase = 2 if user.has_switched_conditions else 1

    # 1. Determine reading number — resets to 1 at the start of Phase 2
    reading_number = _next_reading_number(user_id, study_phase, db)

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

    recent_sessions = (
        db.query(ReadingSession)
        .filter(ReadingSession.user_id == user_id)
        .order_by(ReadingSession.session_id.desc())
        .limit(5)
        .all()
    )
    recent_topics = [s.topic_used for s in recent_sessions if s.topic_used]
    recent_titles = [s.title for s in recent_sessions if s.title]
    used_topics = set(recent_topics)

    if condition == ConditionType.ADAPTIVE:
        selected_topic = _topic_roll(user_id, K, db, exclude_topics=used_topics)
        blue_entries   = _fetch_blue_words(user_id, db)
        yellow_entries = _fetch_yellow_words(user_id, study_phase, db)
        blue_words     = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
        yellow_words   = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]
        story_json = _generate_story_content(
            user=user,
            selected_topic=selected_topic,
            word_count_range=word_count_range,
            blue_words=[w["word"] for w in blue_words],
            yellow_words=[w["word"] for w in yellow_words],
            survey_block=survey_block,
            recent_topics=recent_topics,
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

    # 6. Build word_translations dict (all highlighted words → translation)
    word_translations: dict[str, str] = {}
    for w in blue_words + yellow_words:
        word_translations[w["word"].lower()] = w["translation"]

    # 7. Persist session — stamped with study_phase
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

    # 8. Build and save narrative memory (enables coherent continuations)
    from sqlalchemy.orm.attributes import flag_modified
    session.narrative_memory = _build_narrative_memory(
        content=session.content,
        topic=selected_topic,
        blue_words=[w["word"] for w in blue_words],
        yellow_words=[w["word"] for w in yellow_words],
    )
    flag_modified(session, "narrative_memory")
    db.commit()

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


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

def _next_reading_number(user_id: str, study_phase: int, db: Session) -> int:
    """Count sessions in the current study_phase only — so Phase 2 restarts from 1."""
    count = (
        db.query(ReadingSession)
        .filter(
            ReadingSession.user_id == user_id,
            ReadingSession.study_phase == study_phase,
        )
        .count()
    )
    return count + 1


def _topic_roll(
    user_id: str,
    K: float,
    db: Session,
    exclude_topics: set[str] | None = None,
) -> str:
    """Select a topic, preferring ones not used in recent sessions."""
    excluded = exclude_topics or set()
    hated = {
        t.topic_name
        for t in db.query(UserTopic)
        .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.HATED)
        .all()
    }
    blocked = hated | excluded

    r = random.random()

    if r < K:
        candidates = [
            t.topic_name
            for t in db.query(UserTopic)
            .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.INTERESTED)
            .all()
            if t.topic_name not in blocked
        ]
        # Fallback: allow recently-used interested topics if all are excluded
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
            if t.topic_name not in blocked
        ]
        candidates = neutral + [t for t in _NEUTRAL_POOL if t not in blocked]

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
    phase_word_ids = {
        row.word_id
        for row in db.query(OnboardingWords)
        .filter(
            OnboardingWords.user_id == user_id,
            OnboardingWords.study_phase == study_phase,
        )
        .all()
    }

    if not phase_word_ids:
        return []

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
            UserVocabularyVector.word_id.in_(phase_word_ids),
        )
        .order_by(OnboardingWords.id.asc())
        .all()
    )

    if phase_learning:
        return phase_learning[:5]
    return []


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
    word_count_range: str,
    blue_words: list[str],
    yellow_words: list[str],
    survey_block: str,
    recent_topics: list[str] | None = None,
) -> dict:
    blue_str   = ", ".join(blue_words)   if blue_words   else "(none)"
    yellow_str = ", ".join(yellow_words) if yellow_words else "(none)"

    survey_section = (
        f"\n### ADAPTATION FROM PREVIOUS SESSION\n{survey_block}\n"
        if survey_block else ""
    )

    recent_str = ", ".join(recent_topics) if recent_topics else "(none)"

    # Learner context — used to inspire topic angle, not dominate the text
    purpose  = user.purpose or user.learning_purpose or "general Dutch learning"
    cefr     = user.estimated_cefr or "B1"
    city     = user.city or user.location or ""
    job      = user.job or ""
    mother_l = user.mother_language or user.native_language or "not specified"

    prompt = f"""\
### GENERATION TASK
Write a Personalized Informative Exploration article in Dutch.
Target: National Geographic (simplified) × CEFR reading passage × educational travel magazine.
NOT a generic health-tip listicle. NOT a personal diary. NOT vague Wikipedia prose.

### LEARNER PROFILE (pick a concrete sub-angle that resonates — do NOT write about the learner)
- CEFR Level: {cefr}
- Mother Language: {mother_l}
- Learning Purpose: {purpose}
- Location: {city or "(not specified)"}
- Occupation: {job or "(not specified)"}
Angle guidance by profile type (examples — adapt to the actual topic):
  sports/fitness interest → specific athletic events, records, infrastructure, training science
  technology interest    → real companies, innovations, data, AI or engineering examples
  travel/culture         → hidden statistics, cultural comparisons, local traditions, tourism data
  business/work          → economic impact, industry numbers, startup ecosystems, market shifts
  health/science         → clinical findings, WHO/EU data, named studies, biological mechanisms

### TOPIC
{selected_topic}

### TOPIC DIVERSITY (avoid these recently covered topics and their close subtopics)
Recently used: {recent_str}

### MANDATORY VOCABULARY
1. BLUE WORDS (new — use each at least once, wrap in [[word]]): {blue_str}
2. YELLOW WORDS (reinforce — use naturally, wrap in [[word]]): {yellow_str}
{survey_section}
### INFORMATIONAL RICHNESS — MANDATORY
The article MUST contain at least THREE of the following:
  a) A real statistic or number  (e.g. "23 miljoen fietsen voor 18 miljoen Nederlanders")
  b) A named real-world location, organization, institution, or event
  c) A comparison between countries, cities, cultures, or time periods
  d) A surprising or counterintuitive fact
  e) A specific historical date, scientific finding, or expert discovery
  f) A concrete real-world case study or example

Do NOT write vague generalities. Every claim should feel grounded and specific.
BAD:  "Veel mensen bewegen tegenwoordig te weinig."
GOOD: "Volgens de WHO beweegt meer dan een kwart van de wereldbevolking onvoldoende —
       in Nederland geldt dit voor ruim 3,5 miljoen volwassenen."

### PARAGRAPH STRUCTURE — MANDATORY PROGRESSION
Follow this informational arc. Each step must add genuinely new content:
  §1 Hook     — open with a concrete fact, surprising statistic, or vivid specific example.
  §2 Depth    — explain one key aspect with real grounding (number, named place, study).
  §3 Expand   — add a comparison, cultural angle, or contrasting perspective.
  §4 Implication (if word count allows) — consequence, trend, or practical application.
NEVER repeat the same idea twice, even with different wording.

### WRITING REQUIREMENTS
- Length: approximately {word_count_range} Dutch words.
- Difficulty: CEFR {cefr} — clear grammar, appropriate sentence complexity, no advanced subjunctive.
- Vocabulary: integrate [[target_words]] into factual, informative sentences where they fit naturally.
- Personalisation: the specific sub-angle subtly fits the learner profile above.
  Do NOT address the reader directly or repeat their city/job more than once if at all.
- Avoid: repeated phrases, thematic loops, restating the same idea, empty encouragement.

### OUTPUT SPECIFICATION
Return ONLY valid JSON:
{{
  "title": "A specific, informative Dutch headline (include a number or named place if natural)",
  "content": "The full Dutch article with [[target_words]] bracketed",
  "metadata": {{
    "topic_used": "{selected_topic}",
    "cefr_actual": "{cefr}",
    "narrative_style": "{_FIXED_STYLE}",
    "injected_blue_count": 0,
    "injected_yellow_count": 0
  }}
}}
"""

    logger.info(
        "[SessionGen] generating text for user=%s topic=%s level=%s blue=%d yellow=%d survey=%s",
        user.user_id, selected_topic, cefr,
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


# ─────────────────────────────────────────────
#  Narrative memory helpers
# ─────────────────────────────────────────────

def _generate_session_summary(content: str, topic: str) -> str:
    """
    Ask Gemini to produce a 3-5 sentence semantic summary of the generated text.
    This summary replaces raw text truncation in continuation prompts.
    Falls back to a simple tail-excerpt on failure.
    """
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
        # Graceful fallback: last 400 chars give the "ending context"
        return content[-400:].strip()


def _build_narrative_memory(
    content: str,
    topic: str,
    blue_words: list[str],
    yellow_words: list[str],
    existing_memory: dict | None = None,
) -> dict:
    """
    Build / update the structured narrative memory for a session.
    Merges with any pre-existing memory so continuation chains accumulate state.
    """
    prev = existing_memory or {}

    # Accumulate subtopics_used (topic is always the first entry)
    subtopics_used: list[str] = list(prev.get("subtopics_used", []))
    if topic and topic not in subtopics_used:
        subtopics_used.append(topic)

    # Accumulate vocabulary_used
    vocabulary_used: list[str] = list(prev.get("vocabulary_used", []))
    for w in blue_words + yellow_words:
        if w not in vocabulary_used:
            vocabulary_used.append(w)

    # Generate fresh discourse summary
    discourse_summary = _generate_session_summary(content, topic)

    # Last-ending context: final ~300 chars of current content for narrative bridging
    last_ending_context = content.strip()[-300:].strip()

    return {
        "topic": topic,
        "subtopics_used": subtopics_used,
        # entities / concepts_explained start empty; the LLM fills them over time
        "entities": prev.get("entities", []),
        "concepts_explained": prev.get("concepts_explained", []),
        "vocabulary_used": vocabulary_used,
        "discourse_summary": discourse_summary,
        "last_ending_context": last_ending_context,
    }


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
    Generate a coherent continuation using structured narrative memory.
    Uses semantic summary + topic/entity/concept state instead of raw text truncation.
    """
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

    prev_topic = previous_session.topic_used or "Dutch everyday life"
    cefr_level = user.estimated_cefr or "B1"

    # ── Read structured narrative memory ──────────────────────────────────
    mem: dict = previous_session.narrative_memory or {}

    discourse_summary    = mem.get("discourse_summary") or (previous_session.content or "")[-600:]
    last_ending_context  = mem.get("last_ending_context") or (previous_session.content or "")[-300:]
    subtopics_used       = mem.get("subtopics_used", [prev_topic])
    concepts_explained   = mem.get("concepts_explained", [])
    vocab_already_used   = mem.get("vocabulary_used", [])
    entities             = mem.get("entities", [])

    # Format anti-repetition memory blocks for the prompt
    subtopics_str  = ", ".join(subtopics_used)  if subtopics_used  else "(none yet)"
    concepts_str   = ", ".join(concepts_explained) if concepts_explained else "(none recorded)"
    vocab_used_str = ", ".join(vocab_already_used) if vocab_already_used else "(none)"
    entities_str   = ", ".join(entities)         if entities         else "(none recorded)"

    # New vocab = only words not already injected in previous segments
    new_blue_str   = ", ".join(
        w["word"] for w in blue_words   if w["word"] not in vocab_already_used
    ) or blue_str
    new_yellow_str = ", ".join(
        w["word"] for w in yellow_words if w["word"] not in vocab_already_used
    ) or yellow_str

    continuation_prompt = f"""\
### CONTINUATION TASK
The learner has ALREADY READ the previous section of this Dutch educational article.
Write the NEXT SECTION — advancing the article with new, concrete information.
Do NOT restart, summarise, repeat, or rephrase anything already covered.
The learner is at CEFR {cefr_level}.

### WHAT HAS BEEN COVERED (do NOT repeat, rephrase, or re-explain any of this)
**Article summary so far:**
{discourse_summary}

**Last sentence / ending context (continue directly from here):**
"{last_ending_context}"

**Subtopics already covered:** {subtopics_str}
**Concepts / facts already explained:** {concepts_str}
**Vocabulary already used:** {vocab_used_str}

### NEW VOCABULARY TO WEAVE IN (this continuation only)
1. BLUE WORDS — wrap in [[word]]: {new_blue_str}
2. YELLOW WORDS — wrap in [[word]]: {new_yellow_str}

### INFORMATIONAL RICHNESS — MANDATORY
This continuation MUST introduce at least TWO new concrete data points not in the summary above.
Choose from:
  - A real statistic, number, or percentage
  - A named location, organization, institution, or event
  - A comparison between countries, eras, or groups
  - A surprising or counterintuitive fact
  - A scientific finding, historical date, or expert example

BAD:  "Beweging is goed voor de gezondheid." (already covered, vague)
GOOD: "Onderzoek van de Vrije Universiteit Amsterdam toonde aan dat twintig minuten
       wandelen per dag het risico op hart- en vaatziekten met vijftien procent verlaagt."

### STRICT CONTINUATION REQUIREMENTS
Style: Personalized Informative Exploration — factual, specific, magazine-like.
- Continue DIRECTLY from where the article ended — no recap, no re-introduction.
- Each paragraph must advance the topic with genuinely NEW information.
- Prioritise: new facts, events, named places, statistics, comparisons, implications.
- Avoid: repeating emotional states, motivational loops, re-explaining prior concepts.
- Vocabulary: integrate [[target_words]] into factual, informative sentences.
- Length: approximately 180–220 Dutch words across EXACTLY two (2) paragraphs.
- Difficulty: CEFR {cefr_level} — grammatically correct, appropriately complex Dutch.

### OUTPUT SPECIFICATION
Return ONLY valid JSON:
{{
  "title": "A short, specific informative continuation headline in Dutch",
  "content": "The continuation text with [[target_words]] bracketed",
  "metadata": {{
    "topic_used": "{prev_topic}",
    "cefr_actual": "{cefr_level}",
    "narrative_style": "{_FIXED_STYLE}",
    "injected_blue_count": 0,
    "injected_yellow_count": 0
  }}
}}
"""

    logger.info(
        "[SessionGen] generating continuation for user=%s prev_session=%s "
        "subtopics=%s vocab_used=%d",
        user_id, previous_session.session_id,
        subtopics_str, len(vocab_already_used),
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

            # ── Append continuation to session content ─────────────────────
            new_content_chunk = story_json.get("content", "")
            previous_session.content += "\n\n" + new_content_chunk

            # ── Merge word translations ────────────────────────────────────
            existing_translations = previous_session.word_translations or {}
            existing_translations.update(word_translations)
            previous_session.word_translations = existing_translations

            # ── Update structured narrative memory ─────────────────────────
            previous_session.narrative_memory = _build_narrative_memory(
                content=previous_session.content,
                topic=prev_topic,
                blue_words=[w["word"] for w in blue_words],
                yellow_words=[w["word"] for w in yellow_words],
                existing_memory=mem,
            )

            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(previous_session, "word_translations")
            flag_modified(previous_session, "narrative_memory")

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
                raise GenerationRateLimitError(
                    "The text generator is temporarily rate limited. Please wait a moment."
                ) from e
            logger.warning(f"[SessionGen] Continuation attempt {attempt} failed: {e}")
            if attempt < 3:
                time.sleep(2)

    raise GenerationFailedError(
        "Could not generate a continuation. Please try again."
    ) from last_error
