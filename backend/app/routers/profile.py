"""Profile router — profile CRUD, onboarding"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.profile import Profile, Goal, Equipment, Schedule, NutritionPreference
from app.models.recovery import SleepLog, RecoveryLog
from app.models.workout import Workout
from app.schemas.profile import (
    FullProfileResponse,
    OnboardingData,
    ProfileUpdateRequest,
    ProfileResponse,
    GoalResponse,
    EquipmentResponse,
    ScheduleResponse,
    NutritionPrefResponse,
)
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["profile"])


def _build_full_profile(current_user: User, db: Session) -> FullProfileResponse:
    """Build and return the FullProfileResponse for the authenticated user."""
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).first()
    equipment = db.query(Equipment).filter(Equipment.user_id == current_user.id).first()
    schedule = db.query(Schedule).filter(Schedule.user_id == current_user.id).first()
    nutrition_pref = db.query(NutritionPreference).filter(NutritionPreference.user_id == current_user.id).first()

    onboarding_complete = bool(getattr(current_user, "onboarding_completed", False)) or (
        profile is not None and goal is not None
    )

    return FullProfileResponse(
        profile=ProfileResponse.model_validate(profile) if profile else None,
        goal=GoalResponse.model_validate(goal) if goal else None,
        equipment=EquipmentResponse.model_validate(equipment) if equipment else None,
        schedule=ScheduleResponse.model_validate(schedule) if schedule else None,
        nutrition_pref=NutritionPrefResponse.model_validate(nutrition_pref) if nutrition_pref else None,
        name=current_user.name,
        email=current_user.email,
        onboarding_complete=onboarding_complete,
    )


# ─────────────────────────────────────────────────────
# GET /api/profile
# ─────────────────────────────────────────────────────

@router.get("/profile", response_model=FullProfileResponse)
def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _build_full_profile(current_user, db)


# ─────────────────────────────────────────────────────
# POST /api/onboarding/complete
# ─────────────────────────────────────────────────────

@router.post("/onboarding/complete")
def complete_onboarding(
    data: OnboardingData,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Persist all onboarding wizard fields for the authenticated user.
    Safe to call multiple times — uses upsert (update-or-create) logic.
    Generates starter workout + nutrition plans after a successful save.
    """

    # ── 1. Profile (Step 1 + Step 2 location + Step 5 readiness) ──
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    profile_fields = dict(
        age=data.age,
        height_cm=data.height_cm,
        weight_kg=data.weight_kg,
        gender=data.gender,
        activity_level=data.activity_level,
        workout_location=data.workout_location,
        injury_notes=data.injury_notes,
        exercises_to_avoid=data.exercises_to_avoid or [],
        preferred_exercise_types=data.preferred_exercise_types or [],
        strength_benchmarks=data.strength_benchmarks,
    )
    if profile:
        for k, v in profile_fields.items():
            setattr(profile, k, v)
        db.add(profile)
    else:
        profile = Profile(user_id=current_user.id, **profile_fields)
        db.add(profile)

    # ── 2. Goal ───────────────────────────────────────────────────
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).first()
    if goal:
        goal.primary_goal = data.primary_goal
        goal.experience_level = data.experience_level
        db.add(goal)
    else:
        goal = Goal(
            user_id=current_user.id,
            primary_goal=data.primary_goal,
            experience_level=data.experience_level,
        )
        db.add(goal)

    # ── 3. Equipment ──────────────────────────────────────────────
    eq = db.query(Equipment).filter(Equipment.user_id == current_user.id).first()
    if eq:
        eq.equipment_list = data.equipment_list
        db.add(eq)
    else:
        eq = Equipment(user_id=current_user.id, equipment_list=data.equipment_list)
        db.add(eq)

    # ── 4. Schedule ───────────────────────────────────────────────
    sched = db.query(Schedule).filter(Schedule.user_id == current_user.id).first()
    if sched:
        sched.days_per_week = data.days_per_week
        sched.workout_duration_min = data.workout_duration_min
        sched.preferred_time = data.preferred_time
        db.add(sched)
    else:
        sched = Schedule(
            user_id=current_user.id,
            days_per_week=data.days_per_week,
            workout_duration_min=data.workout_duration_min,
            preferred_time=data.preferred_time,
        )
        db.add(sched)

    # ── 5. Nutrition preferences ──────────────────────────────────
    nutr = db.query(NutritionPreference).filter(NutritionPreference.user_id == current_user.id).first()
    nutr_fields = dict(
        diet_type=data.diet_type,
        allergies=data.allergies or [],
        regional_preference=data.regional_preference,
        preferred_cuisine=data.preferred_cuisine,
        daily_budget_inr=data.daily_budget_inr,
        meals_per_day=data.meals_per_day,
        cooking_access=data.cooking_access,
        cooking_available=data.cooking_available,
    )
    if nutr:
        for k, v in nutr_fields.items():
            setattr(nutr, k, v)
        db.add(nutr)
    else:
        nutr = NutritionPreference(user_id=current_user.id, **nutr_fields)
        db.add(nutr)

    # ── 6. Mark user as onboarded ─────────────────────────────────
    current_user.onboarding_completed = True
    db.add(current_user)
    db.flush()

    # ── 7. Optional recovery seed from lifestyle answers ──────────
    if data.typical_sleep_hours is not None:
        # Only record if this is the first entry — don't duplicate on re-submit
        existing_sleep = db.query(SleepLog).filter(SleepLog.user_id == current_user.id).first()
        if not existing_sleep:
            sleep_log = SleepLog(
                user_id=current_user.id,
                date=datetime.utcnow(),
                duration_hours=data.typical_sleep_hours,
                quality=data.typical_sleep_quality or 7,
                logged_at=datetime.utcnow(),
            )
            db.add(sleep_log)

    if data.typical_energy_level is not None or data.typical_soreness_level is not None:
        existing_recovery = db.query(RecoveryLog).filter(RecoveryLog.user_id == current_user.id).first()
        if not existing_recovery:
            energy = data.typical_energy_level or 7
            soreness = data.typical_soreness_level or 3
            stress = data.typical_stress_level or 5
            recovery_score = round(((10 - soreness) * 4) + (energy * 4) + ((10 - stress) * 2), 1)
            recovery_log = RecoveryLog(
                user_id=current_user.id,
                date=datetime.utcnow(),
                energy_level=energy,
                soreness_level=soreness,
                stress_level=stress,
                mood=7,
                recovery_score=min(100.0, max(0.0, recovery_score)),
                logged_at=datetime.utcnow(),
            )
            db.add(recovery_log)

    # ── 8. Starter workout plan ───────────────────────────────────
    try:
        existing_workout = db.query(Workout).filter(
            Workout.user_id == current_user.id,
            func.date(Workout.date) == datetime.utcnow().date()
        ).first()
        if not existing_workout:
            from app.routers.workouts import _generate_workout
            _generate_workout(current_user, datetime.utcnow().date(), db)
    except Exception as e:
        logger.warning(f"Starter workout generation note: {e}")

    # ── 9. Starter nutrition/meal plan ────────────────────────────
    try:
        from app.nutrition.budget_optimizer import generate_meal_plan
        from app.models.nutrition import MealPlan
        existing_plan = db.query(MealPlan).filter(MealPlan.user_id == current_user.id).first()
        if not existing_plan:
            diet_plan = generate_meal_plan(
                db=db,
                goal=data.primary_goal,
                daily_budget_inr=data.daily_budget_inr or 150.0,
                regional_preference=data.regional_preference,
                diet_type=data.diet_type,
                allergies=data.allergies,
            )
            meal_plan_record = MealPlan(
                user_id=current_user.id,
                date=datetime.utcnow(),
                daily_budget_inr=diet_plan.get("target_budget_inr", data.daily_budget_inr or 150.0),
                goal=data.primary_goal,
                meals=diet_plan.get("meals", {}),
                total_calories=diet_plan.get("total_calories", 0.0),
                total_protein_g=diet_plan.get("total_protein_g", 0.0),
                total_cost_inr=diet_plan.get("total_cost_inr", 0.0),
                generated_at=datetime.utcnow(),
            )
            db.add(meal_plan_record)
    except Exception as e:
        logger.warning(f"Starter meal plan generation note: {e}")

    db.commit()

    return {
        "message": "Onboarding complete",
        "success": True,
        "onboarding_complete": True,
    }


