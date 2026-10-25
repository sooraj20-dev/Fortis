"""Auth router — secure register, login, and me endpoints"""
import uuid
import logging
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from jose import jwt

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.profile import Profile, Goal
from app.schemas.auth import (UserCreate, LoginRequest, TokenResponse, RegistrationResponse,
                              EmailVerificationRequest, ResendVerificationRequest)
from app.config import settings
from app.security import (
    pwd_context,
    DUMMY_PASSWORD_HASH,
    auth_rate_limiter,
    get_client_ip,
)
from app.email_verification import is_email_delivery_configured, send_verification_email, EmailDeliveryError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": expire,
        "jti": uuid.uuid4().hex,
        "type": "access",
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM
    )


def _is_onboarding_complete(user: User, db: Session) -> bool:
    if getattr(user, "onboarding_completed", False):
        return True
    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    goal = db.query(Goal).filter(Goal.user_id == user.id).first()
    return profile is not None and goal is not None


VERIFICATION_SENT_MESSAGE = "If this account requires verification, a link has been sent. Check your inbox or request another link."
REGISTRATION_VERIFICATION_MESSAGE = "If this address can be registered, a verification link will be sent. If you already have an account, sign in."
REGISTRATION_NO_VERIFICATION_MESSAGE = "If registration was successful, you can sign in now. If you already have an account, sign in."
INVALID_LOGIN_MESSAGE = "Invalid email or password."


def _verification_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _deliver_verification_in_background(email: str, name: str, token: str) -> None:
    try:
        send_verification_email(email, name, token)
    except EmailDeliveryError:
        logger.warning("Registration verification email delivery failed")
    except Exception:
        logger.exception("Unexpected registration verification email failure")


