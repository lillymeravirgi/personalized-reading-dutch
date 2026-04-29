from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.auth_utils import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)


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
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str


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


@router.post("/signup", response_model=UserResponse)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    existing_user_id = db.query(User).filter(User.user_id == payload.user_id).first()

    if existing_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User ID already exists",
        )

    existing_email = db.query(User).filter(User.email == payload.email).first()

    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

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
    user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account does not have a password set",
        )

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user.user_id)

    return AuthResponse(
        access_token=token,
        user_id=user.user_id,
    )


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user

class ProfileUpdateRequest(BaseModel):
    age: int | None = None
    location: str | None = None
    education_level: str | None = None
    learning_purpose: str | None = None
    native_language: str | None = None
    estimated_cefr: str | None = None


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