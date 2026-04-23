# Login endpoint for pre-assigned research accounts.
# Passwords are hashed for the prototype seed data.
import hashlib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import UserAccount
from app.schemas import AuthResponse, LoginRequest

router = APIRouter(prefix="/auth", tags=["Auth"])


def hash_password(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    username = req.username.strip().lower()
    account = db.query(UserAccount).filter(UserAccount.username == username).first()

    if not account or account.password_hash != hash_password(req.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    return AuthResponse(
        user_id=account.user_id,
        username=account.username,
        display_name=account.display_name,
        estimated_cefr=account.user.estimated_cefr,
    )