@router.post("/register", response_model=RegistrationResponse, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Create an account without issuing a session before any required email verification."""
    client_ip = get_client_ip(request)
    if settings.AUTH_RATE_LIMIT_ENABLED and client_ip != "testclient":
        allowed, retry_after = auth_rate_limiter.is_allowed(
            f"reg_ip:{client_ip}",
            max_attempts=settings.AUTH_RATE_LIMIT_REGISTER_PER_MINUTE,
            window_seconds=60,
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many registration requests from this IP. Please try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

    try:
        clean_email = data.email.strip().lower()
        delivery_configured = is_email_delivery_configured()
        hashed_password = pwd_context.hash(data.password)
        existing_user = db.query(User).filter(User.email == clean_email).first()
        if existing_user:
            return RegistrationResponse(
                message=REGISTRATION_VERIFICATION_MESSAGE if delivery_configured else REGISTRATION_NO_VERIFICATION_MESSAGE,
                email=clean_email,
                verification_required=delivery_configured,
            )

        now = datetime.now(timezone.utc)
        verification_token = secrets.token_urlsafe(32) if delivery_configured else None
        user = User(
            email=clean_email,
            name=data.name.strip(),
            hashed_password=hashed_password,
            is_active=True,
            is_admin=False,
            onboarding_completed=False,
            failed_login_attempts=0,
            locked_until=None,
            last_login_at=None,
            # Syntax is validated by EmailStr. Verify inbox ownership when SMTP is
            # configured, without holding signup or the first session hostage.
            email_verified=False if delivery_configured else None,
            email_verification_token_hash=_verification_hash(verification_token) if verification_token else None,
            email_verification_expires_at=(now + timedelta(minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES)) if verification_token else None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # Persist before delivery so a fast click cannot race the database commit.
        if verification_token:
            background_tasks.add_task(_deliver_verification_in_background, clean_email, user.name, verification_token)

        logger.info("New account created (id=%s)", user.id)
        return RegistrationResponse(
            message=REGISTRATION_VERIFICATION_MESSAGE if delivery_configured else REGISTRATION_NO_VERIFICATION_MESSAGE,
            email=clean_email,
            verification_required=delivery_configured,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Registration failure: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please check your information and try again."
        )


@router.post("/verify-email")
def verify_email(data: EmailVerificationRequest, db: Session = Depends(get_db)):
    """Consume a one-time verification token and mark its account verified."""
    user = db.query(User).filter(User.email_verification_token_hash == _verification_hash(data.token)).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification link is invalid or expired.")
    if getattr(user, "email_verified", None) is True:
        return {"verified": True, "email": user.email, "message": "Email address is already verified. You can sign in."}
    expires_at = getattr(user, "email_verification_expires_at", None)
    if not expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification link is invalid or expired.")
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        user.email_verification_token_hash = None
        user.email_verification_expires_at = None
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification link is invalid or expired. Request a new link.")
    user.email_verified = True
    user.email_verification_token_hash = None
    user.email_verification_expires_at = None
    db.commit()
    return {"verified": True, "email": user.email, "message": "Email address verified. You can now sign in."}


@router.post("/verification/resend", response_model=RegistrationResponse)
def resend_verification(data: ResendVerificationRequest, request: Request, db: Session = Depends(get_db)):
    """Resend with generic responses to avoid disclosing whether an address has an account."""
    ip = get_client_ip(request)
    email_key = hashlib.sha256(data.email.encode("utf-8")).hexdigest()
    for key, limit, window in ((f"verify_ip:{ip}", 10, 60), (f"verify_email:{email_key}", 3, 3600)):
        allowed, retry_after = auth_rate_limiter.is_allowed(key, max_attempts=limit, window_seconds=window)
        if not allowed:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                                detail="Please wait before requesting another verification email.",
                                headers={"Retry-After": str(retry_after)})
    if not is_email_delivery_configured():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="Email verification is temporarily unavailable. Please try again later.")
    user = db.query(User).filter(User.email == data.email).first()
    if user and getattr(user, "email_verified", None) is False:
        token = secrets.token_urlsafe(32)
        user.email_verification_token_hash = _verification_hash(token)
        user.email_verification_expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES)
        db.commit()
        try:
            send_verification_email(user.email, user.name, token)
        except EmailDeliveryError:
            logger.warning("Verification resend delivery failed")
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                                detail="We could not send a verification email. Please try again later.")
    return RegistrationResponse(message=VERIFICATION_SENT_MESSAGE, email=data.email)


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Authenticate with email + password using IP and per-IP/email throttles."""
    client_ip = get_client_ip(request)
    clean_email = data.email.strip().lower()
    email_key = hashlib.sha256(clean_email.encode("utf-8")).hexdigest()

    # IP-level rate limiting
    if settings.AUTH_RATE_LIMIT_ENABLED and client_ip != "testclient":
        allowed, retry_after = auth_rate_limiter.is_allowed(
            f"login_ip:{client_ip}",
            max_attempts=settings.AUTH_RATE_LIMIT_LOGIN_PER_MINUTE,
            window_seconds=60,
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many login attempts. Please wait {retry_after} seconds before trying again.",
                headers={"Retry-After": str(retry_after)},
            )

        pair_allowed, pair_retry_after = auth_rate_limiter.is_allowed(
            f"login_pair:{client_ip}:{email_key}",
            max_attempts=settings.AUTH_MAX_FAILED_LOGIN_ATTEMPTS,
            window_seconds=60,
        )
        if not pair_allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Please wait before trying again.",
                headers={"Retry-After": str(pair_retry_after)},
            )

    try:
        user = db.query(User).filter(User.email == clean_email).first()

        # Timing-safe password verification
        if not user:
            # Constant-time dummy verification to defeat user enumeration via timing
            pwd_context.verify(data.password, DUMMY_PASSWORD_HASH)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_LOGIN_MESSAGE)

        if not pwd_context.verify(data.password, user.hashed_password):
            logger.info("Failed login attempt")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_LOGIN_MESSAGE)

        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_LOGIN_MESSAGE)
        if getattr(user, "email_verified", None) is False:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=INVALID_LOGIN_MESSAGE)

        # Login successful: reset failed attempts and lockout
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()
        auth_rate_limiter.reset(f"login_pair:{client_ip}:{email_key}")

        is_complete = _is_onboarding_complete(user, db)
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        token = create_access_token(user.id)
        logger.info("User logged in successfully: %s (id=%s)", user.email, user.id)

        return TokenResponse(
            access_token=token,
            user_id=user.id,
            name=user.name,
            email=user.email,
            is_admin=user.is_admin,
            onboarding_complete=is_complete,
            avatar_url=getattr(profile, "avatar_url", None) if profile else None,
            expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Login failure: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed. Please check your credentials and try again."
        )


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return authenticated user profile, security metadata, and onboarding status."""
    is_complete = _is_onboarding_complete(current_user, db)
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    return {
        "user_id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "email_verified": getattr(current_user, "email_verified", None) is not False,
        "is_admin": current_user.is_admin,
        "avatar_url": getattr(profile, "avatar_url", None) if profile else None,
        "onboarding_complete": is_complete,
        "last_login_at": current_user.last_login_at.isoformat() if getattr(current_user, "last_login_at", None) else None,
    }
