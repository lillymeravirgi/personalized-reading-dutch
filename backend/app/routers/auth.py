"""
auth.py
Login and registration for the LearnDutch platform.
Passwords are stored as SHA-256 hashes (prototype-grade; replace with bcrypt for production).
"""
import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import AuthResponse, LoginRequest, RegisterRequest

router = APIRouter(prefix="/auth", tags=["Auth"])


def hash_password(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _user_to_auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        user_id=user.user_id,
        email=user.email or "",
        display_name=user.display_name,
        estimated_cefr=user.estimated_cefr,
        onboarding_completed=user.onboarding_completed,
    )


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    if not email:
        raise HTTPException(status_code=422, detail="Email is required.")

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user_id = f"u_{uuid.uuid4().hex[:12]}"
    user = User(
        user_id=user_id,
        email=email,
        username=email,
        password_hash=hash_password(req.password),
        display_name=req.display_name or email.split("@")[0],
        onboarding_completed=False,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

    return _user_to_auth_response(user)


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    if not user or user.password_hash != hash_password(req.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return _user_to_auth_response(user)
