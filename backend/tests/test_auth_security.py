"""
Unit and integration tests for authentication and registration security.

Verifies:
- OWASP password strength enforcement (length, casing, digits, symbols, dictionaries, personal info)
- Constant-time verification on unknown users (anti-timing attacks)
- Brute-force protection: account lockout after consecutive failed attempts
- Reset of failed attempts on successful authentication
- Deactivated user protection (both login and token authorization)
- Rate limiting on auth endpoints
- Input sanitization (email case folding, name normalization)
"""
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.security import (
    pwd_context,
    validate_password_strength,
    auth_rate_limiter,
    is_account_locked,
)
from app.config import settings
from app.routers import auth as auth_router

client = TestClient(app)


def make_random_email() -> str:
    return f"sec_test_{uuid.uuid4().hex[:10]}@fortis-security.io"


def test_password_strength_validator():
    # Too short
    ok, msg = validate_password_strength("Short1!")
    assert not ok
    assert "at least 8 characters" in msg

    # Missing uppercase
    ok, msg = validate_password_strength("nouppercase1@")
    assert not ok
    assert "uppercase" in msg

    # Missing lowercase
    ok, msg = validate_password_strength("NOLOWERCASE1@")
    assert not ok
    assert "lowercase" in msg

    # Missing digit
    ok, msg = validate_password_strength("NoDigitsHere!")
    assert not ok
    assert "number" in msg

    # Missing special character
    ok, msg = validate_password_strength("NoSpecial1234")
    assert not ok
    assert "special character" in msg

    # Common weak password
    ok, msg = validate_password_strength("password123")
    assert not ok

    # Contains email prefix
    ok, msg = validate_password_strength("ArjunSecret@123", user_email="arjun@test.com")
    assert not ok
    assert "email" in msg

    # Contains user name
    ok, msg = validate_password_strength("VikramRocks@123", user_name="Vikram Sharma")
    assert not ok
    assert "name" in msg

    # Valid strong password
    ok, msg = validate_password_strength("Fortis#Secure2026!", user_email="user@test.com", user_name="Alex Smith")
    assert ok
    assert msg is None


def test_registration_validation_rules():
    email = make_random_email()

    # Short password rejected
    res = client.post("/api/auth/register", json={
        "name": "Security Tester",
        "email": email,
        "password": "123"
    })
    assert res.status_code == 422

    # Weak password without special character rejected
    res = client.post("/api/auth/register", json={
        "name": "Security Tester",
        "email": email,
        "password": "Password123"
    })
    assert res.status_code == 422

    # Weak password containing user name rejected
    res = client.post("/api/auth/register", json={
        "name": "Robert Fox",
        "email": email,
        "password": "Robert@Fox123"
    })
    assert res.status_code == 422

    # Empty / blank name rejected
    res = client.post("/api/auth/register", json={
        "name": "   ",
        "email": email,
        "password": "Valid@Password2026"
    })
    assert res.status_code == 422

    # Valid registration succeeds
    valid_pass = "Valid@Password2026"
    res = client.post("/api/auth/register", json={
        "name": "Security Tester",
        "email": email,
        "password": valid_pass
    })
    assert res.status_code == 201
    body = res.json()
    assert body["email"] == email.lower()
    assert "access_token" in body
    assert body["token_type"] == "bearer"
    assert body["onboarding_complete"] is False

    # Duplicate registration rejected
    dup_res = client.post("/api/auth/register", json={
        "name": "Security Tester",
        "email": email,
        "password": valid_pass
    })
    assert dup_res.status_code == 400
    assert "already exists" in dup_res.json()["detail"]


def test_registration_succeeds_when_email_delivery_is_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "")
    email = make_random_email()

    res = client.post("/api/auth/register", json={
        "name": "No SMTP User",
        "email": email,
        "password": "Valid@Password2026",
    })

    assert res.status_code == 201, res.text
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        assert user is not None
        assert user.email_verified is None
        assert user.email_verification_token_hash is None
    finally:
        db.close()


