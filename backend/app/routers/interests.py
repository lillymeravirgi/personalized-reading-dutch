from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserTopic, TopicStatus
from app.auth_utils import get_current_user


router = APIRouter(prefix="/interests", tags=["Interests"])


class InterestsUpdateRequest(BaseModel):
    interests: list[str]


class InterestsResponse(BaseModel):
    interests: list[str]


@router.get("/me", response_model=InterestsResponse)
def get_my_interests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(UserTopic)
        .filter(UserTopic.user_id == current_user.user_id)
        .all()
    )

    return InterestsResponse(
        interests=[row.topic_name for row in rows]
    )


@router.put("/me", response_model=InterestsResponse)
def update_my_interests(
    payload: InterestsUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(UserTopic).filter(
        UserTopic.user_id == current_user.user_id
    ).delete()

    cleaned_interests = []

    for interest in payload.interests:
        cleaned = interest.strip().lower()

        if cleaned and cleaned not in cleaned_interests:
            cleaned_interests.append(cleaned)

    for interest in cleaned_interests:
        db.add(
            UserTopic(
                user_id=current_user.user_id,
                topic_name=interest,
                status=TopicStatus.INTERESTED,
            )
        )

    db.commit()

    return InterestsResponse(interests=cleaned_interests)