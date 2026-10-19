"""Auth router — register, login"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import logging

# Ensure passlib works with bcrypt >= 4.1.0 where __about__ was removed
import bcrypt
if not hasattr(bcrypt, "__about__"):
    class _BcryptAbout:
        __version__ = getattr(bcrypt, "__version__", "4.0.1")
    bcrypt.__about__ = _BcryptAbout()

from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.profile import Profile, Goal, Equipment, Schedule, NutritionPreference
from app.schemas.auth import UserCreate, LoginRequest, TokenResponse
from app.config import settings
from passlib.context import CryptContext
from jose import jwt

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM
    )


def _is_onboarding_complete(user: User, db: Session) -> bool:
    if getattr(user, "onboarding_completed", False):
        return True
    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    goal = db.query(Goal).filter(Goal.user_id == user.id).first()
    return profile is not None and goal is not None


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(data: UserCreate, db: Session = Depends(get_db)):
    """Create a new user account and return a JWT token."""
    try:
        existing_user = db.query(User).filter(User.email == data.email.strip().lower()).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="An account with this email already exists")

        user = User(
            email=data.email.strip().lower(),
            name=data.name.strip(),
            hashed_password=pwd_context.hash(data.password),
            is_active=True,
            is_admin=False,
            onboarding_completed=False,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token(user.id)
        return TokenResponse(
            access_token=token,
            user_id=user.id,
            name=user.name,
            email=user.email,
            is_admin=user.is_admin,
            onboarding_complete=False,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Registration failure: %s", e)
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with email + password and return a JWT token."""
    try:
        user = db.query(User).filter(User.email == data.email.strip().lower()).first()
        if not user or not pwd_context.verify(data.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account is deactivated")

        is_complete = _is_onboarding_complete(user, db)
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        token = create_access_token(user.id)
        return TokenResponse(
            access_token=token,
            user_id=user.id,
            name=user.name,
            email=user.email,
            is_admin=user.is_admin,
            onboarding_complete=is_complete,
            avatar_url=getattr(profile, "avatar_url", None) if profile else None,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Login failure: %s", e)
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return authenticated user profile and onboarding status."""
    is_complete = _is_onboarding_complete(current_user, db)
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    return {
        "user_id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "avatar_url": getattr(profile, "avatar_url", None) if profile else None,
        "onboarding_complete": is_complete,
    }
