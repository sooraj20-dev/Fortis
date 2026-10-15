from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from jose import JWTError, jwt
from app.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


def require_onboarded_user(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Block personalized APIs until onboarding is saved; preserve legacy completed profiles."""
    if current_user.onboarding_completed:
        return current_user
    from app.models.profile import Profile, Goal
    has_profile = db.query(Profile).filter(Profile.user_id == current_user.id).first() is not None
    has_goal = db.query(Goal).filter(Goal.user_id == current_user.id).first() is not None
    if has_profile and has_goal:
        return current_user
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Complete onboarding before using personalized features.")
