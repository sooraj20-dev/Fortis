"""Pure helpers for trustworthy workout history summaries and calendar events."""
from datetime import date, datetime, timezone, timedelta
from math import isfinite


def as_utc_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.date()
    if isinstance(value, date):
        return value
    return None


def workout_event_date(workout):
    status = (getattr(workout, "status", "") or "").upper()
    # Completion timestamp is authoritative when recorded; otherwise retain the app's UTC date field.
    if status == "COMPLETED":
        return as_utc_date(getattr(workout, "completed_at", None)) or as_utc_date(getattr(workout, "date", None))
    return as_utc_date(getattr(workout, "date", None))


def build_workout_calendar(workouts, start_date: date, end_date: date):
    """Return only authoritative session events inside an inclusive calendar window."""
    events, seen = [], set()
    for workout in workouts:
        session_id = getattr(workout, "id", None)
        status = (getattr(workout, "status", "") or "").upper()
        event_date = workout_event_date(workout)
        if session_id is None or session_id in seen or event_date is None or not start_date <= event_date <= end_date:
            continue
        if status == "COMPLETED":
            normalized, completed, planned = "completed", True, False
        elif status == "PLANNED":
            normalized, completed, planned = "planned", False, True
        elif status == "MISSED":
            normalized, completed, planned = "missed", False, False
        else:
            # In-progress, abandoned, cancelled and unknown sessions are not planned/completion events.
            continue
        seen.add(session_id)
        events.append({"date": event_date.isoformat(), "status": normalized, "completed": completed,
                       "planned": planned, "workout_name": getattr(workout, "workout_type", None),
                       "session_id": str(session_id)})
    return sorted(events, key=lambda event: (event["date"], event["session_id"]))


def valid_rpe(value):
    try:
        value = float(value)
        return value if isfinite(value) and 1 <= value <= 10 else None
    except (TypeError, ValueError):
        return None


def finite_number(value):
    try:
        number = float(value)
        return number if isfinite(number) else None
    except (TypeError, ValueError):
        return None


def completion_streak(completed_dates, today: date):
    dates = {value for value in completed_dates if isinstance(value, date)}
    cursor = today if today in dates else today - timedelta(days=1)
    count = 0
    while cursor in dates:
        count += 1
        cursor -= timedelta(days=1)
    return count
