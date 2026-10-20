"""
Tests for AI Usage Tracking & Analytics.
Verifies record persistence, token extraction, safe error classification,
MongoDB aggregations for summaries, and FastAPI usage endpoints.
"""
import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from app.services.usage_tracker import UsageTracker, _categorize_error, _extract_token_usage


def test_categorize_error():
    # 429 daily vs transient
    assert _categorize_error(Exception("daily quota exceeded for per_day"), 429) == "rate_limit_daily"
    assert _categorize_error(Exception("requests per minute exceeded"), 429) == "rate_limit_transient"
    assert _categorize_error(Exception("Too Many Requests"), 429) == "rate_limit_transient"

    # Other statuses
    assert _categorize_error(Exception("Unauthorized"), 401) == "auth_error"
    assert _categorize_error(Exception("Forbidden"), 403) == "auth_error"
    assert _categorize_error(Exception("Bad request"), 400) == "bad_request"
    assert _categorize_error(Exception("Service unavailable"), 503) == "service_unavailable"
    assert _categorize_error(TimeoutError(), 504) == "timeout"
    assert _categorize_error(None, None) is None


def test_extract_token_usage():
    # Full metadata
    meta = SimpleNamespace(
        prompt_token_count=120,
        candidates_token_count=45,
        total_token_count=165,
        cached_content_token_count=0,
    )
    extracted = _extract_token_usage(meta)
    assert extracted["input_tokens"] == 120
    assert extracted["output_tokens"] == 45
    assert extracted["total_tokens"] == 165
    assert extracted["cached_tokens"] == 0

    # None metadata
    none_meta = _extract_token_usage(None)
    assert none_meta["input_tokens"] is None
    assert none_meta["output_tokens"] is None
    assert none_meta["total_tokens"] is None
    assert none_meta["cached_tokens"] is None

    # Partial metadata with non-int values
    partial = SimpleNamespace(
        prompt_token_count="invalid",
        candidates_token_count=50,
    )
    res = _extract_token_usage(partial)
    assert res["input_tokens"] is None
    assert res["output_tokens"] == 50
    assert res["total_tokens"] is None


@pytest.mark.asyncio
async def test_record_attempt_inserts_document():
    tracker = UsageTracker()
    inserted_docs = []

    def fake_insert(doc):
        inserted_docs.append(doc)

    fake_collection = MagicMock()
    fake_collection.insert_one = fake_insert

    with patch.object(tracker, "_get_collection", return_value=fake_collection):
        meta = SimpleNamespace(
            prompt_token_count=100,
            candidates_token_count=50,
            total_token_count=150,
            cached_content_token_count=0,
        )
        started_at = datetime.utcnow()
        completed_at = started_at + timedelta(milliseconds=250)

        await tracker.record_attempt(
            user_id=1,
            feature="ai_coach",
            model="gemini-3.5-flash-lite",
            started_at=started_at,
            completed_at=completed_at,
            status="success",
            usage_metadata=meta,
        )

        assert len(inserted_docs) == 1
        doc = inserted_docs[0]
        assert doc["user_id"] == 1
        assert doc["feature"] == "ai_coach"
        assert doc["model"] == "gemini-3.5-flash-lite"
        assert doc["status"] == "success"
        assert doc["duration_ms"] >= 240
        assert doc["input_tokens"] == 100
        assert doc["output_tokens"] == 50
        assert doc["total_tokens"] == 150
        assert doc["error_category"] is None
        # Must not store prompt, response, or images
        assert "prompt" not in doc
        assert "response" not in doc
        assert "image" not in doc


@pytest.mark.asyncio
async def test_record_attempt_rate_limited():
    tracker = UsageTracker()
    inserted_docs = []

    fake_collection = MagicMock()
    fake_collection.insert_one = lambda doc: inserted_docs.append(doc)

    with patch.object(tracker, "_get_collection", return_value=fake_collection):
        started_at = datetime.utcnow()
        completed_at = started_at + timedelta(milliseconds=100)

        await tracker.record_attempt(
            user_id=2,
            feature="fortis_vision",
            model="gemini-3.5-flash-lite",
            started_at=started_at,
            completed_at=completed_at,
            status="rate_limited",
            http_status_code=429,
            exc=Exception("Resource exhausted: rate_limit_exceeded"),
            retry_after_seconds=30.0,
            rate_limit_kind="transient",
        )

        assert len(inserted_docs) == 1
        doc = inserted_docs[0]
        assert doc["status"] == "rate_limited"
        assert doc["http_status_code"] == 429
        assert doc["error_category"] == "rate_limit_transient"
        assert doc["retry_after_seconds"] == 30.0
        assert doc["input_tokens"] is None
        assert doc["output_tokens"] is None


