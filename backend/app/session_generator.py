from __future__ import annotations

import json
import logging
import random
import re
import time
import datetime

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


def _strip_inline_markdown(text: str | None) -> str:
    if not text:
        return ""
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"_([^_]+)_", r"\1", text)
    return text


def _clean_generated_text(result: dict) -> dict:
    result["title"] = _strip_inline_markdown(result.get("title"))
    result["content"] = _strip_inline_markdown(result.get("content"))
    return result


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
you MUST wrap it in double brackets, like this: [[woord]]. Do NOT wrap any other words in brackets.\
"""

_NEUTRAL_POOL = [
    "reizen", "technologie", "muziek", "natuur", "gezondheid",
    "wetenschap", "duurzaamheid", "sport", "cultuur", "innovatie",
    "voedsel", "media", "geschiedenis", "steden", "onderwijs",
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
    k_value: float,
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

    if condition == ConditionType.ADAPTIVE:
        prev_session = (
            db.query(ReadingSession)
            .filter(
                ReadingSession.user_id == user_id,
                ReadingSession.study_phase == study_phase,
                ReadingSession.condition == ConditionType.ADAPTIVE,
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
                ReadingSession.condition == ConditionType.ADAPTIVE,
            )
            .order_by(ReadingSession.session_id.desc())
            .limit(5)
            .all()
        )
        recent_topics = [s.topic_used for s in recent_sessions if s.topic_used]
        used_topics = set(recent_topics)

        selected_topic = _topic_roll(user_id, k_value, db, exclude_topics=used_topics)
        blue_entries = _fetch_blue_words(user_id, study_phase, db, condition=ConditionType.ADAPTIVE)
        yellow_entries = _fetch_yellow_words(user_id, study_phase, db)
        if yellow_entries:
            sample_size = random.randint(2, max(3, len(yellow_entries)))
            sample_size = min(sample_size, len(yellow_entries))
            yellow_entries = random.sample(yellow_entries, sample_size)
        
        blue_words = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
        yellow_words = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]
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
        selected_topic = random.choice(_NEUTRAL_POOL)
        blue_entries = _fetch_blue_words(user_id, study_phase, db, condition=ConditionType.BASELINE)
        yellow_entries = []   # Baseline: no target-word injection at all
        blue_words = [_lex_to_dict(e.lexicon_entry) for e in blue_entries]
        yellow_words = []
        story_json = _generate_baseline_content(
            cefr_level=user.estimated_cefr or "B1",
            topic=selected_topic,
            word_count_range=word_count_range,
            blue_words=[w["word"] for w in blue_words],
            yellow_words=[],
            recent_titles=None,
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
        "session_id": session.session_id,
        "title": story_json.get("title", ""),
        "content": story_json.get("content", ""),
        "topic_used": selected_topic,
        "blue_words": blue_words,
        "yellow_words": yellow_words,
        "word_translations": word_translations,
        "metadata": story_json.get("metadata", {}),
        "reading_number": reading_number,
        "study_phase": study_phase,
        "condition": condition.value,
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


def _topic_roll(
    user_id: str,
    k_value: float,
    db: Session,
    exclude_topics: set[str] | None = None,
) -> str:
    excluded = exclude_topics or set()
    hated = {
        t.topic_name
        for t in db.query(UserTopic)
        .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.HATED)
        .all()
    }
    blocked = hated | excluded

    r = random.random()

    if r < k_value:
        candidates = [
            t.topic_name
            for t in db.query(UserTopic)
            .filter(UserTopic.user_id == user_id, UserTopic.status == TopicStatus.INTERESTED)
            .all()
            if t.topic_name not in blocked
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
            if t.topic_name not in blocked
        ]
        candidates = neutral + [t for t in _NEUTRAL_POOL if t not in blocked]

    if not candidates:
        candidates = [t for t in _NEUTRAL_POOL if t not in hated] or ["dagelijks leven"]

    return random.choice(candidates)


def _fetch_blue_words(user_id: str, study_phase: int, db: Session, condition: ConditionType = ConditionType.ADAPTIVE) -> list[RecommendedVocabulary]:
    if condition == ConditionType.ADAPTIVE:
        # Adaptive: words tagged "adaptive" by run_krs
        all_recs = (
            db.query(RecommendedVocabulary)
            .filter(
                RecommendedVocabulary.user_id == user_id,
                RecommendedVocabulary.remark == "adaptive",
            )
            .join(Lexicon)
            .all()
        )
    else:
        # Baseline: words tagged "baseline" by run_baseline_krs
        all_recs = (
            db.query(RecommendedVocabulary)
            .filter(
                RecommendedVocabulary.user_id == user_id,
                RecommendedVocabulary.remark == "baseline",
            )
            .join(Lexicon)
            .all()
        )
    if not all_recs:
        return []
    if condition == ConditionType.ADAPTIVE:
        k = min(len(all_recs), random.randint(1, 2))
    else:
        k = min(len(all_recs), random.randint(2, 4))
    return random.sample(all_recs, k)


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

    return phase_learning


def _lex_to_dict(entry: Lexicon) -> dict:
    return {
        "word_id": entry.word_id,
        "word": entry.word,
        "translation": entry.translation,
        "cefr_level": entry.cefr_level,
        "examples": entry.examples or [],
    }


def _generate_story_content(
    user: User,
    selected_topic: str,
    word_count_range: str,
    blue_words: list[str],
    yellow_words: list[str],
    survey_block: str,
    recent_topics: list[str] | None = None,
) -> dict:
    blue_str = ", ".join(blue_words) if blue_words else "(none)"
    yellow_str = ", ".join(yellow_words) if yellow_words else "(none)"

    survey_section = (
        f"\n### ADAPTATION FROM PREVIOUS SESSION\n{survey_block}\n"
        if survey_block else ""
    )

    recent_str = ", ".join(recent_topics) if recent_topics else "(none)"

    purpose = user.purpose or getattr(user, "learning_purpose", None) or "general Dutch learning"
    cefr = user.estimated_cefr or "B1"
    city = user.city or getattr(user, "location", None) or ""
    job = user.job or ""
    academic = user.academic_background or "not specified"

    profile_pool = []
    if city: profile_pool.append(f"Location: {city}")
    if job: profile_pool.append(f"Occupation: {job}")
    if academic and academic != "not specified": profile_pool.append(f"Academic Background: {academic}")
    if purpose and purpose != "general Dutch learning": profile_pool.append(f"Learning Purpose: {purpose}")

    spotlight_attributes = random.sample(profile_pool, min(2, len(profile_pool))) if profile_pool else ["General Adult Learner"]
    spotlight_str = "\n".join(f"- {attr}" for attr in spotlight_attributes)

    if cefr in ["A1", "A2"]:
        length_constraint = "100-150"
        difficulty_instruction = f"Difficulty: CEFR {cefr} — Use simple, short sentences. You CAN use basic connectors (like 'en', 'maar', 'want', 'omdat') so the text flows naturally. Avoid highly complex nested clauses, but ensure the story is connected and logical."
    else:
        length_constraint = word_count_range
        difficulty_instruction = f"Difficulty: CEFR {cefr} — clear grammar, appropriate sentence complexity, no advanced subjunctive."

    if cefr in ["A1", "A2"]:
        info_richness_block = """\
