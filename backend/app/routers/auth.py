"""
auth.py
Login and registration for the LearnDutch platform.
"""
import hashlib
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from app.config import REQUIRE_STUDY_CODE, STUDY_INVITE_CODES
from app.database import get_db
from app.models import User
from app.schemas import AuthResponse, LoginRequest, RegisterRequest

router = APIRouter(prefix="/auth", tags=["Auth"])


def hash_password(raw: str) -> str:
    return generate_password_hash(raw)


def verify_password(raw: str, stored: str | None) -> bool:
    if not stored:
        return False
    if check_password_hash(stored, raw):
        return True
    return stored == hashlib.sha256(raw.encode("utf-8")).hexdigest()


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

    study_code = (req.study_code or "").strip().upper() or None
    if REQUIRE_STUDY_CODE or STUDY_INVITE_CODES:
        if not study_code:
            raise HTTPException(status_code=422, detail="Study code is required.")
        if STUDY_INVITE_CODES and study_code not in STUDY_INVITE_CODES:
            raise HTTPException(status_code=403, detail="This study code is not valid.")
        used_code = db.query(User).filter(User.study_code == study_code).first()
        if used_code:
            raise HTTPException(status_code=409, detail="This study code has already been used.")

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
        study_code=study_code,
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

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    return _user_to_auth_response(user)
