from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import InteractionTelemetry
from app.schemas import LogTelemetryRequest, LogTelemetryResponse

router = APIRouter(prefix="/telemetry", tags=["Telemetry"])


@router.post("/log", response_model=LogTelemetryResponse)
def log_telemetry(req: LogTelemetryRequest, db: Session = Depends(get_db)):
    log = InteractionTelemetry(
        session_id=req.session_id,
        word_id=req.word_id,
        intent_tag=req.intent_tag,
        engagement_weight=req.engagement_weight,
    )
    db.add(log)
    try:
        db.commit()
        db.refresh(log)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return LogTelemetryResponse(
        log_id=log.log_id,
        message=f"Logged {req.intent_tag.value} (weight={req.engagement_weight})",
    )
