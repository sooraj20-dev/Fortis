from pydantic import BaseModel, EmailStr, field_validator, ValidationInfo
from typing import Optional
from app.security import validate_password_strength


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        cleaned = " ".join(v.strip().split())
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 characters long")
        if len(cleaned) > 100:
            raise ValueError("Name cannot exceed 100 characters")
        return cleaned

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return str(v).strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str, info: ValidationInfo) -> str:
        user_email = info.data.get("email") if info.data else None
        user_name = info.data.get("name") if info.data else None
        is_valid, error_msg = validate_password_strength(
            v,
            user_email=str(user_email) if user_email else None,
            user_name=str(user_name) if user_name else None,
        )
        if not is_valid:
            raise ValueError(error_msg)
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return str(v).strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if not v:
            raise ValueError("Password is required")
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password cannot exceed 72 UTF-8 bytes")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    name: str
    email: str
    is_admin: bool
    onboarding_complete: bool
    avatar_url: Optional[str] = None
    expires_in: Optional[int] = None


class RegistrationResponse(BaseModel):
    message: str
    email: EmailStr
    verification_required: bool = True


class EmailVerificationRequest(BaseModel):
    token: str

    @field_validator("token")
    @classmethod
    def validate_token(cls, value: str) -> str:
        if not 32 <= len(value) <= 256:
            raise ValueError("Verification token is invalid")
        return value


class ResendVerificationRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return str(value).strip().lower()


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    is_admin: bool
    is_active: bool
    avatar_url: Optional[str] = None
    last_login_at: Optional[str] = None

    model_config = {"from_attributes": True}
