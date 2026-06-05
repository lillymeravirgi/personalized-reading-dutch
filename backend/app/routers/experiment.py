import csv
import datetime
import enum
import io
import json
import secrets
import zipfile
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.config import EXPORT_TOKEN
from app.database import get_db
from app.models import (
    AssessmentBatch,
    ConditionType,
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
    ("users", User, {"password_hash", "email"}),
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


def verify_export_token(provided_token: str | None, configured_token: str) -> None:
    if not configured_token:
        raise HTTPException(status_code=503, detail="Export is not configured")
    if not provided_token or not secrets.compare_digest(provided_token, configured_token):
        raise HTTPException(status_code=401, detail="Invalid export token")


def _serialize_csv_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def _csv_for_model(db: Session, model: type[Any], excluded_fields: set[str]) -> str:
    columns = [
        column.name
        for column in model.__table__.columns
        if column.name not in excluded_fields
    ]
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()

    query = db.query(model)
    primary_key_columns = list(model.__mapper__.primary_key)
    if primary_key_columns:
        query = query.order_by(*primary_key_columns)

    for row in query.all():
        writer.writerow({
            column: _serialize_csv_value(getattr(row, column))
            for column in columns
        })

    return output.getvalue()


def _mean(values: list[int | float]) -> float | str:
    if not values:
        return ""
    return round(sum(values) / len(values), 2)


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
        if current is None or (row.timestamp, row.id) > (current.timestamp, current.id):
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
        "onboarding_word_count",
        "phase_learning_word_count",
        "readings_started",
        "readings_completed",
        "reading_session_ids",
        "total_reading_seconds",
        "avg_reading_seconds",
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
        "reading_more_count",
        "immediate_correct",
        "immediate_total",
        "immediate_percent",
        "immediate_completed_at",
        "delayed_correct",
        "delayed_total",
        "delayed_percent",
        "delayed_completed_at",
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

            immediate = _test_summary([
                row for row in test_rows
                if row.study_phase == phase and row.test_type == "immediate"
            ])
            delayed = _test_summary([
                row for row in test_rows
                if row.study_phase == phase and row.test_type == "delayed"
            ])

            retention_delta = ""
            if immediate["percent"] != "" and delayed["percent"] != "":
                retention_delta = round(float(delayed["percent"]) - float(immediate["percent"]), 2)

            engagement_scores = [
                (row.focused_attention + row.reward + row.perceived_relevance) / 3
                for row in surveys
            ]
            reading_seconds = [
                session.duration_seconds
                for session in phase_sessions
                if session.duration_seconds is not None
            ]
            condition = ""
            if phase_sessions:
                condition = _serialize_csv_value(phase_sessions[0].condition)

            writer.writerow({
                "user_id": user.user_id,
                "study_code": user.study_code or "",
                "study_phase": phase,
                "condition": condition,
                "condition_source": "first_reading_session" if condition else "",
                "onboarding_word_count": len(phase_onboarding),
                "phase_learning_word_count": len(phase_vectors),
                "readings_started": len(phase_sessions),
                "readings_completed": sum(1 for session in phase_sessions if session.survey_completed),
                "reading_session_ids": json.dumps(phase_session_ids),
                "total_reading_seconds": sum(reading_seconds) if reading_seconds else "",
                "avg_reading_seconds": _mean(reading_seconds),
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
                "telemetry_weight_total": sum(row.engagement_weight for row in telemetry_rows),
                "reading_more_count": sum(session.continuation_count or 0 for session in phase_sessions),
                "immediate_correct": immediate["correct"],
                "immediate_total": immediate["total"],
                "immediate_percent": immediate["percent"],
                "immediate_completed_at": immediate["completed_at"],
                "delayed_correct": delayed["correct"],
                "delayed_total": delayed["total"],
                "delayed_percent": delayed["percent"],
                "delayed_completed_at": delayed["completed_at"],
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
                _csv_for_model(db, model, excluded_fields),
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
    x_export_token: str | None = Header(default=None, alias="X-Export-Token"),
    db: Session = Depends(get_db),
):
    verify_export_token(x_export_token, EXPORT_TOKEN)

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
    x_export_token: str | None = Header(default=None, alias="X-Export-Token"),
    db: Session = Depends(get_db),
):
    verify_export_token(x_export_token, EXPORT_TOKEN)
    timestamp = datetime.datetime.now(datetime.UTC).strftime("%Y%m%d-%H%M%S")
    filename = f"leeswijs-study-export-{timestamp}.zip"
    return Response(
        content=build_export_archive(db),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
