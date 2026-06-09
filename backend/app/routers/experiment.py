import csv
import datetime
import enum
import io
import json
import zipfile
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AssessmentBatch,
    ConditionType,
    IntentTagType,
    InteractionTelemetry,
    Lexicon,
    OnboardingWords,
    ReadingSession,
    RecommendedVocabulary,
    SurveyResult,
    User,
    UserTopic,
    UserVocabularyVector,
    VocabularyTestResult,
)

router = APIRouter(prefix="/experiment", tags=["Experiment"])

TEAM_ACCOUNTS = (
    ("KIM", "Kim", ConditionType.ADAPTIVE),
    ("KIKI", "Kiki", ConditionType.BASELINE),
    ("JULIAN", "Julian", ConditionType.ADAPTIVE),
    ("TJ", "TJ", ConditionType.BASELINE),
    ("EVIE", "Evie", ConditionType.ADAPTIVE),
    ("JY", "Jy", ConditionType.BASELINE),
)


EXPORT_TABLES = (
    ("users", User, {"password_hash", "email", "gender"}),
    ("user_topics", UserTopic, set()),
    ("assessment_batches", AssessmentBatch, set()),
    ("onboarding_words", OnboardingWords, set()),
    ("recommended_vocabulary", RecommendedVocabulary, set()),
    ("user_vocabulary_vector", UserVocabularyVector, set()),
    ("reading_sessions", ReadingSession, set()),
    ("interaction_telemetry", InteractionTelemetry, set()),
    ("survey_results", SurveyResult, set()),
    ("vocabulary_test_results", VocabularyTestResult, set()),
    ("lexicon", Lexicon, set()),
)


def _csv_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, enum.Enum):
        return value.value.lower()
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def _table_to_csv(db: Session, table_model: type[Any], excluded_fields: set[str]) -> str:
    columns = [
        column.name
        for column in table_model.__table__.columns
        if column.name not in excluded_fields
    ]
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()

    query = db.query(table_model)
    primary_key_columns = list(table_model.__mapper__.primary_key)
    if primary_key_columns:
        query = query.order_by(*primary_key_columns)

    for row in query.all():
        writer.writerow({
            column: _csv_value(getattr(row, column))
            for column in columns
        })

    return output.getvalue()


def _mean(values: list[int | float]) -> float | str:
    if not values:
        return ""
    return round(sum(values) / len(values), 2)


def _ids_json(values: list[int]) -> str:
    return json.dumps(sorted(set(values)))


def _latest_test_time(rows: list[VocabularyTestResult]) -> datetime.datetime | None:
    return max((row.timestamp for row in rows if row.timestamp), default=None)


def _first_time(values: list[datetime.datetime]) -> str:
    value = min(values) if values else None
    return _csv_value(value)


def _last_time(values: list[datetime.datetime]) -> str:
    value = max(values) if values else None
    return _csv_value(value)


def _test_summary(rows: list[VocabularyTestResult]) -> dict[str, Any]:
    if not rows:
        return {
            "correct": "",
            "total": "",
            "percent": "",
            "completed_at": "",
        }

    latest_by_word: dict[int, VocabularyTestResult] = {}
    for row in rows:
        current = latest_by_word.get(row.word_id)
        if current is None:
            latest_by_word[row.word_id] = row
        elif row.timestamp > current.timestamp:
            latest_by_word[row.word_id] = row
        elif row.timestamp == current.timestamp and row.id > current.id:
            latest_by_word[row.word_id] = row
    rows = list(latest_by_word.values())

    total = len(rows)
    correct = sum(1 for row in rows if row.is_correct)
    completed_at = max((row.timestamp for row in rows if row.timestamp), default=None)
    return {
        "correct": correct,
        "total": total,
        "percent": round((correct / total) * 100, 2) if total else "",
        "completed_at": completed_at.isoformat() if completed_at else "",
    }


