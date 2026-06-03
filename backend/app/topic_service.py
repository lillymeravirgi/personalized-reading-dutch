from __future__ import annotations

import random
from sqlalchemy.orm import Session


NEUTRAL_TOPIC_POOL: list[str] = [
    "winkelen", "reizen", "technologie", "muziek",
    "film", "natuur", "gezondheid", "wetenschap",
]


def recommend_topic_content_based(
    user_id: str,
    K: float = 0.7,
    db: Session | None = None,
) -> str:
    raise NotImplementedError("Adaptive topic selection is handled in session_generator.")


def recommend_topic_baseline() -> str:
    return random.choice(NEUTRAL_TOPIC_POOL)