# ─────────────────────────────────────────────────────
# PATCH /api/profile  (post-onboarding edits)
# ─────────────────────────────────────────────────────

@router.patch("/profile", response_model=FullProfileResponse)
def update_profile(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Partial update for an already-onboarded user's profile.
    Only provided (non-None) fields are written.
    """
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found. Complete onboarding first.")

    # Update Profile
    profile_map = {
        "age": data.age,
        "height_cm": data.height_cm,
        "weight_kg": data.weight_kg,
        "gender": data.gender,
        "activity_level": data.activity_level,
        "workout_location": data.workout_location,
        "injury_notes": data.injury_notes,
        "exercises_to_avoid": data.exercises_to_avoid,
        "preferred_exercise_types": data.preferred_exercise_types,
        "strength_benchmarks": data.strength_benchmarks,
    }
    for k, v in profile_map.items():
        if v is not None:
            setattr(profile, k, v)
    db.add(profile)

    # Update Goal
    if data.primary_goal is not None or data.experience_level is not None:
        goal = db.query(Goal).filter(Goal.user_id == current_user.id).first()
        if goal:
            if data.primary_goal is not None:
                goal.primary_goal = data.primary_goal
            if data.experience_level is not None:
                goal.experience_level = data.experience_level
            db.add(goal)

    # Update Equipment
    if data.equipment_list is not None:
        eq = db.query(Equipment).filter(Equipment.user_id == current_user.id).first()
        if eq:
            eq.equipment_list = data.equipment_list
            db.add(eq)

    # Update Schedule
    sched_map = {
        "days_per_week": data.days_per_week,
        "workout_duration_min": data.workout_duration_min,
        "preferred_time": data.preferred_time,
    }
    if any(v is not None for v in sched_map.values()):
        sched = db.query(Schedule).filter(Schedule.user_id == current_user.id).first()
        if sched:
            for k, v in sched_map.items():
                if v is not None:
                    setattr(sched, k, v)
            db.add(sched)

    # Update NutritionPreference
    nutr_map = {
        "diet_type": data.diet_type,
        "allergies": data.allergies,
        "regional_preference": data.regional_preference,
        "preferred_cuisine": data.preferred_cuisine,
        "daily_budget_inr": data.daily_budget_inr,
        "meals_per_day": data.meals_per_day,
        "cooking_access": data.cooking_access,
        "cooking_available": data.cooking_available,
    }
    if any(v is not None for v in nutr_map.values()):
        nutr = db.query(NutritionPreference).filter(NutritionPreference.user_id == current_user.id).first()
        if nutr:
            for k, v in nutr_map.items():
                if v is not None:
                    setattr(nutr, k, v)
            db.add(nutr)

    db.commit()
    return _build_full_profile(current_user, db)
