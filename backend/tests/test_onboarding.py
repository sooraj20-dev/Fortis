"""
Test suite for the onboarding flow.

Covers:
  1. Registration returns onboarding_complete=false
  2. POST /api/onboarding/complete persists all fields
  3. Repeated submissions do not create duplicate records
  4. GET /api/profile returns the authenticated user's data
  5. User A cannot read/modify User B's profile
  6. Login after onboarding returns onboarding_complete=true
  7. PATCH /api/profile persists partial updates
  8. Failed onboarding payload does not mark onboarding complete
"""
import pytest
import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def make_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@fortis-test.ai"


def register_user(email: str, password: str = "Test@1234", name: str = "Test User"):
    res = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
    assert res.status_code == 201, f"Registration failed: {res.text}"
    return res.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


MINIMAL_ONBOARDING = {
    "age": 25,
    "height_cm": 170.0,
    "weight_kg": 70.0,
    "gender": "male",
    "regional_preference": "Kerala",
    "primary_goal": "GENERAL_FITNESS",
    "experience_level": "BEGINNER",
    "workout_location": "home",
    "equipment_list": ["bodyweight"],
    "days_per_week": 3,
    "workout_duration_min": 45,
    "preferred_time": "morning",
    "diet_type": "non_vegetarian",
    "allergies": [],
    "preferred_cuisine": "Kerala/South Indian",
    "daily_budget_inr": 150.0,
    "meals_per_day": 3,
    "cooking_access": "home",
    "cooking_available": True,
    "activity_level": "MODERATELY_ACTIVE",
    "typical_sleep_hours": 7.0,
    "typical_sleep_quality": 7,
    "typical_energy_level": 7,
    "typical_soreness_level": 3,
    "typical_stress_level": 5,
}

FULL_ONBOARDING = {
    **MINIMAL_ONBOARDING,
    "injury_notes": "Mild right knee discomfort",
    "exercises_to_avoid": ["deep squats", "running"],
    "preferred_exercise_types": ["strength", "mobility"],
    "strength_benchmarks": {"squat_kg": 60, "bench_kg": 50},
}


# ─────────────────────────────────────────────────────────────────
# 1. Registration returns onboarding_complete = false
# ─────────────────────────────────────────────────────────────────

def test_register_returns_onboarding_false():
    data = register_user(make_email())
    assert data["onboarding_complete"] is False


# ─────────────────────────────────────────────────────────────────
# 2. POST /api/onboarding/complete persists all fields
# ─────────────────────────────────────────────────────────────────

def test_complete_onboarding_persists_all_fields():
    token = register_user(make_email())["access_token"]
    headers = auth_headers(token)

    res = client.post("/api/onboarding/complete", json=FULL_ONBOARDING, headers=headers)
    assert res.status_code == 200, f"Onboarding failed: {res.text}"
    body = res.json()
    assert body["success"] is True
    assert body["onboarding_complete"] is True

    # Verify persistence via GET /api/profile
    profile_res = client.get("/api/profile", headers=headers)
    assert profile_res.status_code == 200
    pf = profile_res.json()

    assert pf["onboarding_complete"] is True
    assert pf["profile"]["age"] == 25
    assert pf["profile"]["height_cm"] == 170.0
    assert pf["profile"]["weight_kg"] == 70.0
    assert pf["profile"]["workout_location"] == "home"
    assert pf["profile"]["injury_notes"] == "Mild right knee discomfort"
    assert "deep squats" in pf["profile"]["exercises_to_avoid"]
    assert "strength" in pf["profile"]["preferred_exercise_types"]
    assert pf["goal"]["primary_goal"] == "GENERAL_FITNESS"
    assert pf["goal"]["experience_level"] == "BEGINNER"
    assert "bodyweight" in pf["equipment"]["equipment_list"]
    assert pf["schedule"]["days_per_week"] == 3
    assert pf["schedule"]["workout_duration_min"] == 45
    assert pf["nutrition_pref"]["diet_type"] == "non_vegetarian"
    assert pf["nutrition_pref"]["preferred_cuisine"] == "Kerala/South Indian"
    assert pf["nutrition_pref"]["meals_per_day"] == 3
    assert pf["nutrition_pref"]["cooking_access"] == "home"
    assert pf["nutrition_pref"]["daily_budget_inr"] == 150.0


# ─────────────────────────────────────────────────────────────────
# 3. Repeated submission does not create duplicate records
# ─────────────────────────────────────────────────────────────────

