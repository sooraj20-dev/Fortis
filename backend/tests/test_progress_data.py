from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.intelligence.progress_data import build_workout_calendar, completion_streak, valid_rpe
from app.schemas.progress import FormScoreHistoryItem


def workout(identifier, status, when, completed_at=None):
    return SimpleNamespace(id=identifier, status=status, date=when, completed_at=completed_at,
                           workout_type=f"Session {identifier}")


def test_calendar_keeps_multiple_sessions_and_omits_unknown_and_out_of_month():
    events = build_workout_calendar([
        workout(1, "COMPLETED", datetime(2026, 1, 31), datetime(2026, 2, 1, 0, 30, tzinfo=timezone.utc)),
        workout(2, "PLANNED", datetime(2026, 2, 1)),
        workout(3, "ABANDONED", datetime(2026, 2, 2)),
        workout(4, "MISSED", datetime(2026, 2, 28)),
        workout(5, "COMPLETED", datetime(2026, 3, 1)),
    ], date(2026, 2, 1), date(2026, 2, 28))
    assert [(event["session_id"], event["status"]) for event in events] == [
        ("1", "completed"), ("2", "planned"), ("4", "missed")]
    assert events[0]["date"] == "2026-02-01"


def test_calendar_never_marks_an_empty_day_missed():
    assert build_workout_calendar([], date(2026, 2, 1), date(2026, 2, 28)) == []


def test_streak_deduplicates_calendar_days_and_rpe_is_range_checked():
    assert completion_streak({date(2026, 2, 18), date(2026, 2, 19), date(2026, 2, 20)}, date(2026, 2, 20)) == 3
    assert completion_streak({date(2026, 2, 18)}, date(2026, 2, 20)) == 0
    assert valid_rpe(7) == 7.0
    assert valid_rpe(11) is None
    assert valid_rpe(float("nan")) is None


def test_legacy_form_history_allows_missing_exercise_reference():
    entry = FormScoreHistoryItem.model_validate({
        "date": "2026-10-19", "exercise_id": None, "form_score": 72.5,
    })
    assert entry.exercise_id is None
