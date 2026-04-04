from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", summary="List all users")
def list_users(db: Session = Depends(get_db)):
    """Return a list of all users with their display names and CEFR level."""
    users = db.query(User).all()
    # Map internal user_id to a display name
    name_map = {
        "u_A1":  "Sophie",
        "u_A2":  "Lars",
        "u_014": "Rowaid",
    }
    return [
        {
            "user_id": u.user_id,
            "display_name": name_map.get(u.user_id, u.user_id),
            "cefr": u.estimated_cefr,
            "purpose": u.learning_purpose,
            "location": u.location,
        }
        for u in users
    ]