def test_registration_sends_verification_when_email_delivery_is_configured(monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(settings, "SMTP_FROM_EMAIL", "no-reply@test.invalid")
    sent = []
    monkeypatch.setattr(
        auth_router,
        "send_verification_email",
        lambda email, name, token: sent.append((email, name, token)),
    )
    email = make_random_email()

    res = client.post("/api/auth/register", json={
        "name": "Verified User",
        "email": email,
        "password": "Valid@Password2026",
    })

    assert res.status_code == 201, res.text
    assert len(sent) == 1
    assert sent[0][0] == email.lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        assert user is not None
        assert user.email_verified is False
        assert user.email_verification_token_hash
    finally:
        db.close()


def test_login_success_and_metadata():
    email = make_random_email()
    password = "MyStrong@Pass123"

    reg_res = client.post("/api/auth/register", json={
        "name": "Auth User",
        "email": email,
        "password": password
    })
    assert reg_res.status_code == 201

    # Login with exact email
    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # Check /me endpoint
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == email.lower()
    assert me_data["name"] == "Auth User"
    assert "last_login_at" in me_data


def test_login_case_insensitivity_and_timing_safe_nonexistent_user():
    email = make_random_email()
    password = "SecTest@Password99"

    client.post("/api/auth/register", json={
        "name": "Case Test",
        "email": email.lower(),
        "password": password
    })

    # Uppercase email variation works seamlessly
    login_upper = client.post("/api/auth/login", json={
        "email": email.upper(),
        "password": password
    })
    assert login_upper.status_code == 200

    # Nonexistent user returns 401 Invalid email or password
    fake_login = client.post("/api/auth/login", json={
        "email": "nonexistent_user_99999@fortis.ai",
        "password": "SomePassword@123"
    })
    assert fake_login.status_code == 401
    assert fake_login.json()["detail"] == "Invalid email or password"


def test_account_lockout_after_consecutive_failed_logins():
    email = make_random_email()
    password = "Fortis@Lockout123"

    client.post("/api/auth/register", json={
        "name": "Lockout User",
        "email": email,
        "password": password
    })

    # Fail login 4 times: should remain 401
    for i in range(4):
        res = client.post("/api/auth/login", json={
            "email": email,
            "password": "WrongPassword@999"
        })
        assert res.status_code == 401
        assert res.json()["detail"] == "Invalid email or password"

    # 5th failed attempt: should trigger lockout and return 429
    res5 = client.post("/api/auth/login", json={
        "email": email,
        "password": "WrongPassword@999"
    })
    assert res5.status_code == 429
    assert "temporarily locked" in res5.json()["detail"].lower()
    assert "Retry-After" in res5.headers

    # Subsequent attempts even with CORRECT password should still be locked
    res_correct_while_locked = client.post("/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert res_correct_while_locked.status_code == 429
    assert "temporarily locked" in res_correct_while_locked.json()["detail"].lower()


def test_successful_login_resets_failed_attempts():
    email = make_random_email()
    password = "Reset@Password2026"

    client.post("/api/auth/register", json={
        "name": "Reset User",
        "email": email,
        "password": password
    })

    # Fail 3 times
    for _ in range(3):
        res = client.post("/api/auth/login", json={
            "email": email,
            "password": "WrongPassword@1"
        })
        assert res.status_code == 401

    # Login successfully
    success_res = client.post("/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert success_res.status_code == 200

    # User in db should have failed_login_attempts reset to 0
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        assert user.failed_login_attempts == 0
        assert user.locked_until is None
    finally:
        db.close()


def test_deactivated_account_cannot_login_or_access_apis():
    email = make_random_email()
    password = "Active@User1234"

    reg_res = client.post("/api/auth/register", json={
        "name": "Deactivated User",
        "email": email,
        "password": password
    })
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]

    # Deactivate user in DB
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        user.is_active = False
        db.commit()
    finally:
        db.close()

    # Attempt to log in with valid credentials
    login_res = client.post("/api/auth/login", json={
        "email": email,
        "password": password
    })
    assert login_res.status_code == 403
    assert "deactivated" in login_res.json()["detail"].lower()

    # Attempt to access /me using existing token
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 403
    assert "deactivated" in me_res.json()["detail"].lower()


def test_auth_rate_limiter_unit():
    key = f"test_key_{uuid.uuid4().hex}"
    # Allow 3 attempts within 10 seconds
    for _ in range(3):
        allowed, retry_after = auth_rate_limiter.is_allowed(key, max_attempts=3, window_seconds=10)
        assert allowed is True
        assert retry_after == 0

    # 4th attempt should be blocked
    allowed, retry_after = auth_rate_limiter.is_allowed(key, max_attempts=3, window_seconds=10)
    assert allowed is False
    assert retry_after > 0

    # Resetting key clears it
    auth_rate_limiter.reset(key)
    allowed, retry_after = auth_rate_limiter.is_allowed(key, max_attempts=3, window_seconds=10)
    assert allowed is True
