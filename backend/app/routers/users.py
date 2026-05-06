from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user_id
from app.models import TopicStatus, User, UserTopic

router = APIRouter(prefix="/users", tags=["Users"])


class ProfileUpdateRequest(BaseModel):
    interests: list[str] | None = None
    estimated_cefr: str | None = None
    assessed_at: str | None = None


def _display_user(user: User, db: Session) -> dict:
    interests = [
        row.topic_name
        for row in db.query(UserTopic).filter(UserTopic.user_id == user.user_id).all()
    ]
    return {
        "id": user.user_id,
        "user_id": user.user_id,
        "name": user.email or user.user_id,
        "email": user.email or user.user_id,
        "interests": interests,
        "cefrLevel": user.estimated_cefr,
        "estimated_cefr": user.estimated_cefr,
        "assessedAt": None,
        "createdAt": None,
    }


@router.get("", summary="List all users")
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return [
        {
            "user_id": user.user_id,
            "display_name": user.email or user.user_id,
            "cefr": user.estimated_cefr,
            "purpose": user.learning_purpose,
            "location": user.location,
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

    if payload.estimated_cefr is not None:
        user.estimated_cefr = payload.estimated_cefr

    if payload.interests is not None:
        db.query(UserTopic).filter(UserTopic.user_id == user_id).delete()
        cleaned: list[str] = []
        for interest in payload.interests:
            value = interest.strip().lower()
            if value and value not in cleaned:
                cleaned.append(value)
        for interest in cleaned:
            db.add(
                UserTopic(
                    user_id=user_id,
                    topic_name=interest,
                    status=TopicStatus.INTERESTED,
                )
            )

    db.add(user)
    db.commit()
    return {"success": True, "data": _display_user(user, db)}