### INFORMATIONAL DENSITY
For A1/A2, prioritize a logical, cohesive, and simple narrative about daily life or basic facts over dense journalistic statistics. Keep it grounded in reality.
"""
    else:
        info_richness_block = """\
### INFORMATIONAL RICHNESS — MANDATORY
The article MUST contain at least THREE of the following:
  a) A real statistic or number  (e.g. "23 miljoen fietsen voor 18 miljoen Nederlanders")
  b) A named real-world location, organization, institution, or event
  c) A comparison tussen countries, cities, cultures, or time periods
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
"""

    prompt = f"""\
### GENERATION TASK
Write a Personalized Informative Exploration article in Dutch.
Target: National Geographic (simplified) × CEFR reading passage × educational travel magazine.
NOT a generic health-tip listicle. NOT a personal diary. NOT vague Wikipedia prose.

### LEARNER PROFILE SPOTLIGHT
To subtly inspire the angle of the article, focus on these specific traits of the learner:
{spotlight_str}

CRITICAL PERSONALISATION RULES:
1. Use the traits above to inspire the specific angle, examples, or comparisons in the text.
2. Do NOT write the article *about* the learner. The reader should think, "This topic fits my world," not "This text is a biography about me."
3. If a Location is provided, use it only as a brief comparison point (e.g., comparing a local trend to a global trend). The text must explore the wider world.

### TOPIC
{selected_topic}

