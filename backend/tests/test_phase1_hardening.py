"""
Tests verifying Phase 1 Trust, Data Correctness & Privacy Hardening guarantees:
1. Missing data must never be presented as a real observation or measured score.
2. Database failures must never silently become legitimate empty results or zero counts.
3. Missing usage-tracking data must never be interpreted as unused Gemini quota.
4. Application-configured warning budgets must be distinguished from official Google quota limits.
5. Every outbound attempt is tracked safely without prompt/response/image leakage.
"""
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
import pytest

from app.database import MongoQuery, DatabaseUnavailableError
from app.services.usage_tracker import UsageTracker
from app.config import settings


@pytest.mark.asyncio
async def test_unavailable_summary_does_not_claim_zero_usage_or_full_quota():
    """Rule 3: Missing usage-tracking data must never be interpreted as unused Gemini quota."""
    tracker = UsageTracker()
    now = datetime.utcnow()
    period_start = now - timedelta(days=7)

    summary = tracker._unavailable_summary(period_start, now)

    assert summary["tracking_status"] == "unavailable"
    assert summary["warning_state"] == "tracking_unavailable"
    # Never return 0 when tracking is unavailable
    assert summary["total_attempts"] is None
    assert summary["successful"] is None
    assert summary["failed"] is None
    assert summary["rate_limited"] is None

    qc = summary["quota_comparison"]
    assert qc["tracking_unavailable"] is True
    assert qc["daily_requests_used"] is None
    assert qc["daily_requests_remaining"] is None
    assert qc["daily_tokens_used"] is None
    assert qc["daily_tokens_remaining"] is None
    assert qc["limit_type"] == "tracking_unavailable"


@pytest.mark.asyncio
async def test_unavailable_status_does_not_claim_zero_usage():
    """Rule 3 & 2: Status fallback returns None counts and tracking_available False."""
    tracker = UsageTracker()

    with patch.object(tracker, "_fetch_status", side_effect=Exception("Atlas connection failed")):
        status = await tracker.get_status(user_id=123)

        assert status["tracking_available"] is False
        assert status["tracking_status"] == "unavailable"
        assert status["warning_state"] == "tracking_unavailable"
        assert status["today_total"] is None
        assert status["today_successful"] is None
        assert status["today_failed"] is None
        assert status["today_rate_limited"] is None
        assert status["quota_comparison"]["tracking_unavailable"] is True
        assert status["quota_comparison"]["daily_requests_remaining"] is None


def test_quota_distinguishes_warning_budget_from_google_quota(monkeypatch):
    """Rule 4: Application-configured warning budgets must be distinguished from official Google quota limits."""
    tracker = UsageTracker()

    # Case A: Custom warning budget configured
    monkeypatch.setattr(settings, "AI_DAILY_REQUEST_BUDGET", 200)
    qc_budget = tracker._build_quota_comparison(today_requests=50, today_tokens=1000)

    assert qc_budget["is_warning_budget"] is True
    assert qc_budget["configured_warning_budget"] == 200
    assert qc_budget["daily_request_limit"] == 200
    assert qc_budget["limit_type"] == "custom_budget"
    assert "Warning" in qc_budget["limit_label"]
    assert qc_budget["official_daily_request_limit"] is None
    assert qc_budget["official_quota_available"] is False

    # Case B: No custom budget configured -> Official Gemini quota is marked unavailable, not fabricated
    monkeypatch.setattr(settings, "AI_DAILY_REQUEST_BUDGET", 0)
    qc_official = tracker._build_quota_comparison(today_requests=50, today_tokens=1000)

    assert qc_official["is_warning_budget"] is False
    assert qc_official["configured_warning_budget"] is None
    assert qc_official["daily_request_limit"] is None
    assert qc_official["limit_type"] == "official_quota_unavailable"
    assert qc_official["official_quota_available"] is False
    assert qc_official["resets_at"] is None
    assert qc_official["resets_in"] is None


def test_mongo_query_count_raises_on_db_failure():
    """Rule 2: Database failures must never silently become legitimate empty results or zero counts."""
    mock_session = MagicMock()
    mock_db = MagicMock()
    mock_session.get_db.return_value = mock_db

    mock_db["workouts"].count_documents.side_effect = Exception("Connection lost to cluster")

    query = MongoQuery(MagicMock(__tablename__="workouts"), mock_session)

    with pytest.raises(DatabaseUnavailableError) as exc_info:
        query.count()

    assert "count_documents failed" in str(exc_info.value)


def test_mongo_query_first_and_all_raise_on_db_failure():
    """Rule 2: MongoQuery.first() and all() must raise DatabaseUnavailableError instead of returning None or []."""
    mock_session = MagicMock()
    mock_db = MagicMock()
    mock_session.get_db.return_value = mock_db

    mock_db["workouts"].find_one.side_effect = Exception("Atlas connection timed out")
    mock_db["workouts"].find.side_effect = Exception("Network partition")

    query = MongoQuery(MagicMock(__tablename__="workouts"), mock_session)

    with pytest.raises(DatabaseUnavailableError) as exc_first:
        query.first()
    assert "find_one failed" in str(exc_first.value)

    with pytest.raises(DatabaseUnavailableError) as exc_all:
        query.all()
    assert "find failed" in str(exc_all.value)


def test_get_next_id_raises_on_db_failure():
    """Rule 2: Failed sequence generation must raise DatabaseUnavailableError, not synthesize timestamp IDs."""
    from app.database import _get_next_id

    mock_db = MagicMock()
    mock_db["_counters"].find_one_and_update.side_effect = Exception("Write concern timeout")

    with pytest.raises(DatabaseUnavailableError) as exc_info:
        _get_next_id(mock_db, "workouts")

    assert "Failed to generate sequence ID" in str(exc_info.value)


