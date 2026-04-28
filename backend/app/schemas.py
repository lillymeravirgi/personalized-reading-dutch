from __future__ import annotations
from typing import Any, Optional
from pydantic import BaseModel
from app.models import ConditionType, IntentTagType, VocabStatus

class SurveyResponse(BaseModel):
    sessionId: str

    # Reading Experience
    easyToUnderstand: int  # Likert 1–5
    followIdeas: int       # Likert 1–5
    appropriateChallenge: int  # Likert 1–5

    # UES-SF
    focusedAttention: int
    reward: int
    perceivedRelevance: int

    # Cognitive load (NASA-TLX)
    mentalEffort: int  # 1–7

    # Manipulation check
    perceivedPersonalization: int

# ── Session ──────────────────────────────────
class GenerateSessionRequest(BaseModel):
    user_id: str
    K: float = 0.7
    narrative_style: str = "Storytelling"
    word_count_range: str = "150-200"
    condition: ConditionType = ConditionType.ADAPTIVE


class WordInfo(BaseModel):
    word_id: int
    word: str
    translation: str
    cefr_level: str


class SessionSummary(BaseModel):
    """Lightweight model for the Library list view."""
    session_id: int
    user_id: str
    title: str
    topic_used: Optional[str] = None
    condition: str


class GenerateSessionResponse(BaseModel):
    session_id: int
    title: str
    content: str
    topic_used: Optional[str] = None
    blue_words: list[WordInfo]
    yellow_words: list[WordInfo]
    metadata: dict[str, Any]


class SessionDetailResponse(BaseModel):
    """Full session data for the Interactive Reader page."""
    session_id: int
    title: str
    content: str
    topic_used: Optional[str] = None
    condition: str
    blue_words: list[WordInfo]
    yellow_words: list[WordInfo]


# ── Telemetry ─────────────────────────────────
class LogTelemetryRequest(BaseModel):
    session_id: int
    word_id: int
    intent_tag: IntentTagType
    engagement_weight: int


class LogTelemetryResponse(BaseModel):
    log_id: int
    message: str


# ── Vocabulary ────────────────────────────────
class AddToLearnRequest(BaseModel):
    user_id: str
    word_id: int


class LexiconEntry(BaseModel):
    word_id: int
    word: str
    translation: str
    cefr_level: str
    examples: Optional[Any] = None
    use_cases: Optional[Any] = None

    model_config = {"from_attributes": True}


# ── KRS ───────────────────────────────────────
class KRSRunResponse(BaseModel):
    user_id: str
    words_recommended: int
    words_matched_in_lexicon: int
    new_entries_saved: int


# ── Auth ──────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    user_id: str
    username: str
    display_name: str
    estimated_cefr: Optional[str] = None