def test_repeat_onboarding_no_duplicates():
    token = register_user(make_email())["access_token"]
    headers = auth_headers(token)

    client.post("/api/onboarding/complete", json=MINIMAL_ONBOARDING, headers=headers)

    updated = {**MINIMAL_ONBOARDING, "age": 26, "weight_kg": 72.0}
    res = client.post("/api/onboarding/complete", json=updated, headers=headers)
    assert res.status_code == 200

    # Profile should be updated, not a second record
    pf = client.get("/api/profile", headers=headers).json()
    assert pf["profile"]["age"] == 26
    assert pf["profile"]["weight_kg"] == 72.0


# ─────────────────────────────────────────────────────────────────
# 4. GET /api/profile returns only the authenticated user's data
# ─────────────────────────────────────────────────────────────────

def test_get_profile_returns_own_data():
    token = register_user(make_email())["access_token"]
    headers = auth_headers(token)

    client.post("/api/onboarding/complete", json=MINIMAL_ONBOARDING, headers=headers)

    res = client.get("/api/profile", headers=headers)
    assert res.status_code == 200
    pf = res.json()
    assert pf["email"] is not None
    assert pf["onboarding_complete"] is True


def test_get_profile_unauthenticated_rejected():
    res = client.get("/api/profile")
    assert res.status_code in (401, 403)


# ─────────────────────────────────────────────────────────────────
# 5. User A cannot read User B's profile
# ─────────────────────────────────────────────────────────────────

def test_user_isolation():
    token_a = register_user(make_email())["access_token"]
    token_b = register_user(make_email())["access_token"]

    headers_a = auth_headers(token_a)
    headers_b = auth_headers(token_b)

    client.post("/api/onboarding/complete", json={**MINIMAL_ONBOARDING, "age": 30}, headers=headers_a)
    client.post("/api/onboarding/complete", json={**MINIMAL_ONBOARDING, "age": 22}, headers=headers_b)

    pf_a = client.get("/api/profile", headers=headers_a).json()
    pf_b = client.get("/api/profile", headers=headers_b).json()

    # Each user sees their own age, not the other's
    assert pf_a["profile"]["age"] == 30
    assert pf_b["profile"]["age"] == 22
    # Emails are distinct
    assert pf_a["email"] != pf_b["email"]


# ─────────────────────────────────────────────────────────────────
# 6. Login after onboarding returns onboarding_complete=true
# ─────────────────────────────────────────────────────────────────

def test_login_after_onboarding_returns_complete_true():
    email = make_email()
    password = "Test@1234"
    register_user(email, password)

    # Get token from registration
    login_before = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_before.status_code == 200
    assert login_before.json()["onboarding_complete"] is False

    token = login_before.json()["access_token"]
    client.post("/api/onboarding/complete", json=MINIMAL_ONBOARDING, headers=auth_headers(token))

    login_after = client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_after.status_code == 200
    assert login_after.json()["onboarding_complete"] is True


# ─────────────────────────────────────────────────────────────────
# 7. PATCH /api/profile persists partial updates
# ─────────────────────────────────────────────────────────────────

def test_patch_profile_partial_update():
    token = register_user(make_email())["access_token"]
    headers = auth_headers(token)

    client.post("/api/onboarding/complete", json=MINIMAL_ONBOARDING, headers=headers)

    patch_res = client.patch(
        "/api/profile",
        json={"weight_kg": 68.5, "days_per_week": 5, "diet_type": "vegetarian"},
        headers=headers,
    )
    assert patch_res.status_code == 200
    pf = patch_res.json()
    assert pf["profile"]["weight_kg"] == 68.5
    assert pf["schedule"]["days_per_week"] == 5
    assert pf["nutrition_pref"]["diet_type"] == "vegetarian"
    # Unchanged field should remain
    assert pf["profile"]["age"] == 25


def test_patch_profile_without_onboarding_fails():
    token = register_user(make_email())["access_token"]
    headers = auth_headers(token)

    res = client.patch("/api/profile", json={"weight_kg": 65.0}, headers=headers)
    assert res.status_code == 404


# ─────────────────────────────────────────────────────────────────
# 8. Invalid onboarding payload does not mark onboarding complete
# ─────────────────────────────────────────────────────────────────

def test_invalid_onboarding_does_not_complete():
    token = register_user(make_email())["access_token"]
    headers = auth_headers(token)

    # age = 5 is invalid (< 12)
    bad_payload = {**MINIMAL_ONBOARDING, "age": 5}
    res = client.post("/api/onboarding/complete", json=bad_payload, headers=headers)
    assert res.status_code == 422  # Validation error

    # Profile should still not be onboarded
    me = client.get("/api/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["onboarding_complete"] is False
