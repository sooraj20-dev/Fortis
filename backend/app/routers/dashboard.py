"""Dashboard router — the main daily intelligence summary"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.intelligence import FitnessState, FortisDecision
from app.models.workout import Workout, WorkoutExercise, Exercise, PostWorkoutFeedback
from app.models.recovery import RecoveryLog, SleepLog
from app.models.nutrition import FoodLog
from app.models.profile import Profile, Goal, Equipment, Schedule, NutritionPreference
from app.intelligence.fitness_state import FitnessStateCalculator
from app.intelligence.decision_engine import FortisDecisionEngine
from app.schemas.intelligence import DashboardResponse, FitnessStateResponse, FortisDecisionResponse

router = APIRouter(prefix="/api", tags=["dashboard"])
fs_calculator = FitnessStateCalculator()
decision_engine = FortisDecisionEngine()


@router.get("/dashboard")
def get_dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = datetime.utcnow()
    today_date = today.date()

    hour = today.hour
    if hour < 12:
        greeting = f"Good morning, {current_user.name}"
    elif hour < 17:
        greeting = f"Good afternoon, {current_user.name}"
    else:
        greeting = f"Good evening, {current_user.name}"

    # Get or compute fitness state
    state = db.query(FitnessState).filter(
        FitnessState.user_id == current_user.id,
        func.date(FitnessState.date) == today_date
    ).first()
    if not state:
        try:
            state = fs_calculator.compute(current_user.id, today, db)
        except Exception:
            state = None

    # Get or compute decision
    decision = db.query(FortisDecision).filter(
        FortisDecision.user_id == current_user.id,
        func.date(FortisDecision.date) == today_date
    ).first()
    if not decision:
        try:
            decision = decision_engine.compute_decision(current_user.id, db)
        except Exception:
            decision = None

    # Today's workout
    today_workout = db.query(Workout).filter(
        Workout.user_id == current_user.id,
        func.date(Workout.date) == today_date
    ).first()

    workout_summary = None
    if today_workout:
        exercises = db.query(WorkoutExercise).filter(
            WorkoutExercise.workout_id == today_workout.id
        ).all()
        exercise_list = []
        for we in exercises:
            ex = db.query(Exercise).filter(Exercise.id == we.exercise_id).first()
            if ex:
                exercise_list.append({
                    "id": ex.id,
                    "name": ex.name,
                    "difficulty": ex.difficulty,
                    "muscle_groups": ex.muscle_groups or [],
                    "planned_sets": we.planned_sets or 3,
                    "planned_reps": we.planned_reps or 10,
                    "planned_weight_kg": we.planned_weight_kg,
                })
        workout_summary = {
            "id": today_workout.id,
            "workout_type": today_workout.workout_type,
            "status": today_workout.status,
            "exercise_count": len(exercises),
            "estimated_duration_min": today_workout.total_duration_min or len(exercises) * 8,
            "exercises": exercise_list,
        }

    # Nutrition summary
    food_logs_today = db.query(FoodLog).filter(
        FoodLog.user_id == current_user.id,
        func.date(FoodLog.date) == today_date
    ).all()

    nutr_pref = db.query(NutritionPreference).filter(
        NutritionPreference.user_id == current_user.id
    ).first()

    total_calories = sum(fl.calories for fl in food_logs_today)
    total_protein = sum(fl.protein_g for fl in food_logs_today)
    total_carbs = sum(fl.carbs_g for fl in food_logs_today)
    budget_spent = sum(0 for fl in food_logs_today)  # approximate

    target_calories = 2200.0
    budget = nutr_pref.daily_budget_inr if nutr_pref else 150.0

    nutrition_summary = {
        "total_calories": round(total_calories, 1),
        "total_protein_g": round(total_protein, 1),
        "total_carbs_g": round(total_carbs, 1),
        "target_calories": target_calories,
        "calories_pct": round(min(100, total_calories / target_calories * 100), 1),
        "protein_pct": round(min(100, total_protein / 150 * 100), 1),
        "budget_remaining_inr": round(budget, 2),
        "log_count": len(food_logs_today),
    }

    # Recovery summary
    latest_recovery = db.query(RecoveryLog).filter(
        RecoveryLog.user_id == current_user.id
    ).order_by(desc(RecoveryLog.date)).first()

    latest_sleep = db.query(SleepLog).filter(
        SleepLog.user_id == current_user.id
    ).order_by(desc(SleepLog.date)).first()

    recovery_summary = {
        "recovery_score": latest_recovery.recovery_score if latest_recovery else None,
        "sleep_hours": latest_sleep.duration_hours if latest_sleep else None,
        "sleep_quality": latest_sleep.quality if latest_sleep else None,
        "energy_level": latest_recovery.energy_level if latest_recovery else None,
        "soreness_level": latest_recovery.soreness_level if latest_recovery else None,
        "stress_level": latest_recovery.stress_level if latest_recovery else None,
    }

    # Recent decisions (last 7 days)
    recent_decisions = db.query(FortisDecision).filter(
        FortisDecision.user_id == current_user.id
    ).order_by(desc(FortisDecision.date)).limit(7).all()

    # User profile & onboarding preferences
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).first()
    equipment = db.query(Equipment).filter(Equipment.user_id == current_user.id).first()
    schedule = db.query(Schedule).filter(Schedule.user_id == current_user.id).first()

    onboarding_summary = {
        "onboarding_completed": bool(current_user.onboarding_completed),
        "primary_goal": goal.primary_goal if goal else None,
        "experience_level": goal.experience_level if goal else None,
        "workout_location": profile.workout_location if profile else None,
        "equipment_list": equipment.equipment_list if equipment else [],
        "days_per_week": schedule.days_per_week if schedule else None,
        "workout_duration_min": schedule.workout_duration_min if schedule else None,
        "diet_type": nutr_pref.diet_type if nutr_pref else None,
        "preferred_cuisine": nutr_pref.preferred_cuisine if nutr_pref else None,
        "daily_budget_inr": nutr_pref.daily_budget_inr if nutr_pref else None,
        "meals_per_day": nutr_pref.meals_per_day if nutr_pref else None,
        "cooking_access": nutr_pref.cooking_access if nutr_pref else None,
        "injury_notes": profile.injury_notes if profile else None,
        "exercises_to_avoid": profile.exercises_to_avoid if profile else [],
        "height_cm": profile.height_cm if profile else None,
        "weight_kg": profile.weight_kg if profile else None,
        "age": profile.age if profile else None,
        "regional_preference": profile.regional_preference if profile else None,
    }

    return {
        "greeting": greeting,
        "date": today_date.isoformat(),
        "fortis_pulse": state.fortis_pulse if state else None,
        "fitness_state": FitnessStateResponse.model_validate(state).model_dump() if state else None,
        "today_decision": FortisDecisionResponse.model_validate(decision).model_dump() if decision else None,
        "today_workout": workout_summary,
        "nutrition_summary": nutrition_summary,
        "recovery_summary": recovery_summary,
        "recent_decisions": [FortisDecisionResponse.model_validate(d).model_dump() for d in recent_decisions],
        "onboarding_summary": onboarding_summary,
    }
