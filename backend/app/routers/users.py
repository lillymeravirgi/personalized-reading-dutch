"""
users.py — Full profile read / update.
All onboarding fields are editable here after onboarding completes.
"""
import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user_id
from app.models import Lexicon, ReadingSession, TopicStatus, User, UserTopic, UserVocabularyVector, VocabStatus
from app.schemas import ProfileUpdateRequest

router = APIRouter(prefix="/users", tags=["Users"])


def _display_user(user: User, db: Session) -> dict:
    interests = [
        row.topic_name
        for row in db.query(UserTopic).filter(UserTopic.user_id == user.user_id).all()
    ]
    return {
        "id":                   user.user_id,
        "user_id":              user.user_id,
        "email":                user.email or "",
        "display_name":         user.display_name or "",
        "name":                 user.display_name or user.email or user.user_id,
        "interests":            interests,
        "cefrLevel":            user.estimated_cefr,
        "estimated_cefr":       user.estimated_cefr,
        "onboarding_completed": user.onboarding_completed,
        "age":                  user.age,
        "city":                 user.city,
        "gender":               user.gender,
        "job":                  user.job,
        "academic_background":  user.academic_background,
        "mother_language":      user.mother_language,
        "other_languages":      user.other_languages,
        "purpose":              user.purpose,
        "preferred_styles":     user.preferred_styles or [],
        "assessedAt":           None,
        "createdAt":            user.created_at.isoformat() if user.created_at else None,
    }


@router.get("", summary="List all users (admin)")
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [
        {
            "user_id":      user.user_id,
            "display_name": user.display_name or user.email or user.user_id,
            "email":        user.email,
            "cefr":         user.estimated_cefr,
            "purpose":      user.purpose,
            "city":         user.city,
        }
        for user in users
    ]


@router.get("/me")
def get_me(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"success": True, "data": _display_user(user, db)}


@router.put("/me/profile")
def update_profile(
    payload: ProfileUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.display_name  is not None: user.display_name  = payload.display_name
    if payload.age           is not None: user.age           = payload.age
    if payload.city          is not None: user.city          = payload.city
    if payload.gender        is not None: user.gender        = payload.gender
    if payload.job           is not None: user.job           = payload.job
    if payload.academic_background is not None: user.academic_background = payload.academic_background
    if payload.mother_language     is not None: user.mother_language     = payload.mother_language
    if payload.other_languages     is not None: user.other_languages     = payload.other_languages
    if payload.purpose             is not None: user.purpose             = payload.purpose
    if payload.preferred_styles    is not None: user.preferred_styles    = payload.preferred_styles
    if payload.estimated_cefr      is not None: user.estimated_cefr      = payload.estimated_cefr

    if payload.interests is not None:
        db.query(UserTopic).filter(UserTopic.user_id == user_id).delete()
        seen: list[str] = []
        for interest in payload.interests:
            value = interest.strip().lower()
            if value and value not in seen:
                seen.append(value)
                db.add(UserTopic(user_id=user_id, topic_name=value, status=TopicStatus.INTERESTED))

    db.add(user)
    db.commit()
    db.refresh(user)
    return {"success": True, "data": _display_user(user, db)}


@router.post("/me/complete-onboarding")
def complete_onboarding(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.onboarding_completed = True
    db.commit()
    return {"success": True}


@router.get("/me/dashboard-stats")
def get_dashboard_stats(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """
    Returns all data needed for the Home analytics dashboard in a single call.
    """
    user = db.query(User).filter(User.user_id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = datetime.datetime.utcnow()

    # ── Vocabulary stats ──────────────────────────────────────────────────────
    vectors = db.query(UserVocabularyVector).filter(
        UserVocabularyVector.user_id == user_id
    ).all()

    total_learning = sum(1 for v in vectors if v.status == VocabStatus.LEARNING)
    total_mastered = sum(1 for v in vectors if v.status == VocabStatus.MASTERED)
    total_known    = total_mastered   # alias for clarity

    # Words Due Today
    to_review = sum(
        1 for v in vectors
        if v.status == VocabStatus.LEARNING
        and (v.next_review_at is None or v.next_review_at <= now)
    )

    # Words Reviewed Today (Math for Daily Progress)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    reviewed_today = sum(
        1 for v in vectors
        if v.last_reviewed_at is not None and v.last_reviewed_at >= today_start
    )

    total_daily_task = reviewed_today + to_review
    daily_progress   = (reviewed_today / total_daily_task * 100) if total_daily_task > 0 else 0

    # ── Reading / session stats ───────────────────────────────────────────────
    sessions = db.query(ReadingSession).filter(
        ReadingSession.user_id == user_id
    ).all()

    readings_completed = sum(1 for s in sessions if s.survey_completed)
    readings_total     = len(sessions)

    # ── Time spent (approximate via exposure_count as proxy) ──────────────────
    # Each reading session ≈ 5–8 minutes; we use survey_completed as "done"
    # For now, compute based on completed sessions × avg read time
    AVG_READING_MIN = 6

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start  = today_start - datetime.timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    # We don't have precise timestamps per session yet, so we proxy:
    # time_today/week/month based on session creation if available
    # ReadingSession has no created_at, so we use reading_number as ordering proxy
    # We'll return static-safe zeros for time tracking (real tracking needs UserActivity)
    # Frontend will show this gracefully
    time_today_min = 0
    time_week_min  = 0
    time_month_min = 0

    # ── Productivity Chart Data (Last 10 sessions) ───────────────────────────
    completed_sessions = db.query(ReadingSession).filter(
        ReadingSession.user_id == user_id,
        ReadingSession.survey_completed == True
    ).order_by(ReadingSession.session_id.desc()).limit(10).all()

    productivity_data = [
        {
            "session_name": f"Story {s.reading_number}",
            "duration_min": round((s.duration_seconds or 0) / 60, 1),
            "date": s.created_at.isoformat() if s.created_at else None
        }
        for s in reversed(completed_sessions)
    ]
    avg_duration_min = sum(d["duration_min"] for d in productivity_data) / len(productivity_data) if productivity_data else 0

    # ── Acquisition score fix (Mastered / 1000 words goal) ───────────────────
    # The user wants progress toward a lifetime goal of 1,000 words.
    ACQUISITION_GOAL = 1000
    acquisition_score = int((total_mastered / ACQUISITION_GOAL) * 100) if ACQUISITION_GOAL > 0 else 0

    return {
        "cefr_level":          user.estimated_cefr or "—",
        "acquisition_score":   acquisition_score,

        # Vocabulary
        "total_known":         total_known,
        "total_learning":      total_learning,
        "total_mastered":      total_mastered,
        "to_review":           to_review,
        "reviewed_today":      reviewed_today,
        "daily_progress":      daily_progress,

        # Reading engagement
        "readings_completed":  readings_completed,
        "readings_total":      readings_total,

        # Productivity chart
        "productivity_data":   productivity_data,
        "avg_duration_min":    round(avg_duration_min, 1),

        # Time spent (minutes)
        "time_today_min":      time_today_min,
        "time_week_min":       time_week_min,
        "time_month_min":      time_month_min,
        "is_new":              readings_total == 0 and total_mastered == 0,
    }