@pytest.mark.asyncio
async def test_get_summary_aggregates():
    tracker = UsageTracker()

    fake_collection = MagicMock()
    # Mock totals aggregate
    totals_doc = {
        "total_attempts": 10,
        "successful": 8,
        "failed": 1,
        "rate_limited": 1,
        "input_tokens_total": 5000,
        "output_tokens_total": 2000,
        "total_tokens": 7000,
        "has_token_data": 8,
    }
    feature_docs = [
        {
            "_id": "ai_coach",
            "total": 6,
            "successful": 5,
            "failed": 1,
            "rate_limited": 0,
            "input_tokens": 3000,
            "output_tokens": 1200,
            "total_tokens": 4200,
            "has_token_data": 5,
        },
        {
            "_id": "fortis_vision",
            "total": 4,
            "successful": 3,
            "failed": 0,
            "rate_limited": 1,
            "input_tokens": 2000,
            "output_tokens": 800,
            "total_tokens": 2800,
            "has_token_data": 3,
        },
    ]
    daily_docs = [
        {"_id": {"year": 2026, "month": 10, "day": 19}, "total": 4, "successful": 3, "failed": 1, "rate_limited": 0, "input_tokens": 2000, "output_tokens": 800, "has_token_data": 3},
        {"_id": {"year": 2026, "month": 10, "day": 20}, "total": 6, "successful": 5, "failed": 0, "rate_limited": 1, "input_tokens": 3000, "output_tokens": 1200, "has_token_data": 5},
    ]

    def mock_aggregate(pipeline):
        # Identify pipeline by group id
        group_stage = next((s["$group"] for s in pipeline if "$group" in s), {})
        gid = group_stage.get("_id")
        if gid is None:
            return iter([totals_doc])
        elif gid == "$feature":
            return iter(feature_docs)
        else:
            return iter(daily_docs)

    fake_collection.aggregate = mock_aggregate
    fake_collection.count_documents = MagicMock(return_value=0)

    with patch.object(tracker, "_get_collection", return_value=fake_collection):
        summary = await tracker.get_summary(user_id=1, period="7d")
        assert summary["total_attempts"] == 10
        assert summary["successful"] == 8
        assert summary["failed"] == 1
        assert summary["rate_limited"] == 1
        assert summary["input_tokens_total"] == 5000
        assert summary["output_tokens_total"] == 2000
        assert summary["total_tokens"] == 7000
        assert summary["tokens_partial"] is True  # 8 out of 10 had token data
        assert "ai_coach" in summary["feature_breakdown"]
        assert summary["feature_breakdown"]["ai_coach"]["pct_of_total"] == 60.0
        assert summary["feature_breakdown"]["fortis_vision"]["pct_of_total"] == 40.0
        assert len(summary["daily_stats"]) == 2


@pytest.mark.asyncio
async def test_get_history_projection_safe():
    tracker = UsageTracker()

    fake_docs = [
        {
            "request_id": "req-1",
            "feature": "ai_coach",
            "model": "gemini-3.5-flash-lite",
            "status": "success",
            "input_tokens": 150,
            "output_tokens": 60,
            "duration_ms": 320,
            "started_at": datetime(2026, 10, 20, 8, 0, 0),
            "error_category": None,
        }
    ]

    fake_cursor = MagicMock()
    fake_cursor.sort.return_value = fake_cursor
    fake_cursor.skip.return_value = fake_cursor
    fake_cursor.limit.return_value = fake_docs

    fake_collection = MagicMock()
    fake_collection.count_documents.return_value = 1
    fake_collection.find.return_value = fake_cursor

    with patch.object(tracker, "_get_collection", return_value=fake_collection):
        history = await tracker.get_history(user_id=1, page=1, page_size=20)
        assert history["total"] == 1
        assert len(history["items"]) == 1
        item = history["items"][0]
        assert item["request_id"] == "req-1"
        assert item["feature"] == "ai_coach"
        assert "prompt" not in item
        assert "response" not in item
        assert "image" not in item


@pytest.mark.asyncio
async def test_get_status_response():
    tracker = UsageTracker()

    feature_docs = [
        {"_id": "ai_coach", "total": 5, "successful": 5, "failed": 0, "rate_limited": 0, "input_tokens": 1500, "output_tokens": 600, "has_token_data": 5},
    ]

    fake_collection = MagicMock()
    fake_collection.aggregate.return_value = feature_docs
    fake_collection.find_one.return_value = None
    fake_collection.count_documents.return_value = 0

    with patch.object(tracker, "_get_collection", return_value=fake_collection):
        status = await tracker.get_status(user_id=1)
        assert status["today_total"] == 5
        assert status["today_successful"] == 5
        assert status["today_failed"] == 0
        assert status["today_rate_limited"] == 0
        assert status["input_tokens_today"] == 1500
        assert status["output_tokens_today"] == 600
        assert status["tracking_available"] is True
        assert status["feature_today"]["ai_coach"]["total"] == 5
        assert "quota_comparison" in status
        qc = status["quota_comparison"]
        assert qc["daily_request_limit"] == 1500
        assert qc["daily_requests_used"] == 5
        assert qc["daily_requests_remaining"] == 1495
        assert qc["daily_requests_percent_used"] == 0.3
        assert qc["daily_token_limit"] == 1_000_000
        assert qc["daily_tokens_used"] == 2100
        assert qc["daily_tokens_remaining"] == 997900
        assert qc["rpm_limit"] == 15
        assert "resets_in" in qc
