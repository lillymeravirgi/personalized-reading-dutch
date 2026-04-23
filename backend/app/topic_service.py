# Topic helper functions for reading sessions.
# Adaptive topic selection still lives in session_generator for now.
from __future__ import annotations

import random
from sqlalchemy.orm import Session


# Generic topics we fall back to for the baseline condition (no personalization).
NEUTRAL_TOPIC_POOL: list[str] = [
    "winkelen", "reizen", "technologie", "muziek",
    "film", "natuur", "gezondheid", "wetenschap",
]


def recommend_topic_content_based(
    user_id: str,
    K: float = 0.7,
    db: Session | None = None,
) -> str:
    # Adaptive: 70% pick from the user's interests, 30% explore something new
    # (keeps us out of a filter bubble).
    raise NotImplementedError("Adaptive topic selection is handled in session_generator for now.")


def recommend_topic_baseline() -> str:
    # Baseline: just grab one at random, ignore the user.
    return random.choice(NEUTRAL_TOPIC_POOL)
