"""
Usage Analytics router — Gemini API monitoring, token usage, and rate limits.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from app.deps import get_current_user
from app.models.user import User
from app.services.usage_tracker import usage_tracker

router = APIRouter(prefix="/api/usage", tags=["usage"], dependencies=[Depends(get_current_user)])


@router.get("/status")
async def get_usage_status(current_user: User = Depends(get_current_user)):
    """Return lightweight, real-time status for the AI Coach and Vision usage indicators."""
    return await usage_tracker.get_status(current_user.id)


@router.get("/summary")
async def get_usage_summary(
    period: str = Query("7d", pattern="^(24h|7d|30d)$"),
    current_user: User = Depends(get_current_user),
):
    """Return aggregated Gemini API activity, tokens, and daily breakdowns for the usage dashboard."""
    return await usage_tracker.get_summary(current_user.id, period=period)


@router.get("/history")
async def get_usage_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    feature: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    days: int = Query(30, ge=1, le=90),
    current_user: User = Depends(get_current_user),
):
    """Return paginated usage history containing safe metadata only (no prompts, responses, or images)."""
    return await usage_tracker.get_history(
        user_id=current_user.id,
        feature=feature,
        status=status,
        page=page,
        page_size=page_size,
        days=days,
    )
