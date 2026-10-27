"""
Centralized AI usage tracking service for Fortis AI.

Counting policy: Each actual outbound Gemini API attempt is counted. A retry is a separate
attempt. Local validation failures before the HTTP request are not counted.

Privacy policy: Never store prompts, responses, image bytes, API keys, or stack traces.
Only safe metadata (token counts, timing, status, error category) is recorded.
"""
import asyncio
import logging
import math
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Error category mapping (safe strings only — never stack traces)
# ---------------------------------------------------------------------------

def _categorize_error(exc: Optional[Exception], http_status: Optional[int]) -> Optional[str]:
    """Return a safe, human-readable error category string."""
    if exc is None and http_status is None:
        return None
    if http_status == 429:
        msg = (str(exc) + " " + str(getattr(exc, "message", ""))).casefold()
        if any(t in msg for t in ("perday", "per_day", "daily quota", "quota_exceeded", "prepay", "credit balance")):
            return "rate_limit_daily"
        return "rate_limit_transient"
    if http_status in (401, 403):
        return "auth_error"
    if http_status == 400:
        return "bad_request"
    if http_status in (500, 502, 503):
        return "service_unavailable"
    if http_status in (408, 504) or isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return "timeout"
    return "unknown"


def _extract_token_usage(usage_metadata) -> Dict[str, Optional[int]]:
    """
    Safely extract token counts from a Gemini SDK usage_metadata object.
    Returns None for any field that is not present or not an integer.
    """
    if usage_metadata is None:
        return {
            "input_tokens": None,
            "output_tokens": None,
            "total_tokens": None,
            "cached_tokens": None,
        }
    def _safe_int(attr: str) -> Optional[int]:
        val = getattr(usage_metadata, attr, None)
        if val is None:
            return None
        try:
            return int(val)
        except (TypeError, ValueError):
            return None

    return {
        "input_tokens": _safe_int("prompt_token_count"),
        "output_tokens": _safe_int("candidates_token_count"),
        "total_tokens": _safe_int("total_token_count"),
        "cached_tokens": _safe_int("cached_content_token_count"),
    }


# ---------------------------------------------------------------------------
# UsageTracker
# ---------------------------------------------------------------------------

