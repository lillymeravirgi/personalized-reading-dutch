from __future__ import annotations

import json
import logging
import random as _random
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

RESERVOIR_TARGET = 50
GATEKEEPER_FLOOR = 25
LOW_WATERMARK = 25

def run_krs(user_id: str, db: Session, is_refill: bool = False) -> dict:
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found.")

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

    if usable_count >= GATEKEEPER_FLOOR:
        logger.info(
            f"[KRS] user={user_id} | reservoir={usable_count} >= {GATEKEEPER_FLOOR} "
            f"| skipping Gemini call"
        )
        return {"user_id": user_id, "words_recommended": 0, "new_entries_saved": 0, "skipped": True}

    interests      = _get_interests(user_id, db)
    excluded_words = _get_excluded_words(user_id, db)

    needed = max(1, RESERVOIR_TARGET - usable_count)
    raw_words = _call_gemini_krs(user, interests, excluded_words, needed, is_refill)
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


def _get_excluded_words(user_id: str, db: Session) -> list[str]:
    rows = (
        db.query(Lexicon.word)
        .join(UserVocabularyVector, UserVocabularyVector.word_id == Lexicon.word_id)
        .filter(
            UserVocabularyVector.user_id == user_id,
            UserVocabularyVector.status.in_([VocabStatus.MASTERED, VocabStatus.LEARNING])
        )
        .all()
    )
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
    interests_str = ", ".join(interests) if interests else "general life"
    excluded_str  = ", ".join(excluded_words) if excluded_words else "none"

    prompt = (
        f"You help choose Dutch vocabulary for language learners.\n\n"
        f"USER PROFILE:\n"
        f"- Age: {user.age}\n"
        f"- Location: {user.city}\n"
        f"- Job: {user.job}\n"
        f"- Academic Background: {user.academic_background}\n"
        f"- Purpose of learning Dutch: {user.purpose}\n"
        f"- Estimated CEFR Level: {user.estimated_cefr}\n"
        f"- Vocabulary Acquisition Score: {user.acquisition_score}%\n"
        f"- Interests: {interests_str}\n\n"
        f"EXCLUSION LIST - Do NOT recommend any of these words: {excluded_str}\n\n"
        f"TASK:\n"
        f"Recommend exactly {count} Dutch words that are highly relevant to this user's "
        f"job, age, and interests. "
        f"{'Focus on challenging boundary words' if user.acquisition_score > 70 else 'Focus on core foundational words'} "
        f"within the {user.estimated_cefr} CEFR level.\n"
    )

    if is_refill:
        prompt += (
            "\nThis is a refill request. The user has already seen and processed "
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


def run_baseline_krs(user_id: str, db: Session, target_count: int = 10) -> list[int]:
    from app.models import OnboardingWords

    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise ValueError(f"User '{user_id}' not found.")

    cefr = user.estimated_cefr or "B1"

    known_ids: set[int] = {
        v.word_id for v in
        db.query(UserVocabularyVector)
        .filter(UserVocabularyVector.user_id == user_id)
        .all()
    }

    used_ids: set[int] = {
        ow.word_id for ow in
        db.query(OnboardingWords)
        .filter(OnboardingWords.user_id == user_id)
        .all()
    }

    exclude_ids = known_ids | used_ids

    pool = (
        db.query(Lexicon)
        .filter(Lexicon.cefr_level == cefr)
        .all()
    )
    candidates = [lex for lex in pool if lex.word_id not in exclude_ids]

    if len(candidates) < target_count:
        cefr_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
        idx = cefr_order.index(cefr) if cefr in cefr_order else 2
        adjacent = []
        if idx > 0:
            adjacent.append(cefr_order[idx - 1])
        if idx < len(cefr_order) - 1:
            adjacent.append(cefr_order[idx + 1])
        for lvl in adjacent:
            extra = db.query(Lexicon).filter(Lexicon.cefr_level == lvl).all()
            candidates += [lex for lex in extra if lex.word_id not in exclude_ids]

    _random.shuffle(candidates)
    selected = candidates[:target_count]

    logger.info(
        "[Baseline KRS] user=%s cefr=%s pool=%d selected=%d",
        user_id, cefr, len(candidates), len(selected),
    )
    return [lex.word_id for lex in selected]
