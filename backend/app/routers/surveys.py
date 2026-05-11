"""
surveys.py — Post-reading survey submission.

Challenge direction is derived from TLX-MD only (spec item 9).
The appropriateChallenge field is not shown to users; the frontend
sends a neutral default of 3. The backend only uses TLX-MD as proxy.
"""

import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ReadingSession, SurveyResult
from app.schemas import SurveyResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/surveys", tags=["Surveys"])


def _compute_survey_signal(payload: SurveyResponse) -> dict:
    """
    Derive a structured signal from survey answers.
    TLX-MD (mental_effort 1–7) is the sole difficulty proxy (spec §9).
    """
    tlx_md = payload.mental_effort   # 1–7

    if tlx_md >= 5:
        challenge_direction = "easier"
    elif tlx_md <= 2:
        challenge_direction = "harder"
    else:
        challenge_direction = "same"

    # Engagement boost (UES composite < 3)
    ues_composite = (
        payload.focused_attention + payload.reward + payload.perceived_relevance
    ) / 3
    engagement_boost = ues_composite < 3.0

    worth_continuing  = payload.worth_my_time >= 4
    felt_personalised = payload.perceived_personalization >= 4

    return {
        "challenge_direction": challenge_direction,
        "tlx_md":             tlx_md,
        "engagement_boost":   engagement_boost,
        "worth_continuing":   worth_continuing,
        "felt_personalised":  felt_personalised,
        "ues_composite":      round(ues_composite, 2),
    }


@router.post("")
def submit_survey(payload: SurveyResponse, db: Session = Depends(get_db)):
    session = db.query(ReadingSession).filter(
        ReadingSession.session_id == payload.session_id
    ).first()
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"session_id={payload.session_id} not found",
        )

    # Upsert SurveyResult
    existing = db.query(SurveyResult).filter(
        SurveyResult.session_id == payload.session_id
    ).first()

    row = existing or SurveyResult(session_id=payload.session_id)
    if not existing:
        db.add(row)

    row.worth_my_time             = payload.worth_my_time
    row.appropriate_challenge     = payload.appropriate_challenge
    row.comprehension             = payload.comprehension
    row.focused_attention         = payload.focused_attention
    row.reward                    = payload.reward
    row.perceived_relevance       = payload.perceived_relevance
    row.mental_effort             = payload.mental_effort
    row.perceived_personalization = payload.perceived_personalization

    if payload.duration_seconds and payload.duration_seconds > 0:
        session.duration_seconds = payload.duration_seconds
    elif session.created_at:
        delta = datetime.datetime.utcnow() - session.created_at
        session.duration_seconds = max(1, int(delta.total_seconds()))

    # Compute and persist signal
    signal = _compute_survey_signal(payload)
    session.survey_signal    = signal
    session.survey_completed = True   # ← unlock next reading generation

    logger.info("[Survey] session=%d signal=%s", payload.session_id, signal)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"[Survey] DB commit failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"success": True, "signal": signal}