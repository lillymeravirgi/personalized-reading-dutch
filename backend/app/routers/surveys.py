"""

1. Validate and save survey response to the DB (SurveyResult table).
2. Compute a lightweight "survey signal" and persist it to ReadingSession so
   the session_generator can use it when building the next LLM prompt.

Survey → Prompt influence logic
  The signal has two axes that the prompt uses:
    • challenge_direction: "easier" | "same" | "harder"
        Driven by ZPD-1 (appropriate_challenge) and TLX-MD (mental_effort).
        If the learner found the text too easy (low challenge, low effort) →
        next text should be harder. If overwhelmed → easier. Otherwise → same.
    • engagement_boost: bool
        True when UES composite < 3 — signals that topics/style should be
        refreshed to re-engage the learner.

  These are stored on ReadingSession.survey_signal (JSON column) and read
  by session_generator.build_prompt() before calling the LLM.
"""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ReadingSession, SurveyResult
from app.schemas import SurveyResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/surveys", tags=["Surveys"])


# ── Helpers

def _compute_survey_signal(payload: SurveyResponse) -> dict:
    """
    Derive a structured signal from survey answers.
    This is stored on the session and consumed by the LLM prompt builder.
    """
    # ── Challenge direction
    # ZPD-1: 1=way too easy … 5=way too hard
    # TLX-MD: 1=very low effort … 7=very high effort
    challenge = payload.appropriate_challenge
    effort = payload.mental_effort          # 1–7, rescale to 1–5 for comparison
    effort_rescaled = round(1 + (effort - 1) * (4 / 6))   # maps 1→1, 7→5

    avg_difficulty = (challenge + effort_rescaled) / 2

    if avg_difficulty <= 2.0:
        challenge_direction = "harder"    # learner was under-challenged
    elif avg_difficulty >= 4.0:
        challenge_direction = "easier"   # learner was overwhelmed
    else:
        challenge_direction = "same"     # in the ZPD sweet spot

    # ── Engagement boost needed?
    # UES composite: average of focused_attention, reward, perceived_relevance
    ues_composite = (
        payload.focused_attention + payload.reward + payload.perceived_relevance
    ) / 3
    engagement_boost = ues_composite < 3.0   # below midpoint → refresh topics

    # ── Worth continuing? (RQ1-W3)
    worth_continuing = payload.worth_my_time >= 4   # 4 or 5 = positive

    # ── Perceived relevance signal (manipulation check)
    felt_personalised = payload.perceived_personalization >= 4

    return {
        "challenge_direction": challenge_direction,
        "engagement_boost": engagement_boost,
        "worth_continuing": worth_continuing,
        "felt_personalised": felt_personalised,
        "ues_composite": round(ues_composite, 2),
        "avg_difficulty": round(avg_difficulty, 2),
    }


@router.post("")
def submit_survey(payload: SurveyResponse, db: Session = Depends(get_db)):
    """
    1. Save all 8 survey fields to SurveyResult.
    2. Compute and persist survey_signal on the parent ReadingSession.
    """
    # ── 1. Verify session exists
    session = db.query(ReadingSession).filter(
        ReadingSession.session_id == payload.session_id
    ).first()
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"session_id={payload.session_id} not found",
        )

    # ── 2. Upsert SurveyResult (one per session)
    existing = db.query(SurveyResult).filter(
        SurveyResult.session_id == payload.session_id
    ).first()

    if existing:
        # Overwrite if participant re-submits (shouldn't normally happen)
        row = existing
    else:
        row = SurveyResult(session_id=payload.session_id)
        db.add(row)

    row.worth_my_time             = payload.worth_my_time
    row.appropriate_challenge     = payload.appropriate_challenge
    row.comprehension             = payload.comprehension
    row.focused_attention         = payload.focused_attention
    row.reward                    = payload.reward
    row.perceived_relevance       = payload.perceived_relevance
    row.mental_effort             = payload.mental_effort
    row.perceived_personalization = payload.perceived_personalization

    # ── 3. Compute prompt signal and attach to session
    signal = _compute_survey_signal(payload)
    session.survey_signal = signal          # JSON column on ReadingSession
    logger.info(
        f"[Survey] session={payload.session_id} signal={signal}"
    )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"[Survey] DB commit failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return {"success": True, "signal": signal}