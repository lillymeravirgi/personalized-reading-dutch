import hashlib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from app.database import get_db
from app.models import User
from app.schemas import AuthResponse, LoginRequest, RegisterRequest

router = APIRouter(prefix="/auth", tags=["Auth"])
STUDY_EMAIL_DOMAIN = "leeswijs.study"


def hash_password(raw: str) -> str:
    return generate_password_hash(raw)


def verify_password(raw: str, stored: str | None) -> bool:
    if not stored:
        return False
    if check_password_hash(stored, raw):
        return True
    return stored == hashlib.sha256(raw.encode("utf-8")).hexdigest()


def normalise_study_id(value: str) -> str:
    return value.strip().upper()


def study_email(study_id: str) -> str:
    return f"{study_id.lower()}@{STUDY_EMAIL_DOMAIN}"


def is_email(value: str) -> bool:
    return "@" in value


def _user_to_auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        user_id=user.user_id,
        email=user.email or "",
        display_name=user.display_name,
        estimated_cefr=user.estimated_cefr,
        onboarding_completed=user.onboarding_completed,
        current_condition=user.current_condition.value,
        has_switched_conditions=user.has_switched_conditions,
    )


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(_req: RegisterRequest):
    raise HTTPException(status_code=403, detail="Account creation is closed for this study.")


@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    identifier = req.email.strip()
    if is_email(identifier):
        user = db.query(User).filter(User.email == identifier.lower()).first()
    else:
        study_id = normalise_study_id(identifier)
        user = db.query(User).filter(
            or_(
                User.study_code == study_id,
                User.username == study_id,
                User.email == study_email(study_id),
            )
        ).first()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Study ID or password.",
        )

    return _user_to_auth_response(user)
