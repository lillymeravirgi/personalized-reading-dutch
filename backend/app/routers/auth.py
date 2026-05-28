"""
auth.py
Login and registration for the LeesWijs study prototype.
"""
import hashlib
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash, generate_password_hash

from app.config import REQUIRE_STUDY_CODE, STUDY_INVITE_CODES
from app.database import get_db
from app.models import ConditionType, User
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


def validate_password(raw: str) -> str | None:
    if len(raw) < 8:
        return "Password must be at least 8 characters."
    if not re.search(r"[a-z]", raw):
        return "Password must include a lowercase letter."
    if not re.search(r"[A-Z]", raw):
        return "Password must include an uppercase letter."
    if not re.search(r"\d", raw):
        return "Password must include a number."
    if not re.search(r"[^A-Za-z0-9]", raw):
        return "Password must include a special character."
    return None


def normalise_study_id(value: str) -> str:
    return value.strip().upper()


def study_email(study_id: str) -> str:
    return f"{study_id.lower()}@{STUDY_EMAIL_DOMAIN}"


def is_email(value: str) -> bool:
    return "@" in value


def condition_from_request(value: str | None) -> ConditionType:
    if value and value.upper() in ConditionType.__members__:
        return ConditionType[value.upper()]
    return ConditionType.ADAPTIVE


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
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    raw_identifier = req.email.strip()
    study_code = normalise_study_id(req.study_code) if req.study_code else None
    if not study_code and raw_identifier and not is_email(raw_identifier):
        study_code = normalise_study_id(raw_identifier)
    if not raw_identifier:
        raise HTTPException(status_code=422, detail="Study ID is required.")

    password_error = validate_password(req.password)
    if password_error:
        raise HTTPException(status_code=422, detail=password_error)

    if REQUIRE_STUDY_CODE or STUDY_INVITE_CODES:
        if not study_code:
            raise HTTPException(status_code=422, detail="Study ID is required.")
        if STUDY_INVITE_CODES and study_code not in STUDY_INVITE_CODES:
            raise HTTPException(status_code=403, detail="This Study ID is not valid.")
        used_code = db.query(User).filter(User.study_code == study_code).first()
        if used_code:
            raise HTTPException(status_code=409, detail="This Study ID has already been used.")

    if is_email(raw_identifier) and not study_code:
        email = raw_identifier.lower()
        username = email
        display_name = req.display_name or email.split("@")[0]
    else:
        username = study_code or normalise_study_id(raw_identifier)
        email = study_email(username)
        display_name = req.display_name or username

    existing = db.query(User).filter(
        or_(User.email == email, User.username == username)
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="This Study ID already has an account.")

    user = User(
        user_id=f"u_{uuid.uuid4().hex[:12]}",
        email=email,
        username=username,
        password_hash=hash_password(req.password),
        display_name=display_name,
        study_code=study_code,
        onboarding_completed=False,
        current_condition=condition_from_request(req.start_condition),
        has_switched_conditions=False,
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