### TOPIC DIVERSITY (avoid these recently covered topics and their close subtopics)
Recently used: {recent_str}

### MANDATORY VOCABULARY
1. BLUE WORDS (new): You MUST include EVERY single word from this list at least once. Wrap each in [[word]]. List: {blue_str}
2. YELLOW WORDS (reinforce): You MUST include EVERY single word from this list at least once. Wrap each in [[word]]. List: {yellow_str}

CRITICAL RULE: The text MUST flow logically. Do not just paste these words into random, disconnected sentences. You must build a single, cohesive narrative or explanation that naturally incorporates these words.
CRITICAL RULE FOR TARGET WORDS: If a target word is a basic everyday object (e.g., 'stoel', 'tafelwater', 'raam'), do NOT invent fake facts, fake countries, or bizarre logic to make it sound 'educational'. Just use the word naturally in a normal, logical sentence (e.g., 'Hij zit op een stoel.'). Never sacrifice logic just to force an educational tone.
{survey_section}
{info_richness_block}
### WRITING REQUIREMENTS
- Length: approximately {length_constraint} Dutch words.
- {difficulty_instruction}
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
            result = _clean_generated_text(json.loads(text))
            logger.info("[SessionGen] generated title=%r", result.get("title"))
            return result
        except Exception as e:
            last_error = e
            if _is_rate_limit_error(e):
                logger.warning("[SessionGen] Gemini rate-limited: %s", e)
                raise GenerationRateLimitError(
                    "The text generator is temporarily rate limited. Please wait a moment and try again."
                ) from e
            logger.warning("[SessionGen] Attempt %d failed: %s", attempt, e)
            if attempt < 3:
                time.sleep(2)

    logger.error("[SessionGen] All attempts failed: %s", last_error)
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
    blue_str = ", ".join(blue_words) if blue_words else "(none)"
    yellow_str = ", ".join(yellow_words) if yellow_words else "(none)"

    titles_section = ""
    if recent_titles:
        avoid_list = "\n".join(f"- {t}" for t in recent_titles)
        titles_section = f"\n### TITLES ALREADY USED (do NOT reuse)\n{avoid_list}\n"

    if cefr_level in ["A1", "A2"]:
        length_constraint = "100-150"
        difficulty_instruction = f"Difficulty: CEFR {cefr_level} — Use simple, short sentences (Subject-Verb-Object). Use basic vocabulary and primarily the present tense. Avoid nested clauses or complex conjunctions."
    else:
        length_constraint = word_count_range
        difficulty_instruction = f"Ensure difficulty does not exceed CEFR {cefr_level}."

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
Write a cohesive Dutch text of approximately {length_constraint} words.
- Ensure ALL Blue and Yellow words appear at least once, bracketed as [[word]].
- {difficulty_instruction}
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
            result = _clean_generated_text(json.loads(text))
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

    blue_entries = _fetch_blue_words(user_id, study_phase, db, condition=condition)
    yellow_entries = _fetch_yellow_words(user_id, study_phase, db) if condition == ConditionType.ADAPTIVE else []
    if yellow_entries:
        sample_size = random.randint(2, max(3, len(yellow_entries)))
        sample_size = min(sample_size, len(yellow_entries))
        yellow_entries = random.sample(yellow_entries, sample_size)

    blue_words = [_lex_to_dict(entry.lexicon_entry) for entry in blue_entries]
    yellow_words = [_lex_to_dict(e.lexicon_entry) for e in yellow_entries]

    word_translations: dict[str, str] = dict(previous_session.word_translations or {})
    for w in blue_words + yellow_words:
        word_translations[w["word"].lower()] = w["translation"]

    blue_str = ", ".join(w["word"] for w in blue_words) or "(none)"
    yellow_str = ", ".join(w["word"] for w in yellow_words) or "(none)"

    prev_topic = previous_session.topic_used or "Dutch everyday life"
    cefr_level = user.estimated_cefr or "B1"

    mem: dict = previous_session.narrative_memory or {}

    discourse_summary = mem.get("discourse_summary") or (previous_session.content or "")[-600:]
    last_ending_context = mem.get("last_ending_context") or (previous_session.content or "")[-300:]
    subtopics_used = mem.get("subtopics_used", [prev_topic])
    concepts_explained = mem.get("concepts_explained", [])
    vocab_already_used = mem.get("vocabulary_used", [])

    subtopics_str = ", ".join(subtopics_used) if subtopics_used else "(none yet)"
    concepts_str = ", ".join(concepts_explained) if concepts_explained else "(none recorded)"
    vocab_used_str = ", ".join(vocab_already_used) if vocab_already_used else "(none)"

    new_blue_str = ", ".join(
        w["word"] for w in blue_words if w["word"] not in vocab_already_used
    ) or blue_str
    new_yellow_str = ", ".join(
        w["word"] for w in yellow_words if w["word"] not in vocab_already_used
    ) or yellow_str

    if cefr_level in ["A1", "A2"]:
        length_constraint = "80-120"
        difficulty_block = (
            f"STRICT A1/A2 CONSTRAINT — YOU MUST FOLLOW THIS:\n"
            f"- Maximum {length_constraint} Dutch words total.\n"
            f"- Use ONLY simple, short sentences (Subject-Verb-Object).\n"
            f"- Use ONLY basic, everyday vocabulary appropriate for {cefr_level}.\n"
            f"- Use ONLY the present tense. Do NOT use past tense, future tense, or conditional.\n"
            f"- Do NOT use nested clauses, subordinate clauses, or complex conjunctions.\n"
            f"- Keep sentences under 10 words each."
        )
    else:
        length_constraint = "180-220"
        difficulty_block = (
            f"- Length: approximately {length_constraint} Dutch words across EXACTLY two (2) paragraphs.\n"
            f"- Difficulty: CEFR {cefr_level} — grammatically correct, appropriately complex Dutch."
        )

    if cefr_level in ["A1", "A2"]:
        info_richness_block = """\
### INFORMATIONAL DENSITY
For A1/A2, prioritize a logical, cohesive, and simple continuation about daily life or basic facts over dense journalistic statistics. Keep it grounded in reality.
"""
    else:
        info_richness_block = """\
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
"""

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

