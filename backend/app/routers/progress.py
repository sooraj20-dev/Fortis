"""Progress router — charts, forecasting, weekly review"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_, and_
from datetime import datetime, timedelta, date
import logging
import re
from app.database import get_db
from app.deps import get_current_user, require_onboarded_user
from app.models.user import User
from app.models.intelligence import FitnessState, FortisDecision, WeeklyReview
from app.models.workout import Workout, PostWorkoutFeedback, ExerciseFormResult
from app.ml.progress import forecast_pulse
from app.schemas.progress import ProgressResponse
from app.models.profile import Schedule
from app.intelligence.progress_data import build_workout_calendar, workout_event_date, as_utc_date, valid_rpe, finite_number, completion_streak

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/progress", tags=["progress"], dependencies=[Depends(require_onboarded_user)])


@router.get("", response_model=ProgressResponse)
def get_progress(
    days: int = Query(default=30, ge=1, le=365),
    month: str | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now = datetime.utcnow()
    today = now.date()
    cutoff = now - timedelta(days=days)
    if month is None:
        month_start = date(today.year, today.month, 1)
    else:
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
            raise HTTPException(status_code=422, detail="month must use YYYY-MM format")
        year, month_num = map(int, month.split("-"))
        if not 1900 <= year <= 9998:
            raise HTTPException(status_code=422, detail="month is outside the supported range")
        month_start = date(year, month_num, 1)
    next_month = date(month_start.year + (month_start.month == 12), month_start.month % 12 + 1, 1)
    month_end = next_month - timedelta(days=1)
    month_start_dt = datetime.combine(month_start, datetime.min.time())
    next_month_dt = datetime.combine(next_month, datetime.min.time())

    # Workout records are the canonical source for session counts and calendar events.
    workouts = db.query(Workout).filter(
        Workout.user_id == current_user.id,
        or_(and_(Workout.status == "COMPLETED", Workout.completed_at >= month_start_dt, Workout.completed_at < next_month_dt),
            and_(Workout.status != "COMPLETED", Workout.date >= month_start_dt, Workout.date < next_month_dt),
            and_(Workout.status == "COMPLETED", Workout.completed_at == None, Workout.date >= month_start_dt, Workout.date < next_month_dt))
    ).order_by(Workout.date).all()
    workout_calendar = build_workout_calendar(workouts, month_start, month_end)

    # Recent summary window; no absent date is interpreted as a missed workout.
    recent_workouts = db.query(Workout).filter(
        Workout.user_id == current_user.id,
        or_(and_(Workout.status == "COMPLETED", Workout.completed_at >= cutoff, Workout.completed_at <= now),
            and_(Workout.status != "COMPLETED", Workout.date >= cutoff, Workout.date <= now),
            and_(Workout.status == "COMPLETED", Workout.completed_at == None, Workout.date >= cutoff, Workout.date <= now))
    ).order_by(Workout.date).all()

    # Fitness state history
    states = db.query(FitnessState).filter(
        FitnessState.user_id == current_user.id,
        FitnessState.date >= cutoff,
        FitnessState.date <= now
    ).order_by(FitnessState.date).all()

    state_history = [{"date": as_utc_date(s.date).isoformat(),
        "fortis_pulse": finite_number(s.fortis_pulse), "strength_score": finite_number(s.strength_score),
        "recovery_score": finite_number(s.recovery_score), "consistency_score": finite_number(s.consistency_score),
        "fatigue_risk": finite_number(s.fatigue_risk)} for s in states if as_utc_date(s.date) is not None]

    # Workout consistency
    consistency_data = [{
        "date": (workout_event_date(w) or as_utc_date(w.date)).isoformat(),
        "status": w.status,
        "workout_type": w.workout_type,
        "duration_min": w.total_duration_min,
    } for w in recent_workouts if workout_event_date(w) or as_utc_date(w.date)]

    # RPE trend
    rpe_data = []
    workout_ids = list({w.id for w in recent_workouts if w.id is not None})
    feedbacks = db.query(PostWorkoutFeedback).filter(PostWorkoutFeedback.workout_id.in_(workout_ids)).all() if workout_ids else []
    feedback_by_workout = {}
    for fb in feedbacks:
        feedback_by_workout.setdefault(fb.workout_id, fb)
    for w in recent_workouts:
        fb = feedback_by_workout.get(w.id)
        if fb:
            rpe = valid_rpe(fb.overall_rpe)
            if rpe is not None:
                rpe_data.append({"date": (workout_event_date(w) or as_utc_date(w.date)).isoformat(), "rpe": rpe,
                                 "energy": fb.energy_level, "soreness": fb.soreness_level})

    # Form score history
    form_results = db.query(ExerciseFormResult).filter(
        ExerciseFormResult.user_id == current_user.id,
        ExerciseFormResult.analyzed_at >= cutoff
    ).order_by(ExerciseFormResult.analyzed_at).all()

    form_history = [{
        "date": as_utc_date(f.analyzed_at).isoformat(),
        "exercise_id": f.exercise_id,
        "form_score": finite_number(f.form_score),
    } for f in form_results if as_utc_date(f.analyzed_at) is not None and finite_number(f.form_score) is not None]

    # Forecast
    pulse_values = [finite_number(s.fortis_pulse) for s in states]
    pulse_values = [value for value in pulse_values if value is not None]
    try:
        forecast = forecast_pulse(pulse_values, days_ahead=14)
        for key in ("forecast_7d", "forecast_14d", "current_value", "current_trend", "confidence"):
            if key in forecast and finite_number(forecast[key]) is None:
                forecast[key] = None
    except Exception:
        logger.exception("Progress forecast unavailable for user %s", current_user.id)
        forecast = {"trend_label": "insufficient_data", "forecast_7d": None, "forecast_14d": None,
                    "disclaimer": "Personal projections are unavailable until sufficient valid history is recorded."}

    # Stats summary
    unique_recent = {w.id: w for w in recent_workouts if w.id is not None}
    eligible = [w for w in unique_recent.values() if (w.status or "").upper() in {"COMPLETED", "PLANNED", "MISSED"} and (workout_event_date(w) or today) <= today]
    completed_ids = db.get_db()["workouts"].distinct("id", {"user_id": current_user.id, "status": "COMPLETED"})
    completed = len({session_id for session_id in completed_ids if session_id is not None})
    planned = sum(1 for w in eligible if (w.status or "").upper() in {"PLANNED", "MISSED"})
    completed_window = sum(1 for w in eligible if (w.status or "").upper() == "COMPLETED")
    denominator = completed_window + planned
    consistency_pct = round(completed_window / denominator * 100, 1) if denominator else None
    avg_rpe = round(sum(r["rpe"] for r in rpe_data) / max(len(rpe_data), 1), 1) if rpe_data else None
    schedule = db.query(Schedule).filter(Schedule.user_id == current_user.id).first()
    streak_cutoff = datetime.combine(today - timedelta(days=366), datetime.min.time())
    streak_sessions = db.query(Workout).filter(Workout.user_id == current_user.id, Workout.status == "COMPLETED",
        or_(and_(Workout.completed_at >= streak_cutoff, Workout.completed_at <= now),
            and_(Workout.completed_at == None, Workout.date >= streak_cutoff, Workout.date <= now))).all()
    streak_dates = {workout_event_date(session) for session in streak_sessions}
    current_streak = completion_streak(streak_dates, today)

    return {
        "summary": {
            "days": days,
            "workouts_completed": completed,
            "workouts_planned": planned,
            "consistency_pct": consistency_pct,
            "avg_rpe": avg_rpe,
            "current_pulse": finite_number(states[-1].fortis_pulse) if states else None,
            "weekly_goal": schedule.days_per_week if schedule and schedule.days_per_week is not None else None,
            "current_streak": current_streak,
        },
        "workout_calendar": workout_calendar,
        "fitness_state_history": state_history,
        "workout_consistency": consistency_data,
        "rpe_trend": rpe_data,
        "form_score_history": form_history,
        "forecast": forecast,
    }


@router.get("/weekly-review")
def get_weekly_review(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    review = db.query(WeeklyReview).filter(
        WeeklyReview.user_id == current_user.id
    ).order_by(desc(WeeklyReview.generated_at)).first()

    if review:
        return {
            "id": review.id,
            "week_start": review.week_start.date().isoformat(),
            "workouts_completed": review.workouts_completed,
            "workouts_planned": review.workouts_planned,
            "consistency_pct": review.consistency_pct,
            "avg_rpe": review.avg_rpe,
            "avg_recovery": review.avg_recovery,
            "nutrition_adherence_pct": review.nutrition_adherence_pct,
            "ai_insights": review.ai_insights,
            "next_week_recommendations": review.next_week_recommendations,
            "generated_at": review.generated_at.isoformat(),
        }

    # Generate on-demand if none exists
    return _generate_weekly_review(current_user.id, db)


@router.post("/weekly-review/generate")
def generate_weekly_review(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _generate_weekly_review(current_user.id, db)


def _generate_weekly_review(user_id: int, db: Session) -> dict:
    today = datetime.utcnow()
    week_start = today - timedelta(days=7)

    workouts = db.query(Workout).filter(
        Workout.user_id == user_id,
        Workout.date >= week_start
    ).all()

    completed = len([w for w in workouts if w.status == "COMPLETED"])
    planned = len(workouts)

    feedbacks = []
    for w in workouts:
        fb = db.query(PostWorkoutFeedback).filter(PostWorkoutFeedback.workout_id == w.id).first()
        if fb:
            feedbacks.append(fb)

    avg_rpe = round(sum(f.overall_rpe for f in feedbacks) / len(feedbacks), 1) if feedbacks else None
    from app.models.recovery import RecoveryLog
    recovery_logs = db.query(RecoveryLog).filter(
        RecoveryLog.user_id == user_id, RecoveryLog.date >= week_start
    ).all()
    recovery_values = [r.recovery_score for r in recovery_logs if r.recovery_score is not None]
    avg_recovery = round(sum(recovery_values) / len(recovery_values), 1) if recovery_values else None

    consistency_pct = round(completed / planned * 100, 1) if planned else None

    # AI insights based on actual data
    insights = []
    if consistency_pct is None:
        insights.append("No workout sessions are recorded in this period yet.")
    elif consistency_pct >= 80:
        insights.append(f"Great consistency this week — {completed}/{planned} workouts completed.")
    elif consistency_pct < 50:
        insights.append(f"Missed some workouts this week ({completed}/{planned}). Let's aim for better consistency.")
    else:
        insights.append(f"Decent week with {completed}/{planned} workouts completed.")

    if avg_rpe is None:
        insights.append("Effort trend is unavailable until a workout check-in is recorded.")
    elif avg_rpe > 7.5:
        insights.append(f"High average effort this week (RPE {avg_rpe}). Consider a deload next week.")
    elif avg_rpe < 5.5:
        insights.append(f"Low perceived effort this week (RPE {avg_rpe}). Ready to increase intensity.")
    else:
        insights.append(f"Balanced effort levels — average RPE {avg_rpe}.")

    next_week = []
    if consistency_pct is not None and consistency_pct >= 80:
        next_week.append("Maintain current training frequency — you're building great habits.")
    else:
        next_week.append("Prioritize showing up — even 20-minute sessions count.")
    if avg_rpe is not None and avg_rpe > 7.5:
        next_week.append("Include one additional recovery session next week.")
    next_week.append("Log your nutrition daily — it directly impacts your Fortis Pulse.")

    review = WeeklyReview(
        user_id=user_id,
        week_start=week_start,
        workouts_completed=completed,
        workouts_planned=planned,
        avg_rpe=avg_rpe,
        avg_recovery=avg_recovery,
        consistency_pct=consistency_pct,
        nutrition_adherence_pct=None,
        ai_insights=insights,
        next_week_recommendations=next_week,
        generated_at=today,
    )
    db.add(review)
    db.commit()

    return {
        "week_start": week_start.date().isoformat(),
        "workouts_completed": completed,
        "workouts_planned": planned,
        "consistency_pct": consistency_pct,
        "avg_rpe": avg_rpe,
        "avg_recovery": avg_recovery,
        "nutrition_adherence_pct": None,
        "ai_insights": insights,
        "next_week_recommendations": next_week,
        "generated_at": today.isoformat(),
    }
