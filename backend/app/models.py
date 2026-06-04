import enum
import datetime
from typing import Any, Optional

from sqlalchemy import (
    BigInteger, Boolean, DateTime, Enum as SAEnum,
    Float, ForeignKey, Integer, JSON, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ConditionType(str, enum.Enum):
    ADAPTIVE = "ADAPTIVE"
    BASELINE = "BASELINE"


StudyCondition = ConditionType


class IntentTagType(str, enum.Enum):
    DEEP_PROCESSING    = "DEEP_PROCESSING"
    ACQUISITION_INTENT = "ACQUISITION_INTENT"
    WORD_AVOIDANCE     = "WORD_AVOIDANCE"


class VocabStatus(str, enum.Enum):
    LEARNING = "LEARNING"
    MASTERED = "MASTERED"


class TopicStatus(str, enum.Enum):
    INTERESTED = "INTERESTED"
    NEUTRAL    = "NEUTRAL"
    HATED      = "HATED"


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(50), primary_key=True)

    email:         Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    username:      Mapped[Optional[str]] = mapped_column(String(100), unique=True, index=True, nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    display_name:  Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    study_code:    Mapped[Optional[str]] = mapped_column(String(50), unique=True, index=True, nullable=True)
    created_at:    Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=func.now())

    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    age:               Mapped[Optional[int]]  = mapped_column(Integer, nullable=True)
    city:              Mapped[Optional[str]]  = mapped_column(String(255), nullable=True)
    gender:            Mapped[Optional[str]]  = mapped_column(String(50),  nullable=True)
    job:               Mapped[Optional[str]]  = mapped_column(String(255), nullable=True)
    academic_background: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mother_language:   Mapped[Optional[str]]  = mapped_column(String(100), nullable=True)
    other_languages:   Mapped[Optional[str]]  = mapped_column(String(255), nullable=True)
    purpose:           Mapped[Optional[str]]  = mapped_column(String(100), nullable=True)
    current_condition:       Mapped[ConditionType] = mapped_column(
        SAEnum(ConditionType), nullable=False, default=ConditionType.ADAPTIVE
    )
    has_switched_conditions: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    estimated_cefr:    Mapped[Optional[str]]  = mapped_column(String(10),  nullable=True)

    topics:          Mapped[list["UserTopic"]]            = relationship("UserTopic",            back_populates="user", cascade="all, delete-orphan")
    vocab_vectors:   Mapped[list["UserVocabularyVector"]] = relationship("UserVocabularyVector", back_populates="user", cascade="all, delete-orphan")
    recommendations: Mapped[list["RecommendedVocabulary"]]= relationship("RecommendedVocabulary",back_populates="user", cascade="all, delete-orphan")
    sessions:        Mapped[list["ReadingSession"]]        = relationship("ReadingSession",       back_populates="user", cascade="all, delete-orphan")
    assessment_batches: Mapped[list["AssessmentBatch"]]   = relationship("AssessmentBatch",      back_populates="user", cascade="all, delete-orphan")
    onboarding_words:   Mapped[list["OnboardingWords"]]   = relationship("OnboardingWords",      back_populates="user", cascade="all, delete-orphan")
    vocab_test_results: Mapped[list["VocabularyTestResult"]] = relationship("VocabularyTestResult", back_populates="user", cascade="all, delete-orphan")

    @property
    def acquisition_score(self) -> int:
        if not self.vocab_vectors:
            return 0
        mastered = sum(1 for v in self.vocab_vectors if v.status == VocabStatus.MASTERED)
        total = len(self.vocab_vectors)
        if total == 0:
            return 0
        return int((mastered / total) * 100)


class UserTopic(Base):
    __tablename__ = "user_topics"
    __table_args__ = (UniqueConstraint("user_id", "topic_name", name="uq_user_topic"),)

    id:         Mapped[int]        = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:    Mapped[str]        = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    topic_name: Mapped[str]        = mapped_column(String(255), nullable=False)
    status:     Mapped[TopicStatus]= mapped_column(SAEnum(TopicStatus), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="topics")


