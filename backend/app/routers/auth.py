import hashlib
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from werkzeug.security import check_password_hash

from app.auth_utils import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import User, UserAccount, UserTopic

router = APIRouter(prefix="/auth", tags=["Auth"])


class SignupRequest(BaseModel):
    user_id: str
    email: EmailStr
    password: str
    age: int | None = None
    location: str | None = None
    education_level: str | None = None
    learning_purpose: str | None = None
    native_language: str | None = None
    estimated_cefr: str | None = None


class LoginRequest(BaseModel):
    username: str | None = None
    email: EmailStr | None = None
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    display_name: str
    estimated_cefr: str | None = None
    interests: list[str] = []
    assessed_at: str | None = None
    created_at: str | None = None


class UserResponse(BaseModel):
    user_id: str
    email: str | None = None
    age: int | None = None
    location: str | None = None
    education_level: str | None = None
    learning_purpose: str | None = None
    native_language: str | None = None
    estimated_cefr: str | None = None

    model_config = {"from_attributes": True}


class ProfileUpdateRequest(BaseModel):
    age: int | None = None
    location: str | None = None
    education_level: str | None = None
    learning_purpose: str | None = None
    native_language: str | None = None
    estimated_cefr: str | None = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


def _verify_seed_or_werkzeug_password(raw_password: str, stored_hash: str) -> bool:
    """Support old seed.py SHA-256 hashes and newer Werkzeug hashes."""
    if stored_hash == hashlib.sha256(raw_password.encode("utf-8")).hexdigest():
        return True
    try:
        return check_password_hash(stored_hash, raw_password)
    except ValueError:
        return False


def _account_response(user: User, account: UserAccount | None, db: Session) -> AuthResponse:
    interests = [
        row.topic_name
        for row in db.query(UserTopic).filter(UserTopic.user_id == user.user_id).all()
    ]
    username = account.username if account else (user.email or user.user_id)
    display_name = account.display_name if account else username
    created_at = None
    if account and account.created_at:
        created_at = account.created_at.isoformat()

    return AuthResponse(
        access_token=create_access_token(user.user_id),
        user_id=user.user_id,
        username=username,
        display_name=display_name,
        estimated_cefr=user.estimated_cefr,
        interests=interests,
        assessed_at=None,
        created_at=created_at,
    )


@router.post("/signup", response_model=UserResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.user_id == payload.user_id).first():
        raise HTTPException(status_code=400, detail="User ID already exists")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        user_id=payload.user_id,
        email=payload.email,
        password_hash=hash_password(payload.password),
        age=payload.age,
        location=payload.location,
        education_level=payload.education_level,
        learning_purpose=payload.learning_purpose,
        native_language=payload.native_language,
        estimated_cefr=payload.estimated_cefr,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    identifier = payload.username or payload.email
    if not identifier:
        raise HTTPException(status_code=422, detail="Username or email is required")

    account = db.query(UserAccount).filter(UserAccount.username == identifier).first()
    if account:
        user = db.query(User).filter(User.user_id == account.user_id).first()
        if not user or not _verify_seed_or_werkzeug_password(payload.password, account.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
        return _account_response(user, account, db)

    user = db.query(User).filter(User.email == identifier).first()
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    return _account_response(user, None, db)


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    account = db.query(UserAccount).filter(UserAccount.user_id == current_user.user_id).first()
    if account:
        if not _verify_seed_or_werkzeug_password(payload.old_password, account.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        account.password_hash = hash_password(payload.new_password)
    else:
        if not current_user.password_hash or not verify_password(payload.old_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
        current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"success": True}


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me/profile", response_model=UserResponse)
def update_my_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(current_user, field, value)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user