def _study_phase_summary_csv(db: Session) -> str:
    fieldnames = [
        "user_id",
        "study_code",
        "study_phase",
        "condition",
        "condition_source",
        "condition_order",
        "has_switched_conditions",
        "estimated_cefr",
        "interested_topics",
        "neutral_topics",
        "onboarding_word_count",
        "phase_learning_word_count",
        "word_set_first_added_at",
        "word_set_last_added_at",
        "readings_started",
        "readings_completed",
        "expected_readings",
        "completion_ratio",
        "reading_session_ids",
        "reading_numbers",
        "reading_titles",
        "topics_used",
        "first_reading_started_at",
        "last_reading_started_at",
        "total_reading_seconds",
        "avg_reading_seconds",
        "survey_count",
        "avg_mental_effort",
        "avg_appropriate_challenge",
        "avg_comprehension",
        "avg_worth_my_time",
        "avg_focused_attention",
        "avg_reward",
        "avg_perceived_relevance",
        "avg_perceived_personalization",
        "avg_engagement_composite",
        "telemetry_events",
        "telemetry_weight_total",
        "telemetry_words_touched",
        "telemetry_events_per_minute",
        "telemetry_weight_per_minute",
        "telemetry_deep_processing",
        "telemetry_acquisition_intent",
        "telemetry_word_avoidance",
        "reading_more_count",
        "session_group_ids",
        "tested_word_count",
        "tested_word_ids",
        "immediate_session_group_ids",
        "immediate_correct",
        "immediate_total",
        "immediate_percent",
        "immediate_completed_at",
        "delayed_session_group_ids",
        "delayed_correct",
        "delayed_total",
        "delayed_percent",
        "delayed_completed_at",
        "actual_delay_hours",
        "retention_delta_percent",
    ]

    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    users = db.query(User).order_by(User.user_id).all()
    for user in users:
        sessions = (
            db.query(ReadingSession)
            .filter(ReadingSession.user_id == user.user_id)
            .order_by(ReadingSession.study_phase, ReadingSession.reading_number, ReadingSession.session_id)
            .all()
        )
        onboarding_rows = (
            db.query(OnboardingWords)
            .filter(OnboardingWords.user_id == user.user_id)
            .order_by(OnboardingWords.study_phase, OnboardingWords.id)
            .all()
        )
        test_rows = (
            db.query(VocabularyTestResult)
            .filter(VocabularyTestResult.user_id == user.user_id)
            .order_by(VocabularyTestResult.study_phase, VocabularyTestResult.test_type, VocabularyTestResult.id)
            .all()
        )
        topics = (
            db.query(UserTopic)
            .filter(UserTopic.user_id == user.user_id)
            .order_by(UserTopic.status, UserTopic.topic_name)
            .all()
        )

        phase_conditions = []
        for session_phase in sorted({session.study_phase for session in sessions}):
            phase_session = next((session for session in sessions if session.study_phase == session_phase), None)
            if phase_session:
                phase_conditions.append(_csv_value(phase_session.condition))
        condition_order = " -> ".join(phase_conditions)

        phases = sorted(
            {
                *(session.study_phase for session in sessions),
                *(row.study_phase for row in onboarding_rows),
                *(row.study_phase for row in test_rows),
            }
        )

        for phase in phases:
            phase_sessions = [session for session in sessions if session.study_phase == phase]
            phase_session_ids = [session.session_id for session in phase_sessions]
            phase_onboarding = [row for row in onboarding_rows if row.study_phase == phase]
            phase_word_ids = {row.word_id for row in phase_onboarding}
            phase_tests = [row for row in test_rows if row.study_phase == phase]
            immediate_rows = [row for row in phase_tests if row.test_type == "immediate"]
            delayed_rows = [row for row in phase_tests if row.test_type == "delayed"]

            phase_vectors = []
            if phase_word_ids:
                phase_vectors = (
                    db.query(UserVocabularyVector)
                    .filter(
                        UserVocabularyVector.user_id == user.user_id,
                        UserVocabularyVector.word_id.in_(phase_word_ids),
                    )
                    .all()
                )

            surveys = []
            telemetry_rows = []
            if phase_session_ids:
                surveys = (
                    db.query(SurveyResult)
                    .join(ReadingSession, SurveyResult.session_id == ReadingSession.session_id)
                    .filter(ReadingSession.session_id.in_(phase_session_ids))
                    .all()
                )
                telemetry_rows = (
                    db.query(InteractionTelemetry)
                    .join(ReadingSession, InteractionTelemetry.session_id == ReadingSession.session_id)
                    .filter(ReadingSession.session_id.in_(phase_session_ids))
                    .all()
                )

            immediate = _test_summary(immediate_rows)
            delayed = _test_summary(delayed_rows)

            retention_delta = ""
            if immediate["percent"] != "" and delayed["percent"] != "":
                retention_delta = round(float(delayed["percent"]) - float(immediate["percent"]), 2)

            immediate_time = _latest_test_time(immediate_rows)
            delayed_time = _latest_test_time(delayed_rows)
            actual_delay_hours = ""
            if immediate_time and delayed_time:
                actual_delay_hours = round((delayed_time - immediate_time).total_seconds() / 3600, 2)

            engagement_scores = [
                (row.focused_attention + row.reward + row.perceived_relevance) / 3
                for row in surveys
            ]
            reading_seconds = [
                session.duration_seconds
                for session in phase_sessions
                if session.duration_seconds is not None
            ]
            total_reading_seconds = sum(reading_seconds) if reading_seconds else 0
            telemetry_weight_total = sum(row.engagement_weight for row in telemetry_rows)
            condition = ""
            if phase_sessions:
                condition = _csv_value(phase_sessions[0].condition)
            completed_count = sum(1 for session in phase_sessions if session.survey_completed)
            telemetry_by_intent = {
                IntentTagType.DEEP_PROCESSING: 0,
                IntentTagType.ACQUISITION_INTENT: 0,
                IntentTagType.WORD_AVOIDANCE: 0,
            }
            for row in telemetry_rows:
                telemetry_by_intent[row.intent_tag] = telemetry_by_intent.get(row.intent_tag, 0) + 1

            writer.writerow({
                "user_id": user.user_id,
                "study_code": user.study_code or "",
                "study_phase": phase,
                "condition": condition,
                "condition_source": "first_reading_session" if condition else "",
                "condition_order": condition_order,
                "has_switched_conditions": user.has_switched_conditions,
                "estimated_cefr": user.estimated_cefr or "",
                "interested_topics": json.dumps([topic.topic_name for topic in topics if topic.status.value == "INTERESTED"]),
                "neutral_topics": json.dumps([topic.topic_name for topic in topics if topic.status.value == "NEUTRAL"]),
                "onboarding_word_count": len(phase_onboarding),
                "phase_learning_word_count": len(phase_vectors),
                "word_set_first_added_at": _first_time([row.added_at for row in phase_onboarding]),
                "word_set_last_added_at": _last_time([row.added_at for row in phase_onboarding]),
                "readings_started": len(phase_sessions),
                "readings_completed": completed_count,
                "expected_readings": 3,
                "completion_ratio": round(completed_count / 3, 2),
                "reading_session_ids": json.dumps(phase_session_ids),
                "reading_numbers": json.dumps([session.reading_number for session in phase_sessions]),
                "reading_titles": json.dumps([session.title or "" for session in phase_sessions], ensure_ascii=False),
                "topics_used": json.dumps([session.topic_used or "" for session in phase_sessions], ensure_ascii=False),
                "first_reading_started_at": _first_time([session.created_at for session in phase_sessions]),
                "last_reading_started_at": _last_time([session.created_at for session in phase_sessions]),
                "total_reading_seconds": total_reading_seconds or "",
                "avg_reading_seconds": _mean(reading_seconds),
                "survey_count": len(surveys),
                "avg_mental_effort": _mean([row.mental_effort for row in surveys]),
                "avg_appropriate_challenge": _mean([row.appropriate_challenge for row in surveys]),
                "avg_comprehension": _mean([row.comprehension for row in surveys]),
                "avg_worth_my_time": _mean([row.worth_my_time for row in surveys]),
                "avg_focused_attention": _mean([row.focused_attention for row in surveys]),
                "avg_reward": _mean([row.reward for row in surveys]),
                "avg_perceived_relevance": _mean([row.perceived_relevance for row in surveys]),
                "avg_perceived_personalization": _mean([row.perceived_personalization for row in surveys]),
                "avg_engagement_composite": _mean(engagement_scores),
                "telemetry_events": len(telemetry_rows),
                "telemetry_weight_total": telemetry_weight_total,
                "telemetry_words_touched": len({row.word_id for row in telemetry_rows}),
                "telemetry_events_per_minute": round((len(telemetry_rows) / total_reading_seconds) * 60, 2) if total_reading_seconds else "",
                "telemetry_weight_per_minute": round((telemetry_weight_total / total_reading_seconds) * 60, 2) if total_reading_seconds else "",
                "telemetry_deep_processing": telemetry_by_intent[IntentTagType.DEEP_PROCESSING],
                "telemetry_acquisition_intent": telemetry_by_intent[IntentTagType.ACQUISITION_INTENT],
                "telemetry_word_avoidance": telemetry_by_intent[IntentTagType.WORD_AVOIDANCE],
                "reading_more_count": sum(session.continuation_count or 0 for session in phase_sessions),
                "session_group_ids": _ids_json([row.session_group_id for row in phase_tests]),
                "tested_word_count": len({row.word_id for row in phase_tests}),
                "tested_word_ids": _ids_json([row.word_id for row in phase_tests]),
                "immediate_session_group_ids": _ids_json([row.session_group_id for row in immediate_rows]),
                "immediate_correct": immediate["correct"],
                "immediate_total": immediate["total"],
                "immediate_percent": immediate["percent"],
                "immediate_completed_at": immediate["completed_at"],
                "delayed_session_group_ids": _ids_json([row.session_group_id for row in delayed_rows]),
                "delayed_correct": delayed["correct"],
                "delayed_total": delayed["total"],
                "delayed_percent": delayed["percent"],
                "delayed_completed_at": delayed["completed_at"],
                "actual_delay_hours": actual_delay_hours,
                "retention_delta_percent": retention_delta,
            })

    return output.getvalue()


