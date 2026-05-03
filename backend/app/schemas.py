from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field
from app.models import ConditionType, IntentTagType, VocabStatus

LikertScale = Literal[1, 2, 3, 4, 5]
TLXScale    = Literal[1, 2, 3, 4, 5, 6, 7]

class SurveyResponse(BaseModel):
    session_id: int = Field(alias="sessionId")

    # Section 1 — Reading value (RQ1)
    worth_my_time: LikertScale = Field(alias="worthMyTime")
    """RQ1-W3: 'The reading felt worth my time and effort.'"""

    # Section 2 — Challenge & comprehension (Flow/ZPD + RQ3 context)
    appropriate_challenge: LikertScale = Field(alias="appropriateChallenge")
    """ZPD-1: 'The text was appropriately challenging for my level.'"""
    comprehension: LikertScale = Field(alias="comprehension")
    """COMP-1: 'I could follow the main ideas of the text without difficulty.'"""

    # Section 3 — Engagement / UES-SF (RQ2)
    focused_attention: LikertScale = Field(alias="focusedAttention")
    """UES-FA: 'I was so involved in this text that I lost track of time.'"""
    reward: LikertScale = Field(alias="reward")
    """UES-RW: 'I would want to read more texts similar to this one.'"""
    perceived_relevance: LikertScale = Field(alias="perceivedRelevance")
    """UES-PR: 'The content of this text felt personally meaningful to me.'"""

    # Section 4 — Cognitive load / NASA-TLX (RQ2 triangulation)
    mental_effort: TLXScale = Field(alias="mentalEffort")
    """TLX-MD: 'How much mental effort did it take to read this text?' (1–7)"""

    # Section 5 — Manipulation check
    perceived_personalization: LikertScale = Field(alias="perceivedPersonalization")
    """MC-1: 'This text felt specifically tailored to my interests and Dutch level.'"""

    model_config = {"populate_by_name": True}

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