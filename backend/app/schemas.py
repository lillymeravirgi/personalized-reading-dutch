from __future__ import annotations
from typing import Any, Literal, Optional, List
from pydantic import BaseModel, Field
from app.models import IntentTagType

LikertScale = Literal[1, 2, 3, 4, 5]
TLXScale    = Literal[1, 2, 3, 4, 5, 6, 7]

class RegisterRequest(BaseModel):
    email: str
    password: str
    display_name: Optional[str] = None
    study_code: Optional[str] = None
    start_condition: Optional[str] = None

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    user_id: str
    email: str
    display_name: Optional[str] = None
    estimated_cefr: Optional[str] = None
    onboarding_completed: bool = False
    has_switched_conditions: bool = False

class SurveyResponse(BaseModel):
    session_id: int = Field(alias="sessionId")

    worth_my_time: LikertScale = Field(alias="worthMyTime")
    appropriate_challenge: LikertScale = Field(alias="appropriateChallenge", default=3)
    comprehension:         LikertScale = Field(alias="comprehension",         default=3)
    focused_attention:   LikertScale = Field(alias="focusedAttention")
    reward:              LikertScale = Field(alias="reward")
    perceived_relevance: LikertScale = Field(alias="perceivedRelevance")
    mental_effort: TLXScale = Field(alias="mentalEffort")
    perceived_personalization: LikertScale = Field(alias="perceivedPersonalization")
    duration_seconds: Optional[int] = None

    model_config = {"populate_by_name": True}

class GenerateSessionRequest(BaseModel):
    user_id: str
    K: float = 0.7
    narrative_style: str = "Informative Educational Semi-Narrative Article"
    word_count_range: str = "150-200"

class WordInfo(BaseModel):
    word_id: int
    word: str
    translation: str
    cefr_level: str

class SessionSummary(BaseModel):
    session_id: int
    user_id: str
    title: str
    topic_used: Optional[str] = None
    reading_number: int
    survey_completed: bool

class TextToken(BaseModel):
    text: str
    type: Literal["word", "punctuation", "space"]
    status: Optional[Literal["new", "learning", "known"]] = None
    word_id: Optional[int] = None

class GenerateSessionResponse(BaseModel):
    session_id: int
    title: str
    content: str
    tokens: list[TextToken] = []
    topic_used: Optional[str] = None
    blue_words: list[WordInfo]
    yellow_words: list[WordInfo]
    word_translations: dict[str, str]
    metadata: dict[str, Any]
    reading_number: int
    cefr_level: Optional[str] = None

class SessionDetailResponse(BaseModel):
    session_id: int
    title: str
    content: str
    tokens: list[TextToken] = []
    topic_used: Optional[str] = None
    reading_number: int
    survey_completed: bool
    blue_words: list[WordInfo]
    yellow_words: list[WordInfo]
    word_translations: dict[str, str]

class LogTelemetryRequest(BaseModel):
    session_id: int
    word_id: int
    intent_tag: IntentTagType
    engagement_weight: int

class LogTelemetryResponse(BaseModel):
    log_id: int
    message: str

class AddToLearnRequest(BaseModel):
    user_id: str
    word_id: int
    review_interval_days: Optional[int] = None
    force: bool = False

class LexiconEntry(BaseModel):
    word_id: int
    word: str
    translation: str
    cefr_level: str
    examples: Optional[Any] = None
    use_cases: Optional[Any] = None

    model_config = {"from_attributes": True}

class KRSRunResponse(BaseModel):
    user_id: str
    words_recommended: int
    words_matched_in_lexicon: int
    new_entries_saved: int

class AssessmentBatchResponse(BaseModel):
    batch_number: int
    total_batches: int
    words: list[dict]

class AssessmentSubmitRequest(BaseModel):
    user_id: str
    batch_number: int
    known_word_ids: list[str]
    all_word_ids: list[str]
    estimated_level: str
    confidence_score: float
    is_final: bool = False

class OnboardingPersonalInfoRequest(BaseModel):
    user_id: str
    display_name: Optional[str] = None
    age: Optional[int] = None
    city: Optional[str] = None
    gender: Optional[str] = None
    job: Optional[str] = None
    academic_background: Optional[str] = None
    mother_language: Optional[str] = None
    other_languages: Optional[str] = None
    purpose: Optional[str] = None
    self_reported_cefr: Optional[str] = None

class OnboardingWordsResponse(BaseModel):
    words: list[LexiconEntry]

class ProfileUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    age: Optional[int] = None
    city: Optional[str] = None
    gender: Optional[str] = None
    job: Optional[str] = None
    academic_background: Optional[str] = None
    mother_language: Optional[str] = None
    other_languages: Optional[str] = None
    purpose: Optional[str] = None
    interests: Optional[list[str]] = None
    estimated_cefr: Optional[str] = None
    assessed_at: Optional[str] = None

class VocabTestSubmitRequest(BaseModel):
    user_id: str
    session_group_id: int
    answers: list[dict]
    score: int
    submitted_at: str
    study_phase: int = 1
    test_type: str = "immediate"
    is_final: bool = False