def test_database_unavailable_exception_handler_returns_503():
    """Rule 2 & Security: Global handler returns 503 without leaking MongoDB details."""
    from starlette.testclient import TestClient
    from app.main import app
    from app.database import get_db
    from app.deps import get_current_user, require_onboarded_user

    def override_get_db():
        raise DatabaseUnavailableError("Sensitive connection URI mongodb://secret@atlas:27017")

    def override_get_current_user():
        return MagicMock(id=1, is_onboarded=True)

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[require_onboarded_user] = override_get_current_user

    client = TestClient(app, raise_server_exceptions=False)
    try:
        response = client.get("/api/workouts/today")
        assert response.status_code == 503
        data = response.json()
        assert data["detail"] == "We couldn't load your data right now. Please try again."
        # Ensure sensitive info is not leaked in body
        assert "mongodb://" not in response.text
        assert "secret" not in response.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_usage_record_never_logs_prompt_response_images_or_secrets():
    """Rule 7: Never log API keys, authentication tokens, uploaded image bytes, full private prompts, or complete AI responses."""
    tracker = UsageTracker()
    inserted_docs = []

    fake_collection = MagicMock()
    fake_collection.insert_one = lambda doc: inserted_docs.append(doc)

    with patch.object(tracker, "_get_collection", return_value=fake_collection):
        await tracker.record_attempt(
            user_id=99,
            feature="fortis_vision",
            model="gemini-3.5-flash-lite",
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow() + timedelta(milliseconds=150),
            status="success",
        )

        assert len(inserted_docs) == 1
        doc = inserted_docs[0]

        # Verify only safe metadata fields are present
        safe_keys = {
            "request_id", "user_id", "feature", "model", "started_at", "completed_at",
            "duration_ms", "status", "http_status_code", "input_tokens", "output_tokens",
            "total_tokens", "cached_tokens", "error_category", "retry_after_seconds",
            "rate_limit_kind", "provider_request_id"
        }
        assert set(doc.keys()).issubset(safe_keys)

        # Explicitly verify sensitive keys are never saved
        for forbidden in ("prompt", "contents", "response", "image", "image_bytes", "api_key", "secret", "token"):
            assert forbidden not in doc


def test_get_latest_scan_does_not_fabricate_posture_or_pulse():
    """Rule 1: Stop displaying fabricated fitness measurements when data is missing."""
    from app.routers.scan import get_latest_scan

    mock_db = MagicMock()
    mock_user = MagicMock(id=42)

    # Mock completed scan without posture score
    mock_scan = MagicMock(
        id=1,
        user_id=42,
        scan_date=datetime.utcnow(),
        status="COMPLETED",
        confidence=80,
        model_version="v2",
        limitations=None,
    )
    mock_metrics = MagicMock(
        movement_quality=82.0,
        mobility=75.0,
        stability=78.0,
        movement_consistency=80.0,
        symmetry_indicator=85.0,
        squat_movement_score=80.0,
        functional_metrics={},
        joint_angles={},
    )
    mock_scan.metrics = mock_metrics

    # Mock query returns scan, no observations, no decision, no fitness state
    def mock_query(model):
        m_query = MagicMock()
        model_name = getattr(model, "__name__", str(model))
        if model_name == "BodyScan":
            m_query.filter.return_value.order_by.return_value.first.return_value = mock_scan
        elif model_name == "ScanObservation":
            m_query.filter.return_value.all.return_value = []
        elif model_name == "FortisDecision":
            m_query.filter.return_value.order_by.return_value.first.return_value = None
        elif model_name == "FitnessState":
            m_query.filter.return_value.order_by.return_value.first.return_value = None
        return m_query

    mock_db.query = mock_query

    res = get_latest_scan(current_user=mock_user, db=mock_db)

    assert res["has_scan"] is True
    # Missing posture score must be None, NOT 70.0
    assert res["posture_score"] is None
    # Missing pulse must be None, NOT 74.0
    assert res["fortis_pulse_updated"] is None
    assert res["data_available"] is True


def test_blueprint_does_not_fabricate_fitness_scores_when_missing():
    """Rule 1: Blueprint current_state must return None rather than 75.0, 65.0, 70.0, 68.0, 74.0."""
    from app.routers.scan import generate_fortis_blueprint, BlueprintRequest

    mock_db = MagicMock()
    mock_user = MagicMock(id=42)

    # Empty scan and state with no metrics
    mock_state = MagicMock(
        movement_quality=None,
        mobility_score=None,
        stability=None,
        recovery_score=None,
        fortis_pulse=None,
    )

    def mock_query(model):
        m_query = MagicMock()
        model_name = getattr(model, "__name__", str(model))
        if model_name == "BodyScan":
            m_query.filter.return_value.first.return_value = None
            m_query.filter.return_value.order_by.return_value.first.return_value = None
        elif model_name == "FitnessState":
            m_query.filter.return_value.order_by.return_value.first.return_value = mock_state
        elif model_name in ("Goal", "NutritionPreference", "Schedule"):
            m_query.filter.return_value.first.return_value = None
        return m_query

    mock_db.query = mock_query

    res = generate_fortis_blueprint(body=BlueprintRequest(), current_user=mock_user, db=mock_db)

    cs = res["current_state"]
    # Check no fabricated fallbacks
    assert cs["movement_quality"] is None
    assert cs["mobility"] is None
    assert cs["stability"] is None
    assert cs["recovery_score"] is None
    assert cs["fortis_pulse"] is None

    # Check that training focus gracefully shows Pending instead of fake recommendations
    areas = [f["area"] for f in res["training_focus"]]
    assert "Movement Assessment Pending" in areas
    assert "Mobility Assessment Pending" in areas
    assert "Stability Assessment Pending" in areas