def build_export_archive(db: Session) -> bytes:
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("study_phase_summary.csv", _study_phase_summary_csv(db))
        for table_name, model, excluded_fields in EXPORT_TABLES:
            zf.writestr(
                f"{table_name}.csv",
                _table_to_csv(db, model, excluded_fields),
            )
    return archive.getvalue()


def _reset_team_user(db: Session, user: User, condition: ConditionType, display_name: str) -> None:
    session_ids = [
        row.session_id
        for row in db.query(ReadingSession.session_id)
        .filter(ReadingSession.user_id == user.user_id)
        .all()
    ]

    if session_ids:
        db.query(SurveyResult).filter(SurveyResult.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(InteractionTelemetry).filter(InteractionTelemetry.session_id.in_(session_ids)).delete(synchronize_session=False)
        db.query(ReadingSession).filter(ReadingSession.user_id == user.user_id).delete(synchronize_session=False)

    db.query(VocabularyTestResult).filter(VocabularyTestResult.user_id == user.user_id).delete(synchronize_session=False)
    db.query(OnboardingWords).filter(OnboardingWords.user_id == user.user_id).delete(synchronize_session=False)
    db.query(RecommendedVocabulary).filter(RecommendedVocabulary.user_id == user.user_id).delete(synchronize_session=False)
    db.query(UserVocabularyVector).filter(UserVocabularyVector.user_id == user.user_id).delete(synchronize_session=False)
    db.query(AssessmentBatch).filter(AssessmentBatch.user_id == user.user_id).delete(synchronize_session=False)
    db.query(UserTopic).filter(UserTopic.user_id == user.user_id).delete(synchronize_session=False)

    user.display_name = display_name
    user.estimated_cefr = "B1"
    user.onboarding_completed = False
    user.current_condition = condition
    user.has_switched_conditions = False
    user.age = None
    user.city = None
    user.gender = None
    user.job = None
    user.academic_background = None
    user.mother_language = None
    user.other_languages = None
    user.purpose = None


@router.post("/reset-team-accounts")
def reset_team_accounts(
    db: Session = Depends(get_db),
):
    reset_ids: list[str] = []
    missing_ids: list[str] = []

    for study_id, display_name, condition in TEAM_ACCOUNTS:
        user = (
            db.query(User)
            .filter(
                (User.study_code == study_id)
                | (User.username == study_id)
                | (User.user_id == f"team_{study_id.lower()}")
            )
            .first()
        )
        if not user:
            missing_ids.append(study_id)
            continue
        _reset_team_user(db, user, condition, display_name)
        reset_ids.append(study_id)

    db.commit()
    return {
        "status": "ok",
        "reset_count": len(reset_ids),
        "reset_ids": reset_ids,
        "missing_ids": missing_ids,
    }


@router.get("/export")
def download_export(
    db: Session = Depends(get_db),
):
    timestamp = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d-%H%M%S")
    filename = f"leeswijs-study-export-{timestamp}.zip"
    return Response(
        content=build_export_archive(db),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