class Lexicon(Base):
    __tablename__ = "lexicon"

    word_id:     Mapped[int]          = mapped_column(Integer, primary_key=True, autoincrement=True)
    word:        Mapped[str]          = mapped_column(String(255), nullable=False, unique=True)
    translation: Mapped[str]          = mapped_column(String(255), nullable=False)
    cefr_level:  Mapped[str]          = mapped_column(String(10),  nullable=False)
    examples:    Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    use_cases:   Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    vocab_vectors:   Mapped[list["UserVocabularyVector"]] = relationship("UserVocabularyVector", back_populates="lexicon_entry")
    recommendations: Mapped[list["RecommendedVocabulary"]]= relationship("RecommendedVocabulary",back_populates="lexicon_entry")
    telemetry_logs:  Mapped[list["InteractionTelemetry"]] = relationship("InteractionTelemetry", back_populates="lexicon_entry")
    onboarding_words: Mapped[list["OnboardingWords"]]     = relationship("OnboardingWords",      back_populates="lexicon_entry")
    vocab_test_results: Mapped[list["VocabularyTestResult"]] = relationship("VocabularyTestResult", back_populates="lexicon_entry")


class UserVocabularyVector(Base):
    __tablename__ = "user_vocabulary_vector"
    __table_args__ = (UniqueConstraint("user_id", "word_id", name="uq_user_word"),)

    id:              Mapped[int]        = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:         Mapped[str]        = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    word_id:         Mapped[int]        = mapped_column(Integer, ForeignKey("lexicon.word_id"), nullable=False)
    status:          Mapped[VocabStatus]= mapped_column(SAEnum(VocabStatus), nullable=False, default=VocabStatus.LEARNING)
    mastery_score:   Mapped[float]      = mapped_column(Float,   nullable=False, default=0.0)
    exposure_count:  Mapped[int]        = mapped_column(Integer, nullable=False, default=1)
    review_priority: Mapped[int]        = mapped_column(Integer, nullable=False, default=0)
    next_review_at:       Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    last_reviewed_at:     Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)
    review_interval_days: Mapped[Optional[int]]               = mapped_column(Integer, nullable=True)

    user:          Mapped["User"]   = relationship("User",   back_populates="vocab_vectors")
    lexicon_entry: Mapped["Lexicon"]= relationship("Lexicon",back_populates="vocab_vectors")


class RecommendedVocabulary(Base):
    __tablename__ = "recommended_vocabulary"
    __table_args__ = (UniqueConstraint("user_id", "word_id", name="uq_user_rec_word"),)

    id:             Mapped[int]             = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:        Mapped[str]             = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    word_id:        Mapped[int]             = mapped_column(Integer,    ForeignKey("lexicon.word_id"), nullable=False)
    recommended_at: Mapped[datetime.datetime]= mapped_column(DateTime,  nullable=False, default=func.now())
    is_used:        Mapped[bool]            = mapped_column(Boolean,    nullable=False, default=False)

    user:          Mapped["User"]   = relationship("User",   back_populates="recommendations")
    lexicon_entry: Mapped["Lexicon"]= relationship("Lexicon",back_populates="recommendations")


class ReadingSession(Base):
    __tablename__ = "reading_sessions"

    session_id:    Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:       Mapped[str]           = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    title:         Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    content:       Mapped[str]           = mapped_column(Text, nullable=False)
    topic_used:    Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    condition:     Mapped[ConditionType] = mapped_column(SAEnum(ConditionType), nullable=False, default=ConditionType.ADAPTIVE)
    reading_number: Mapped[int]          = mapped_column(Integer, nullable=False, default=1)
    study_phase:    Mapped[int]          = mapped_column(Integer, nullable=False, default=1)
    survey_completed: Mapped[bool]       = mapped_column(Boolean, nullable=False, default=False)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at:       Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    word_translations: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    survey_signal: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    narrative_memory: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    continuation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_continued_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True)

    user:          Mapped["User"]                     = relationship("User", back_populates="sessions")
    telemetry_logs: Mapped[list["InteractionTelemetry"]] = relationship("InteractionTelemetry", back_populates="session", cascade="all, delete-orphan")
    survey_result: Mapped[Optional["SurveyResult"]]   = relationship("SurveyResult", back_populates="session", uselist=False)


