import enum
import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger, Boolean, Column, DateTime, Enum as SAEnum,
    Float, ForeignKey, Integer, JSON, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ─────────────────────────────────────────────
#  Global Python Enums
# ─────────────────────────────────────────────

class ConditionType(str, enum.Enum):
    ADAPTIVE = "ADAPTIVE"
    BASELINE = "BASELINE"


class IntentTagType(str, enum.Enum):
    DEEP_PROCESSING   = "DEEP_PROCESSING"    # User clicked "See Examples"
    ACQUISITION_INTENT = "ACQUISITION_INTENT" # User clicked "Add to Learn List"
    WORD_AVOIDANCE    = "WORD_AVOIDANCE"     # User clicked "Ignore" / "Dismiss"


class VocabStatus(str, enum.Enum):
    LEARNING = "LEARNING"
    MASTERED = "MASTERED"


class TopicStatus(str, enum.Enum):
    INTERESTED = "INTERESTED"
    NEUTRAL    = "NEUTRAL"
    HATED      = "HATED"


# ─────────────────────────────────────────────
#  Models
# ─────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    education_level: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    learning_purpose: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    native_language: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    estimated_cefr: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=True)

    topics: Mapped[list["UserTopic"]] = relationship("UserTopic", back_populates="user", cascade="all, delete-orphan")
    vocab_vectors: Mapped[list["UserVocabularyVector"]] = relationship("UserVocabularyVector", back_populates="user", cascade="all, delete-orphan")
    recommendations: Mapped[list["RecommendedVocabulary"]] = relationship("RecommendedVocabulary", back_populates="user", cascade="all, delete-orphan")
    sessions: Mapped[list["ReadingSession"]] = relationship("ReadingSession", back_populates="user", cascade="all, delete-orphan")


class UserTopic(Base):
    __tablename__ = "user_topics"
    __table_args__ = (UniqueConstraint("user_id", "topic_name", name="uq_user_topic"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    topic_name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[TopicStatus] = mapped_column(SAEnum(TopicStatus), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="topics")


class Lexicon(Base):
    __tablename__ = "lexicon"

    word_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    word: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    translation: Mapped[str] = mapped_column(String(255), nullable=False)
    cefr_level: Mapped[str] = mapped_column(String(10), nullable=False)
    # JSON: list of {"nl": "...", "en": "..."}
    examples: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # JSON: list of {"nl": "...", "en": "..."}
    use_cases: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    vocab_vectors: Mapped[list["UserVocabularyVector"]] = relationship("UserVocabularyVector", back_populates="lexicon_entry")
    recommendations: Mapped[list["RecommendedVocabulary"]] = relationship("RecommendedVocabulary", back_populates="lexicon_entry")
    telemetry_logs: Mapped[list["InteractionTelemetry"]] = relationship("InteractionTelemetry", back_populates="lexicon_entry")


class UserVocabularyVector(Base):
    """Tracks LEARNING and MASTERED words only. Unknown words are NOT stored here."""
    __tablename__ = "user_vocabulary_vector"
    __table_args__ = (UniqueConstraint("user_id", "word_id", name="uq_user_word"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    word_id: Mapped[int] = mapped_column(Integer, ForeignKey("lexicon.word_id"), nullable=False)
    status: Mapped[VocabStatus] = mapped_column(SAEnum(VocabStatus), nullable=False, default=VocabStatus.LEARNING)
    mastery_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    exposure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    user: Mapped["User"] = relationship("User", back_populates="vocab_vectors")
    lexicon_entry: Mapped["Lexicon"] = relationship("Lexicon", back_populates="vocab_vectors")


class RecommendedVocabulary(Base):
    """Output table of the KRS — Blue Words."""
    __tablename__ = "recommended_vocabulary"
    __table_args__ = (UniqueConstraint("user_id", "word_id", name="uq_user_rec_word"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    word_id: Mapped[int] = mapped_column(Integer, ForeignKey("lexicon.word_id"), nullable=False)
    recommended_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, default=func.now()
    )
    is_used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    user: Mapped["User"] = relationship("User", back_populates="recommendations")
    lexicon_entry: Mapped["Lexicon"] = relationship("Lexicon", back_populates="recommendations")


class ReadingSession(Base):
    __tablename__ = "reading_sessions"

    session_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(50), ForeignKey("users.user_id"), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    topic_used: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    condition: Mapped[ConditionType] = mapped_column(SAEnum(ConditionType), nullable=False, default=ConditionType.ADAPTIVE)

    user: Mapped["User"] = relationship("User", back_populates="sessions")
    telemetry_logs: Mapped[list["InteractionTelemetry"]] = relationship("InteractionTelemetry", back_populates="session", cascade="all, delete-orphan")



class InteractionTelemetry(Base):
    __tablename__ = "interaction_telemetry"

    log_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey("reading_sessions.session_id"), nullable=False)
    word_id: Mapped[int] = mapped_column(Integer, ForeignKey("lexicon.word_id"), nullable=False)
    intent_tag: Mapped[IntentTagType] = mapped_column(SAEnum(IntentTagType), nullable=False)
    engagement_weight: Mapped[int] = mapped_column(Integer, nullable=False)

    session: Mapped["ReadingSession"] = relationship("ReadingSession", back_populates="telemetry_logs")
    lexicon_entry: Mapped["Lexicon"] = relationship("Lexicon", back_populates="telemetry_logs")
