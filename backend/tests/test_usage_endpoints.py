"""
Integration tests for the AI Usage API endpoints.
Verifies GET /api/usage/status, /summary, /history, and authorization enforcement.
"""
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.deps import get_current_user
from app.models.user import User

client = TestClient(app)

mock_user = User(
    id=42,
    email="usage_test@fortis.ai",
    name="Usage Tester",
    is_active=True,
    onboarding_completed=True,
)


def test_usage_endpoints_require_auth():
    # Without bearer token, should return 401
    res_status = client.get("/api/usage/status")
    assert res_status.status_code == 401

    res_summary = client.get("/api/usage/summary")
    assert res_summary.status_code == 401

    res_history = client.get("/api/usage/history")
    assert res_history.status_code == 401


def test_usage_summary_validates_period():
    app.dependency_overrides[get_current_user] = lambda: mock_user
    try:
        res = client.get("/api/usage/summary?period=invalid_period")
        assert res.status_code == 422
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_usage_status_authenticated():
    app.dependency_overrides[get_current_user] = lambda: mock_user
    fake_status = {
        "today_total": 5,
        "today_successful": 4,
        "today_failed": 1,
        "today_rate_limited": 0,
        "feature_today": {
            "ai_coach": {"total": 3, "successful": 3, "failed": 0, "rate_limited": 0, "input_tokens": 900, "output_tokens": 400},
            "fortis_vision": {"total": 2, "successful": 1, "failed": 1, "rate_limited": 0, "input_tokens": 1200, "output_tokens": 300},
        },
        "input_tokens_today": 2100,
        "output_tokens_today": 700,
        "warning_state": "normal",
        "latest_rate_limit_at": None,
        "retry_after_seconds": None,
        "last_updated": "2026-10-20T08:00:00",
        "tracking_available": True,
        "tracking_status": "active",
    }

    try:
        with patch("app.services.usage_tracker.usage_tracker.get_status", new_callable=AsyncMock) as mock_get_status:
            mock_get_status.return_value = fake_status
            res = client.get("/api/usage/status")
            assert res.status_code == 200
            data = res.json()
            assert data["today_total"] == 5
            assert data["feature_today"]["ai_coach"]["total"] == 3
            assert data["feature_today"]["fortis_vision"]["total"] == 2
            assert data["tracking_available"] is True
            mock_get_status.assert_called_once_with(42)
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_usage_summary_authenticated():
    app.dependency_overrides[get_current_user] = lambda: mock_user
    fake_summary = {
        "period": "7d",
        "period_start": "2026-10-13T08:00:00",
        "period_end": "2026-10-20T08:00:00",
        "total_attempts": 15,
        "successful": 14,
        "failed": 1,
        "rate_limited": 0,
        "input_tokens_total": 10000,
        "output_tokens_total": 4500,
        "total_tokens": 14500,
        "tokens_partial": False,
        "feature_breakdown": {
            "ai_coach": {"total": 10, "successful": 10, "failed": 0, "rate_limited": 0, "input_tokens": 6000, "output_tokens": 3000, "pct_of_total": 66.7},
            "fortis_vision": {"total": 5, "successful": 4, "failed": 1, "rate_limited": 0, "input_tokens": 4000, "output_tokens": 1500, "pct_of_total": 33.3},
        },
        "daily_stats": [
            {"date": "2026-10-19", "total": 7, "successful": 7, "failed": 0, "rate_limited": 0, "input_tokens": 4500, "output_tokens": 2000},
            {"date": "2026-10-20", "total": 8, "successful": 7, "failed": 1, "rate_limited": 0, "input_tokens": 5500, "output_tokens": 2500},
        ],
        "tracking_status": "active",
        "warning_state": "normal",
        "warning_states": "normal",
        "warning_budget": {"daily_request_budget": None, "warning_percent": 80.0},
        "last_updated": "2026-10-20T08:00:00",
    }

    try:
        with patch("app.services.usage_tracker.usage_tracker.get_summary", new_callable=AsyncMock) as mock_get_summary:
            mock_get_summary.return_value = fake_summary
            res = client.get("/api/usage/summary?period=7d")
            assert res.status_code == 200
            data = res.json()
            assert data["total_attempts"] == 15
            assert data["feature_breakdown"]["ai_coach"]["total"] == 10
            assert len(data["daily_stats"]) == 2
            mock_get_summary.assert_called_once_with(42, period="7d")
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_usage_history_authenticated():
    app.dependency_overrides[get_current_user] = lambda: mock_user
    fake_history = {
        "items": [
            {
                "request_id": "test-uuid-1",
                "feature": "ai_coach",
                "model": "gemini-3.5-flash-lite",
                "status": "success",
                "input_tokens": 120,
                "output_tokens": 45,
                "duration_ms": 280,
                "started_at": "2026-10-20T08:00:00",
                "error_category": None,
            }
        ],
        "total": 1,
        "page": 1,
        "page_size": 20,
        "total_pages": 1,
        "tracking_status": "active",
    }

    try:
        with patch("app.services.usage_tracker.usage_tracker.get_history", new_callable=AsyncMock) as mock_get_history:
            mock_get_history.return_value = fake_history
            res = client.get("/api/usage/history?page=1&page_size=20&feature=ai_coach")
            assert res.status_code == 200
            data = res.json()
            assert data["total"] == 1
            assert len(data["items"]) == 1
            assert data["items"][0]["request_id"] == "test-uuid-1"
            assert "prompt" not in data["items"][0]
            mock_get_history.assert_called_once_with(
                user_id=42,
                feature="ai_coach",
                status=None,
                page=1,
                page_size=20,
                days=30,
            )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
