from __future__ import annotations

import re
from sqlalchemy.orm import Session

from app.models import Lexicon


class HallucinationError(Exception):
    pass


_MARKER_RE = re.compile(r"\[\[([^\[\]]+)\]\]")


def extract_marked_words(content: str) -> list[str]:
    return [m.group(1).strip().lower() for m in _MARKER_RE.finditer(content)]


def validate_against_lexicon(words: list[str], db: Session) -> list[str]:
    if not words:
        return []
    rows = db.query(Lexicon.word).filter(Lexicon.word.in_(set(words))).all()
    known = {r[0] for r in rows}
    return [w for w in words if w not in known]