class InteractionTelemetry(Base):
    __tablename__ = "interaction_telemetry"

    log_id:           Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id:       Mapped[int]           = mapped_column(Integer, ForeignKey("reading_sessions.session_id"), nullable=False)
    word_id:          Mapped[int]           = mapped_column(Integer, ForeignKey("lexicon.word_id"), nullable=False)
    intent_tag:       Mapped[IntentTagType] = mapped_column(SAEnum(IntentTagType), nullable=False)
    engagement_weight:Mapped[int]           = mapped_column(Integer, nullable=False)
    telemetry_at:     Mapped[Optional[datetime.datetime]] = mapped_column(DateTime, nullable=True, default=func.now())

    session:       Mapped["ReadingSession"] = relationship("ReadingSession", back_populates="telemetry_logs")
    lexicon_entry: Mapped["Lexicon"]        = relationship("Lexicon",        back_populates="telemetry_logs")


class SurveyResult(Base):
    __tablename__ = "survey_results"

    survey_id:  Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("reading_sessions.session_id"), unique=True, nullable=False)

    worth_my_time: Mapped[int] = mapped_column(Integer, nullable=False)

    appropriate_challenge: Mapped[int] = mapped_column(Integer, nullable=False)
    comprehension:         Mapped[int] = mapped_column(Integer, nullable=False)

    focused_attention:    Mapped[int] = mapped_column(Integer, nullable=False)
    reward:               Mapped[int] = mapped_column(Integer, nullable=False)
    perceived_relevance:  Mapped[int] = mapped_column(Integer, nullable=False)

    mental_effort: Mapped[int] = mapped_column(Integer, nullable=False)

    perceived_personalization: Mapped[int] = mapped_column(Integer, nullable=False)

    session: Mapped["ReadingSession"] = relationship("ReadingSession", back_populates="survey_result")


class AssessmentBatch(Base):
    __tablename__ = "assessment_batches"

    id:            Mapped[int]        = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:       Mapped[str]        = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    batch_number:  Mapped[int]        = mapped_column(Integer, nullable=False)
    word_ids:      Mapped[Any]        = mapped_column(JSON, nullable=False, default=list)
    known_word_ids:Mapped[Any]        = mapped_column(JSON, nullable=False, default=list)
    timestamp:     Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="assessment_batches")


class OnboardingWords(Base):
    __tablename__ = "onboarding_words"
    __table_args__ = (UniqueConstraint("user_id", "word_id", name="uq_onboarding_word"),)

    id:          Mapped[int]              = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:     Mapped[str]              = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    word_id:     Mapped[int]              = mapped_column(Integer,    ForeignKey("lexicon.word_id"), nullable=False)
    added_at:    Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=func.now())
    study_phase: Mapped[int]              = mapped_column(Integer, nullable=False, default=1)

    user:          Mapped["User"]   = relationship("User",   back_populates="onboarding_words")
    lexicon_entry: Mapped["Lexicon"]= relationship("Lexicon",back_populates="onboarding_words")


class VocabularyTestResult(Base):
    __tablename__ = "vocabulary_test_results"

    id:               Mapped[int]  = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id:          Mapped[str]  = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    session_group_id: Mapped[int]  = mapped_column(Integer, nullable=False)
    study_phase:      Mapped[int]  = mapped_column(Integer, nullable=False, default=1)
    test_type:        Mapped[str]  = mapped_column(String(20), nullable=False, default="immediate")
    word_id:          Mapped[int]  = mapped_column(Integer, ForeignKey("lexicon.word_id"), nullable=False)
    chosen_answer:    Mapped[str]  = mapped_column(String(255), nullable=False)
    is_correct:       Mapped[bool] = mapped_column(Boolean, nullable=False)
    score:            Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    timestamp:        Mapped[datetime.datetime] = mapped_column(DateTime, nullable=False, default=func.now())

    user:          Mapped["User"]   = relationship("User",   back_populates="vocab_test_results")
    lexicon_entry: Mapped["Lexicon"]= relationship("Lexicon",back_populates="vocab_test_results")
