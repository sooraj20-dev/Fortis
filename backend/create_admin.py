"""Interactively create or promote a FORTIS administrator account.

Run from backend/: python create_admin.py
"""
from getpass import getpass

from app.database import SessionLocal
from app.models.user import User
from app.security import pwd_context, validate_password_strength


def main():
    db = SessionLocal()
    try:
        name = input("Admin name: ").strip()
        email = input("Admin email: ").strip().lower()
        if len(name) < 2 or "@" not in email:
            raise SystemExit("Enter a valid name and email address.")
        user = db.query(User).filter(User.email == email).first()
        if user:
            print(f"An account for {email} already exists and will be promoted.")
        password = getpass("Admin password (input hidden): ")
        valid, reason = validate_password_strength(password, user_email=email, user_name=name)
        if not valid:
            raise SystemExit(reason)
        confirm = getpass("Confirm password: ")
        if password != confirm:
            raise SystemExit("Passwords do not match.")

        if user is None:
            user = User(email=email, name=name, is_active=True)
        user.name = name
        user.email = email
        user.hashed_password = pwd_context.hash(password)
        user.is_active = True
        user.is_admin = True
        user.onboarding_completed = True
        user.email_verified = True
        user.failed_login_attempts = 0
        user.locked_until = None
        db.add(user)
        db.commit()
        print(f"Admin login ready for {email}. Sign in at /admin/login.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
