"""Auth router — register, login"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.profile import Profile, Goal, Equipment, Schedule, NutritionPreference
from app.schemas.auth import UserCreate, LoginRequest, TokenResponse
from app.config import settings
from passlib.context import CryptContext
from jose import jwt

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


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate with email + password and return a JWT token."""
    user = db.query(User).filter(User.email == data.email.strip().lower()).first()
    if not user or not pwd_context.verify(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    is_complete = _is_onboarding_complete(user, db)
    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user_id=user.id,
        name=user.name,
        email=user.email,
        is_admin=user.is_admin,
        onboarding_complete=is_complete,
    )


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Return authenticated user profile and onboarding status."""
    is_complete = _is_onboarding_complete(current_user, db)
    return {
        "user_id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "is_admin": current_user.is_admin,
        "onboarding_complete": is_complete,
    }