class UsageTracker:
    """Thread-safe, fire-and-forget usage tracking for outbound Gemini API calls."""

    COLLECTION = "ai_usage_logs"

    def _get_collection(self):
        from app.database import get_mongo_db
        return get_mongo_db()[self.COLLECTION]

    # ------------------------------------------------------------------
    # Write path
    # ------------------------------------------------------------------

    async def record_attempt(
        self,
        *,
        user_id: Optional[int],
        feature: str,
        model: str,
        started_at: datetime,
        completed_at: datetime,
        status: str,                          # "success" | "failed" | "rate_limited"
        http_status_code: Optional[int] = None,
        usage_metadata=None,                  # raw Gemini SDK usage_metadata object
        exc: Optional[Exception] = None,
        retry_after_seconds: Optional[float] = None,
        rate_limit_kind: Optional[str] = None,
        provider_request_id: Optional[str] = None,
    ) -> None:
        """
        Persist one outbound Gemini attempt. Called fire-and-forget via
        asyncio.create_task so analytics failures never block AI responses.
        """
        try:
            tokens = _extract_token_usage(usage_metadata)
            duration_ms = max(0, int((completed_at - started_at).total_seconds() * 1000))

            # Determine error category
            if status == "success":
                error_category = None
            else:
                error_category = _categorize_error(exc, http_status_code)

            doc: Dict[str, Any] = {
                "request_id": str(uuid.uuid4()),
                "user_id": user_id,
                "feature": feature,
                "model": model,
                "started_at": started_at,
                "completed_at": completed_at,
                "duration_ms": duration_ms,
                "status": status,
                "http_status_code": http_status_code,
                "input_tokens": tokens["input_tokens"],
                "output_tokens": tokens["output_tokens"],
                "total_tokens": tokens["total_tokens"],
                "cached_tokens": tokens["cached_tokens"],
                "error_category": error_category,
                "retry_after_seconds": retry_after_seconds,
                "rate_limit_kind": rate_limit_kind,
                "provider_request_id": provider_request_id,
            }

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._insert_doc, doc)
        except Exception:
            logger.warning("UsageTracker.record_attempt failed silently (analytics only)", exc_info=False)

    def _insert_doc(self, doc: Dict[str, Any]) -> None:
        try:
            self._get_collection().insert_one(doc)
        except Exception as e:
            logger.warning("UsageTracker: MongoDB insert failed: %s", type(e).__name__)

    # ------------------------------------------------------------------
    # Read path — summary
    # ------------------------------------------------------------------

    async def get_summary(self, user_id: int, period: str = "7d") -> Dict[str, Any]:
        """Return aggregated stats for a user over the given period."""
        now = datetime.utcnow()
        period_map = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}
        delta = period_map.get(period, timedelta(days=7))
        period_start = now - delta

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None, self._build_summary, user_id, period_start, now, period
            )
        except Exception as e:
            logger.warning("UsageTracker.get_summary failed: %s", type(e).__name__)
            return self._unavailable_summary(period_start, now)

    def _build_summary(
        self, user_id: int, period_start: datetime, period_end: datetime, period: str
    ) -> Dict[str, Any]:
        col = self._get_collection()
        match_filter = {"user_id": user_id, "started_at": {"$gte": period_start, "$lte": period_end}}

        # ── Totals pipeline ─────────────────────────────────────────────
        totals_pipeline = [
            {"$match": match_filter},
            {
                "$group": {
                    "_id": None,
                    "total_attempts": {"$sum": 1},
                    "successful": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
                    "rate_limited": {"$sum": {"$cond": [{"$eq": ["$status", "rate_limited"]}, 1, 0]}},
                    "input_tokens_total": {"$sum": {"$ifNull": ["$input_tokens", 0]}},
                    "output_tokens_total": {"$sum": {"$ifNull": ["$output_tokens", 0]}},
                    "total_tokens": {"$sum": {"$ifNull": ["$total_tokens", 0]}},
                    "has_token_data": {"$sum": {"$cond": [{"$ne": ["$input_tokens", None]}, 1, 0]}},
                }
            },
        ]
        totals_result = list(col.aggregate(totals_pipeline))
        totals = totals_result[0] if totals_result else {}

        total_attempts = totals.get("total_attempts", 0)
        successful = totals.get("successful", 0)
        failed = totals.get("failed", 0)
        rate_limited = totals.get("rate_limited", 0)
        has_token_data = totals.get("has_token_data", 0)

        # Only report token totals when at least one document has token data
        input_tokens_total = totals.get("input_tokens_total") if has_token_data else None
        output_tokens_total = totals.get("output_tokens_total") if has_token_data else None
        total_tokens = totals.get("total_tokens") if has_token_data else None
        tokens_partial = bool(total_attempts > 0 and has_token_data < total_attempts)

        # ── Feature breakdown pipeline ───────────────────────────────────
        feature_pipeline = [
            {"$match": match_filter},
            {
                "$group": {
                    "_id": "$feature",
                    "total": {"$sum": 1},
                    "successful": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
                    "rate_limited": {"$sum": {"$cond": [{"$eq": ["$status", "rate_limited"]}, 1, 0]}},
                    "input_tokens": {"$sum": {"$ifNull": ["$input_tokens", 0]}},
                    "output_tokens": {"$sum": {"$ifNull": ["$output_tokens", 0]}},
                    "total_tokens": {"$sum": {"$ifNull": ["$total_tokens", 0]}},
                    "has_token_data": {"$sum": {"$cond": [{"$ne": ["$input_tokens", None]}, 1, 0]}},
                }
            },
        ]
        feature_docs = list(col.aggregate(feature_pipeline))
        feature_breakdown: Dict[str, Any] = {}
        for doc in feature_docs:
            feat = doc.get("_id") or "unknown"
            has_td = doc.get("has_token_data", 0)
            feat_total = doc.get("total", 0)
            pct = round((feat_total / total_attempts * 100), 1) if total_attempts > 0 else 0.0
            feature_breakdown[feat] = {
                "total": feat_total,
                "successful": doc.get("successful", 0),
                "failed": doc.get("failed", 0),
                "rate_limited": doc.get("rate_limited", 0),
                "input_tokens": doc.get("input_tokens") if has_td else None,
                "output_tokens": doc.get("output_tokens") if has_td else None,
                "total_tokens": doc.get("total_tokens") if has_td else None,
                "pct_of_total": pct,
            }

        # ── Daily stats pipeline ─────────────────────────────────────────
        daily_pipeline = [
            {"$match": match_filter},
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$started_at"},
                        "month": {"$month": "$started_at"},
                        "day": {"$dayOfMonth": "$started_at"},
                    },
                    "total": {"$sum": 1},
                    "successful": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
                    "rate_limited": {"$sum": {"$cond": [{"$eq": ["$status", "rate_limited"]}, 1, 0]}},
                    "input_tokens": {"$sum": {"$ifNull": ["$input_tokens", 0]}},
                    "output_tokens": {"$sum": {"$ifNull": ["$output_tokens", 0]}},
                    "has_token_data": {"$sum": {"$cond": [{"$ne": ["$input_tokens", None]}, 1, 0]}},
                }
            },
            {"$sort": {"_id": 1}},
        ]
        daily_docs = list(col.aggregate(daily_pipeline))
        daily_stats = []
        for doc in daily_docs:
            d = doc["_id"]
            has_td = doc.get("has_token_data", 0)
            daily_stats.append({
                "date": f"{d['year']:04d}-{d['month']:02d}-{d['day']:02d}",
                "total": doc.get("total", 0),
                "successful": doc.get("successful", 0),
                "failed": doc.get("failed", 0),
                "rate_limited": doc.get("rate_limited", 0),
                "input_tokens": doc.get("input_tokens") if has_td else None,
                "output_tokens": doc.get("output_tokens") if has_td else None,
            })

        warning_state = self._compute_warning_state(
            total_attempts=total_attempts,
            rate_limited=rate_limited,
            period_start=period_start,
            period_end=period_end,
            col=col,
            user_id=user_id,
        )

        daily_budget = getattr(settings, "AI_DAILY_REQUEST_BUDGET", 0)
        warning_percent = getattr(settings, "AI_USAGE_WARNING_PERCENT", 80.0)

        # ── Quota & Balance Calculation (Today's Usage vs Limits) ───────
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_match = {"user_id": user_id, "started_at": {"$gte": today_start}}
        today_req_count = col.count_documents(today_match)
        today_tokens_agg = list(col.aggregate([
            {"$match": today_match},
            {"$group": {"_id": None, "tokens": {"$sum": {"$ifNull": ["$total_tokens", 0]}}}}
        ]))
        today_tok_count = (today_tokens_agg[0].get("tokens") if today_tokens_agg else None) or (today_tokens_agg[0].get("total_tokens") if today_tokens_agg else 0) or 0
        quota_comparison = self._build_quota_comparison(today_req_count, today_tok_count)

        return {
            "period": period,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "total_attempts": total_attempts,
            "successful": successful,
            "failed": failed,
            "rate_limited": rate_limited,
            "input_tokens_total": input_tokens_total,
            "output_tokens_total": output_tokens_total,
            "total_tokens": total_tokens,
            "tokens_partial": tokens_partial,
            "feature_breakdown": feature_breakdown,
            "daily_stats": daily_stats,
            "tracking_status": "active",
            "warning_state": warning_state,
            "warning_states": warning_state,
            "warning_budget": {
                "daily_request_budget": daily_budget if daily_budget > 0 else None,
                "warning_percent": warning_percent,
            },
            "quota_comparison": quota_comparison,
            "last_updated": datetime.utcnow().isoformat(),
        }

    def _build_quota_comparison(self, today_requests: int, today_tokens: int) -> Dict[str, Any]:
        """
        Compare actual current usage today against configured warning thresholds.
        Does not fabricate official Google Gemini quota limits or reset countdowns.
        Explicitly distinguishes application-configured warning budgets from official Google quota limits.
        """
        daily_req_budget = getattr(settings, "AI_DAILY_REQUEST_BUDGET", 0)
        daily_token_budget = getattr(settings, "AI_DAILY_TOKEN_BUDGET", 0)
        model = getattr(settings, "GEMINI_MODEL", "gemini-3.5-flash-lite")
        is_warning_budget = bool(daily_req_budget and daily_req_budget > 0)

        if is_warning_budget:
            request_limit = daily_req_budget
            limit_type = "custom_budget"
            limit_label = "Application Warning Budget"
            limit_description = "Internal application warning threshold (does not reflect official Google Cloud quota limits)"
            req_remaining = max(0, request_limit - today_requests)
            req_pct_used = round(min(100.0, (today_requests / request_limit * 100)), 1) if request_limit > 0 else 0.0
        else:
            request_limit = None
            limit_type = "official_quota_unavailable"
            limit_label = "Official Gemini Quota Unavailable"
            limit_description = "Google Gemini does not expose real-time project quota telemetry via the client SDK. Check Google AI Studio for official limits."
            req_remaining = None
            req_pct_used = None

        if daily_token_budget and daily_token_budget > 0:
            token_limit = daily_token_budget
            tok_remaining = max(0, token_limit - today_tokens)
            tok_pct_used = round(min(100.0, (today_tokens / token_limit * 100)), 1)
        else:
            token_limit = None
            tok_remaining = None
            tok_pct_used = None

        rpm_limit = getattr(settings, "AI_REQUESTS_PER_MINUTE_BUDGET", None) or None
        tpm_limit = getattr(settings, "AI_TOKENS_PER_MINUTE_BUDGET", None) or None

        return {
            "model": model,
            "daily_request_limit": request_limit,
            "daily_requests_used": today_requests,
            "daily_requests_remaining": req_remaining,
            "daily_requests_percent_used": req_pct_used,
            "daily_token_limit": token_limit,
            "daily_tokens_used": today_tokens,
            "daily_tokens_remaining": tok_remaining,
            "daily_tokens_percent_used": tok_pct_used,
            "rpm_limit": rpm_limit,
            "tpm_limit": tpm_limit,
            "limit_type": limit_type,
            "limit_label": limit_label,
            "limit_description": limit_description,
            "is_warning_budget": is_warning_budget,
            "configured_warning_budget": daily_req_budget if is_warning_budget else None,
            "official_daily_request_limit": None,
            "official_quota_available": False,
            "official_quota_label": "Official Gemini quota unavailable",
            "official_quota_url": "https://ai.google.dev/gemini-api/docs/rate-limits",
            "resets_at": None,
            "resets_in": None,
        }

    def _compute_warning_state(
        self,
        total_attempts: int,
        rate_limited: int,
        period_start: datetime,
        period_end: datetime,
        col,
        user_id: int,
    ) -> str:
        """Compute warning state based on budget env vars."""
        # Recent rate-limit check (last 5 minutes)
        recent_cutoff = datetime.utcnow() - timedelta(minutes=5)
        recent_rl = col.count_documents({
            "user_id": user_id,
            "status": "rate_limited",
            "started_at": {"$gte": recent_cutoff},
        })
        if recent_rl > 0:
            return "rate_limited"

        # Daily budget check
        daily_budget: int = getattr(settings, "AI_DAILY_REQUEST_BUDGET", 0)
        if daily_budget and daily_budget > 0:
            warning_pct: float = getattr(settings, "AI_USAGE_WARNING_PERCENT", 80.0)
            threshold = (total_attempts / daily_budget * 100) if daily_budget else 0
            if threshold >= 100:
                return "threshold_reached"
            if threshold >= warning_pct:
                return "approaching_threshold"
            return "normal"

        if total_attempts == 0:
            return "quota_unknown"

        return "normal"

    def _unavailable_summary(self, period_start: datetime, period_end: datetime) -> Dict[str, Any]:
        """
        Return a clearly-marked unavailable response.
        ALL numeric usage fields are None — never 0 — to prevent callers from treating
        a tracking failure as 'zero usage' or 'full quota remaining'.
        """
        return {
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "total_attempts": None,
            "successful": None,
            "failed": None,
            "rate_limited": None,
            "input_tokens_total": None,
            "output_tokens_total": None,
            "total_tokens": None,
            "tokens_partial": False,
            "feature_breakdown": {},
            "daily_stats": [],
            "tracking_status": "unavailable",
            "warning_state": "tracking_unavailable",
            "warning_states": "tracking_unavailable",
            "warning_budget": {
                "daily_request_budget": None,
                "warning_percent": 80.0,
            },
            "quota_comparison": self._unavailable_quota_comparison(),
            "last_updated": datetime.utcnow().isoformat(),
        }

    def _unavailable_quota_comparison(self) -> Dict[str, Any]:
        """
        Return a quota comparison that explicitly signals tracking is unavailable.
        All usage-derived numeric fields are None to prevent false 'full quota remaining'
        display when tracking data cannot be read.
        """
        daily_req_budget = getattr(settings, "AI_DAILY_REQUEST_BUDGET", 0)
        is_warning_budget = bool(daily_req_budget and daily_req_budget > 0)
        return {
            "model": getattr(settings, "GEMINI_MODEL", "gemini-3.5-flash-lite"),
            "daily_request_limit": None,
            "daily_requests_used": None,
            "daily_requests_remaining": None,
            "daily_requests_percent_used": None,
            "daily_token_limit": None,
            "daily_tokens_used": None,
            "daily_tokens_remaining": None,
            "daily_tokens_percent_used": None,
            "rpm_limit": None,
            "tpm_limit": None,
            "limit_type": "tracking_unavailable",
            "limit_label": "Usage tracking unavailable",
            "limit_description": "Tracking service is unavailable. Usage data cannot be verified.",
            "is_warning_budget": is_warning_budget,
            "configured_warning_budget": daily_req_budget if is_warning_budget else None,
            "official_daily_request_limit": None,
            "resets_at": "",
            "resets_in": "—",
            "tracking_unavailable": True,
        }

    # ------------------------------------------------------------------
    # Read path — paginated history
    # ------------------------------------------------------------------

    async def get_history(
        self,
        user_id: int,
        feature: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Return paginated usage history (safe metadata only — no prompts, responses, or images)."""
        page_size = min(page_size, 50)
        days = min(days, 90)
        page = max(1, page)

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None, self._fetch_history, user_id, feature, status, page, page_size, days
            )
        except Exception as e:
            logger.warning("UsageTracker.get_history failed: %s", type(e).__name__)
            return {"items": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 1, "tracking_status": "unavailable"}

    def _fetch_history(
        self,
        user_id: int,
        feature: Optional[str],
        status: Optional[str],
        page: int,
        page_size: int,
        days: int,
    ) -> Dict[str, Any]:
        col = self._get_collection()
        cutoff = datetime.utcnow() - timedelta(days=days)
        query: Dict[str, Any] = {"user_id": user_id, "started_at": {"$gte": cutoff}}
        if feature:
            query["feature"] = feature
        if status:
            query["status"] = status

        total = col.count_documents(query)
        total_pages = max(1, math.ceil(total / page_size)) if total > 0 else 1
        skip = (page - 1) * page_size

        # Return ONLY safe metadata fields — no prompts, responses, or images
        projection = {
            "_id": 0,
            "request_id": 1,
            "feature": 1,
            "model": 1,
            "status": 1,
            "input_tokens": 1,
            "output_tokens": 1,
            "duration_ms": 1,
            "started_at": 1,
            "error_category": 1,
        }
        docs = list(
            col.find(query, projection)
            .sort("started_at", -1)
            .skip(skip)
            .limit(page_size)
        )

        for doc in docs:
            if isinstance(doc.get("started_at"), datetime):
                doc["started_at"] = doc["started_at"].isoformat()

        return {
            "items": docs,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "tracking_status": "active",
        }

    # ------------------------------------------------------------------
    # Read path — compact status
    # ------------------------------------------------------------------

    async def get_status(self, user_id: int) -> Dict[str, Any]:
        """Return a lightweight status object for dashboard indicators."""
        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, self._fetch_status, user_id)
        except Exception as e:
            logger.warning("UsageTracker.get_status failed: %s", type(e).__name__)
            return {
                "today_total": None,
                "today_successful": None,
                "today_failed": None,
                "today_rate_limited": None,
                "feature_today": {
                    "ai_coach": {"total": None, "successful": None, "failed": None, "rate_limited": None, "input_tokens": None, "output_tokens": None},
                    "fortis_vision": {"total": None, "successful": None, "failed": None, "rate_limited": None, "input_tokens": None, "output_tokens": None},
                },
                "input_tokens_today": None,
                "output_tokens_today": None,
                "warning_state": "tracking_unavailable",
                "latest_rate_limit_at": None,
                "retry_after_seconds": None,
                "last_updated": datetime.utcnow().isoformat(),
                "tracking_available": False,
                "tracking_status": "unavailable",
                "quota_comparison": self._unavailable_quota_comparison(),
            }

    def _fetch_status(self, user_id: int) -> Dict[str, Any]:
        col = self._get_collection()
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        recent_rl_cutoff = datetime.utcnow() - timedelta(minutes=5)

        # Today's totals per feature
        pipeline = [
            {"$match": {"user_id": user_id, "started_at": {"$gte": today_start}}},
            {
                "$group": {
                    "_id": "$feature",
                    "total": {"$sum": 1},
                    "successful": {"$sum": {"$cond": [{"$eq": ["$status", "success"]}, 1, 0]}},
                    "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
                    "rate_limited": {"$sum": {"$cond": [{"$eq": ["$status", "rate_limited"]}, 1, 0]}},
                    "input_tokens": {"$sum": {"$ifNull": ["$input_tokens", 0]}},
                    "output_tokens": {"$sum": {"$ifNull": ["$output_tokens", 0]}},
                    "has_token_data": {"$sum": {"$cond": [{"$ne": ["$input_tokens", None]}, 1, 0]}},
                }
            },
        ]
        feature_docs = list(col.aggregate(pipeline))
        today_by_feature: Dict[str, Any] = {}
        today_overall = {"total": 0, "successful": 0, "failed": 0, "rate_limited": 0}
        total_in_tokens = 0
        total_out_tokens = 0
        has_any_token_data = False

        for doc in feature_docs:
            feat = doc.get("_id") or "unknown"
            has_td = doc.get("has_token_data", 0)
            in_t = doc.get("input_tokens") if has_td else None
            out_t = doc.get("output_tokens") if has_td else None

            today_by_feature[feat] = {
                "total": doc.get("total", 0),
                "successful": doc.get("successful", 0),
                "failed": doc.get("failed", 0),
                "rate_limited": doc.get("rate_limited", 0),
                "input_tokens": in_t,
                "output_tokens": out_t,
            }
            today_overall["total"] += doc.get("total", 0)
            today_overall["successful"] += doc.get("successful", 0)
            today_overall["failed"] += doc.get("failed", 0)
            today_overall["rate_limited"] += doc.get("rate_limited", 0)
            if has_td:
                has_any_token_data = True
                total_in_tokens += doc.get("input_tokens", 0)
                total_out_tokens += doc.get("output_tokens", 0)

        # Recent rate-limit info
        recent_rl_doc = col.find_one(
            {"user_id": user_id, "status": "rate_limited", "started_at": {"$gte": recent_rl_cutoff}},
            sort=[("started_at", -1)],
            projection={"_id": 0, "started_at": 1, "rate_limit_kind": 1, "retry_after_seconds": 1, "feature": 1},
        )
        recent_rate_limit = None
        if recent_rl_doc:
            if isinstance(recent_rl_doc.get("started_at"), datetime):
                recent_rl_doc["started_at"] = recent_rl_doc["started_at"].isoformat()
            recent_rate_limit = recent_rl_doc

        # Warning state
        warning_state = self._compute_warning_state(
            total_attempts=today_overall.get("total", 0),
            rate_limited=today_overall.get("rate_limited", 0),
            period_start=today_start,
            period_end=datetime.utcnow(),
            col=col,
            user_id=user_id,
        )

        quota_comparison = self._build_quota_comparison(
            today_overall["total"],
            (total_in_tokens + total_out_tokens) if has_any_token_data else 0,
        )

        return {
            "today_total": today_overall["total"],
            "today_successful": today_overall["successful"],
            "today_failed": today_overall["failed"],
            "today_rate_limited": today_overall["rate_limited"],
            "feature_today": {
                "ai_coach": today_by_feature.get("ai_coach", {
                    "total": 0, "successful": 0, "failed": 0, "rate_limited": 0, "input_tokens": None, "output_tokens": None,
                }),
                "fortis_vision": today_by_feature.get("fortis_vision", {
                    "total": 0, "successful": 0, "failed": 0, "rate_limited": 0, "input_tokens": None, "output_tokens": None,
                }),
            },
            "input_tokens_today": total_in_tokens if has_any_token_data else None,
            "output_tokens_today": total_out_tokens if has_any_token_data else None,
            "warning_state": warning_state,
            "latest_rate_limit_at": recent_rate_limit["started_at"] if recent_rate_limit else None,
            "retry_after_seconds": recent_rate_limit.get("retry_after_seconds") if recent_rate_limit else None,
            "last_updated": datetime.utcnow().isoformat(),
            "tracking_available": True,
            "tracking_status": "active",
            "quota_comparison": quota_comparison,
            "today": {
                "overall": today_overall,
                "by_feature": today_by_feature,
            },
            "recent_rate_limit": recent_rate_limit,
        }

    # ------------------------------------------------------------------
    # Index management
    # ------------------------------------------------------------------

    async def ensure_indexes(self) -> None:
        """Create MongoDB indexes for the ai_usage_logs collection."""
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._create_indexes)
        except Exception as e:
            logger.warning("UsageTracker.ensure_indexes failed: %s", type(e).__name__)

    def _create_indexes(self) -> None:
        col = self._get_collection()
        col.create_index([("user_id", 1), ("started_at", -1)])
        col.create_index([("user_id", 1), ("feature", 1), ("started_at", -1)])
        col.create_index([("user_id", 1), ("status", 1), ("started_at", -1)])
        col.create_index("request_id", unique=True, sparse=True)
        logger.info("UsageTracker: MongoDB indexes verified for ai_usage_logs")


# Module-level singleton
usage_tracker = UsageTracker()
