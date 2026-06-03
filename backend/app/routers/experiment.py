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


def build_export_archive(db: Session) -> bytes:
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for table_name, model, excluded_fields in EXPORT_TABLES:
            zf.writestr(
                f"{table_name}.csv",
                _csv_for_model(db, model, excluded_fields),
            )
    return archive.getvalue()


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