CRITICAL RULE FOR TARGET WORDS: If a target word is a basic everyday object (e.g., 'stoel', 'tafelwater', 'raam'), do NOT invent fake facts, fake countries, or bizarre logic to make it sound 'educational'. Just use the word naturally in a normal, logical sentence (e.g., 'Hij zit op een stoel.'). Never sacrifice logic just to force an educational tone.

{info_richness_block}

### STRICT CONTINUATION REQUIREMENTS
Style: Personalized Informative Exploration — factual, specific, magazine-like.
- DO NOT REPEAT previous sentences. Read the 'Last sentence / ending context' provided below, and generate completely new thoughts moving forward.
- Continue DIRECTLY from where the article ended — no recap, no re-introduction.
- Each paragraph must advance the topic with genuinely NEW information.
- Prioritise: new facts, events, named places, statistics, comparisons, implications.
- Avoid: repeating emotional states, motivational loops, re-explaining prior concepts.
- Vocabulary: integrate [[target_words]] into factual, informative sentences.
{difficulty_block}

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
                config={
                    "system_instruction": _SYSTEM_INSTRUCTION,
                    "temperature": 0.7,
                },
            )
            text = response.text.strip()
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)
            story_json = _clean_generated_text(json.loads(text))
            logger.info("[SessionGen] continuation title=%r", story_json.get("title"))

            new_content_chunk = story_json.get("content", "")
            previous_session.content += "\n\n" + new_content_chunk
            previous_session.continuation_count = (previous_session.continuation_count or 0) + 1
            previous_session.last_continued_at = datetime.datetime.utcnow()

            existing_translations = previous_session.word_translations or {}
            existing_translations.update(word_translations)
            previous_session.word_translations = existing_translations

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
                "session_id": previous_session.session_id,
                "title": previous_session.title,
                "content": previous_session.content,
                "topic_used": prev_topic,
                "blue_words": blue_words,
                "yellow_words": yellow_words,
                "word_translations": existing_translations,
                "metadata": story_json.get("metadata", {}),
                "reading_number": reading_number,
                "condition": condition.value,
            }
        except Exception as e:
            last_error = e
            if _is_rate_limit_error(e):
                raise GenerationRateLimitError(
                    "The text generator is temporarily rate limited. Please wait a moment."
                ) from e
            logger.warning("[SessionGen] Continuation attempt %d failed: %s", attempt, e)
            if attempt < 3:
                time.sleep(2)

    raise GenerationFailedError(
        "Could not generate a continuation. Please try again."
    ) from last_error
