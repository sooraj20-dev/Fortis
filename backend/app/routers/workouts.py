"""Workouts router — generation, logging, adaptation"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from typing import List, Optional
from app.database import get_db
from app.deps import get_current_user, require_onboarded_user
from app.models.user import User
from app.models.workout import Exercise, Workout, WorkoutExercise, ExerciseLog, PostWorkoutFeedback
from app.models.profile import Goal, Equipment, Schedule, Profile
from app.models.intelligence import FortisDecision, FitnessState
from app.intelligence.decision_engine import FortisDecisionEngine
from app.intelligence.fitness_state import FitnessStateCalculator
from app.intelligence.adaptation import adapt_workout_exercises, get_workout_type_for_decision, estimate_workout_duration
from app.schemas.workout import ExerciseLogCreate, PostWorkoutFeedbackCreate

router = APIRouter(prefix="/api/workouts", tags=["workouts"], dependencies=[Depends(require_onboarded_user)])
de = FortisDecisionEngine()
fs_calc = FitnessStateCalculator()

WORKOUT_SPLIT = {
    "STRENGTH": ["UPPER_PUSH", "LOWER", "UPPER_PULL", "FULL_BODY"],
    "MUSCLE": ["UPPER_PUSH", "LOWER", "UPPER_PULL", "CORE", "FULL_BODY"],
    "GENERAL_FITNESS": ["FULL_BODY", "UPPER", "LOWER", "FULL_BODY"],
    "ENDURANCE": ["CARDIO", "FULL_BODY", "CARDIO"],
    "WEIGHT_MANAGEMENT": ["FULL_BODY", "CARDIO", "UPPER", "LOWER"],
    "SPORTS": ["LOWER", "UPPER", "CARDIO", "FULL_BODY"],
    "MOBILITY": ["FULL_BODY", "CORE", "FULL_BODY"],
}

CATEGORY_MAP = {
    "UPPER_PUSH": "upper_push",
    "UPPER_PULL": "upper_pull",
    "UPPER": "upper",
    "LOWER": "lower",
    "CORE": "core",
    "FULL_BODY": "compound",
    "CARDIO": "cardio",
}


def serialize_workout(workout: Workout, db: Session) -> dict:
    """Canonical read contract shared by dashboard and Workout page."""
    exercises = db.query(WorkoutExercise).filter(
        WorkoutExercise.workout_id == workout.id
    ).order_by(WorkoutExercise.order_index).all()

    ex_ids = [we.exercise_id for we in exercises if getattr(we, "exercise_id", None) is not None]
    we_ids = [we.id for we in exercises if getattr(we, "id", None) is not None]

    ex_map = {}
    if ex_ids:
        for ex in db.query(Exercise).filter(Exercise.id.in_(ex_ids)).all():
            ex_map[ex.id] = ex

    logs_by_we = {}
    if we_ids:
        for l in db.query(ExerciseLog).filter(ExerciseLog.workout_exercise_id.in_(we_ids)).all():
            logs_by_we.setdefault(l.workout_exercise_id, []).append(l)

    exercises_data = []
    for we in exercises:
        ex = ex_map.get(we.exercise_id)
        logs = logs_by_we.get(we.id, [])
        exercises_data.append({
            "id": we.id,
            "exercise": {
                "id": ex.id, "name": ex.name, "muscle_groups": ex.muscle_groups,
                "equipment_required": ex.equipment_required, "difficulty": ex.difficulty,
                "instructions": ex.instructions, "category": ex.category,
            } if ex else {},
            "planned_sets": we.planned_sets,
            "planned_reps": we.planned_reps,
            "planned_weight_kg": we.planned_weight_kg,
            "order_index": we.order_index,
            "logs": [{"set_number": l.set_number, "reps_completed": l.reps_completed,
                      "weight_kg": l.weight_kg, "rpe": l.rpe} for l in logs],
        })
    return {
        "id": workout.id,
        "workout_type": workout.workout_type,
        "status": workout.status,
        "date": workout.date.isoformat(),
        "estimated_duration_min": workout.total_duration_min,
        "exercises": exercises_data,
    }


def _select_exercises(
    db: Session,
    workout_type: str,
    equipment_list: List[str],
    experience: str,
    target_count: int = 5,
    exercises_to_avoid: Optional[List[str]] = None,
) -> List[Exercise]:
    """Select appropriate exercises based on workout type, available equipment, and avoidances."""
    category = CATEGORY_MAP.get(workout_type, "compound")

    # Map experience to difficulty
    difficulty_map = {
        "BEGINNER": ["BEGINNER"],
        "INTERMEDIATE": ["BEGINNER", "INTERMEDIATE"],
        "ADVANCED": ["INTERMEDIATE", "ADVANCED"],
    }
    difficulties = difficulty_map.get(experience, ["BEGINNER", "INTERMEDIATE"])

    # Include bodyweight always
    valid_equipment = list(set(["bodyweight"] + [eq.lower() for eq in equipment_list]))

    all_exercises = db.query(Exercise).filter(
        Exercise.difficulty.in_(difficulties)
    ).all()

    # Filter out exercises user asked to avoid (from onboarding/profile)
    if exercises_to_avoid:
        avoid_terms = [a.lower().strip() for a in exercises_to_avoid if isinstance(a, str) and a.strip()]
        if avoid_terms:
            all_exercises = [
                ex for ex in all_exercises
                if not any(a in ex.name.lower() or a in (ex.instructions or "").lower() for a in avoid_terms)
            ]

    # Filter by category and equipment
    matching = []
    for ex in all_exercises:
        ex_cat = ex.category.lower() if ex.category else ""
        ex_eq = [e.lower() for e in (ex.equipment_required or [])]

        # Category match
        cat_match = (
            category in ex_cat or
            ex_cat == "compound" or
            (category == "upper" and ("push" in ex_cat or "pull" in ex_cat))
        )

        # Equipment match
        eq_match = any(eq in valid_equipment for eq in ex_eq) or "bodyweight" in ex_eq

        if cat_match and eq_match:
            matching.append(ex)

    if len(matching) < target_count:
        # Fallback: add any matching equipment exercises
        for ex in all_exercises:
            if ex not in matching:
                ex_eq = [e.lower() for e in (ex.equipment_required or [])]
                if any(eq in valid_equipment for eq in ex_eq):
                    matching.append(ex)
            if len(matching) >= target_count * 2:
                break

    # Return diverse selection
    return matching[:target_count]


def _get_planned_sets_reps(goal: str, experience: str) -> tuple:
    """Return (sets, reps) based on goal."""
    configs = {
        "STRENGTH": {"BEGINNER": (3, 5), "INTERMEDIATE": (4, 5), "ADVANCED": (5, 3)},
        "MUSCLE": {"BEGINNER": (3, 10), "INTERMEDIATE": (3, 12), "ADVANCED": (4, 10)},
        "GENERAL_FITNESS": {"BEGINNER": (3, 12), "INTERMEDIATE": (3, 12), "ADVANCED": (4, 10)},
        "ENDURANCE": {"BEGINNER": (2, 15), "INTERMEDIATE": (3, 15), "ADVANCED": (3, 20)},
        "WEIGHT_MANAGEMENT": {"BEGINNER": (3, 12), "INTERMEDIATE": (3, 15), "ADVANCED": (4, 15)},
    }
    goal_cfg = configs.get(goal, configs["GENERAL_FITNESS"])
    return goal_cfg.get(experience, (3, 12))


@router.get("/today")
def get_today_workout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today_date = datetime.utcnow().date()

    # Check if workout already exists
    existing = db.query(Workout).filter(
        Workout.user_id == current_user.id,
        func.date(Workout.date) == today_date
    ).first()

    if existing:
        return serialize_workout(existing, db)

    # Generate new workout
    return _generate_workout(current_user, today_date, db)


def _generate_workout(current_user: User, target_date, db: Session):
    """Generate an adapted workout for the given date."""
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).first()
    equipment = db.query(Equipment).filter(Equipment.user_id == current_user.id).first()
    schedule = db.query(Schedule).filter(Schedule.user_id == current_user.id).first()
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()

    primary_goal = goal.primary_goal if goal else "GENERAL_FITNESS"
    experience = goal.experience_level if goal else "BEGINNER"
    equipment_list = equipment.equipment_list if equipment else ["bodyweight"]
    target_duration = schedule.workout_duration_min if schedule else 45
    exercises_to_avoid = (profile.exercises_to_avoid or []) if profile else []

    # Get today's decision
    decision = db.query(FortisDecision).filter(
        FortisDecision.user_id == current_user.id,
        func.date(FortisDecision.date) == target_date
    ).first()
    if not decision:
        decision = de.compute_decision(current_user.id, db)

    # Determine workout split based on day of week and goal
    split = WORKOUT_SPLIT.get(primary_goal, WORKOUT_SPLIT["GENERAL_FITNESS"])
    # Count completed workouts this week to pick next split
    week_start = target_date - timedelta(days=target_date.weekday())
    completed_this_week = db.query(Workout).filter(
        Workout.user_id == current_user.id,
        Workout.status == "COMPLETED",
        func.date(Workout.date) >= week_start
    ).count()
    workout_type_key = split[completed_this_week % len(split)]

    # Select exercises
    sets, reps = _get_planned_sets_reps(primary_goal, experience)
    target_exercise_count = max(3, min(6, target_duration // 10))
    exercises = _select_exercises(db, workout_type_key, equipment_list, experience, target_exercise_count, exercises_to_avoid)

    if not exercises:
        raise HTTPException(status_code=422, detail="No exercises match your saved equipment and limitations. Update your profile to generate a suitable plan.")

    workout_label = get_workout_type_for_decision(decision.decision_type, workout_type_key.replace("_", " ").title())

    # Create workout
    workout = Workout(
        user_id=current_user.id,
        date=datetime.combine(target_date, datetime.min.time()),
        status="PLANNED",
        workout_type=workout_label,
        total_duration_min=estimate_workout_duration([{"planned_sets": sets} for _ in exercises]),
    )
    db.add(workout)
    db.flush()

    # Create workout exercises (with adaptation applied)
    exercise_dicts = [{"planned_sets": sets, "planned_reps": reps, "planned_weight_kg": 0} for _ in exercises]
    adapted = adapt_workout_exercises(exercise_dicts, decision, experience)

    exercises_data = []
    for i, (ex, adapted_ex) in enumerate(zip(exercises, adapted)):
        we = WorkoutExercise(
            workout_id=workout.id,
            exercise_id=ex.id,
            planned_sets=adapted_ex.get("planned_sets", sets),
            planned_reps=adapted_ex.get("planned_reps", reps),
            planned_weight_kg=adapted_ex.get("planned_weight_kg", None),
            order_index=i,
        )
        db.add(we)
        db.flush()
        exercises_data.append({
            "id": we.id,
            "exercise": {
                "id": ex.id, "name": ex.name, "muscle_groups": ex.muscle_groups,
                "equipment_required": ex.equipment_required, "difficulty": ex.difficulty,
                "instructions": ex.instructions, "category": ex.category,
            },
            "planned_sets": we.planned_sets,
            "planned_reps": we.planned_reps,
            "planned_weight_kg": we.planned_weight_kg,
            "order_index": i,
            "adaptation_note": adapted_ex.get("adaptation_note"),
            "logs": [],
        })

    db.commit()

    return {
        "id": workout.id,
        "workout_type": workout.workout_type,
        "status": workout.status,
        "date": workout.date.isoformat(),
        "estimated_duration_min": workout.total_duration_min,
        "decision_type": decision.decision_type,
        "adjustment_factor": decision.adjustment_factor,
        "exercises": exercises_data,
    }


@router.post("/{workout_id}/start")
def start_workout(workout_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    workout = db.query(Workout).filter(Workout.id == workout_id, Workout.user_id == current_user.id).first()
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    if workout.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Workout is already completed")
    if workout.status == "IN_PROGRESS" and workout.started_at:
        # Already started — just return current state without resetting started_at
        return {"message": "Workout already in progress", "started_at": workout.started_at.isoformat()}
    workout.status = "IN_PROGRESS"
    workout.started_at = datetime.utcnow()
    db.commit()
    return {"message": "Workout started", "started_at": workout.started_at.isoformat()}


@router.post("/{workout_id}/log-exercise")
def log_exercise_set(workout_id: int, data: ExerciseLogCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Verify the workout exists and belongs to the current user
    workout = db.query(Workout).filter(Workout.id == workout_id, Workout.user_id == current_user.id).first()
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")

    we = db.query(WorkoutExercise).filter(
        WorkoutExercise.id == data.workout_exercise_id,
        WorkoutExercise.workout_id == workout_id
    ).first()
    if not we:
        raise HTTPException(status_code=404, detail="Exercise not found in this workout")
    log = ExerciseLog(
        workout_exercise_id=data.workout_exercise_id,
        set_number=data.set_number,
        reps_completed=data.reps_completed,
        weight_kg=data.weight_kg,
        rpe=data.rpe,
        notes=data.notes,
        completed_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    return {"message": "Set logged", "log_id": log.id}


@router.post("/{workout_id}/complete")
def complete_workout(
    workout_id: int,
    feedback: PostWorkoutFeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    workout = db.query(Workout).filter(Workout.id == workout_id, Workout.user_id == current_user.id).first()
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    if workout.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Workout is already completed")

    # Validate feedback bounds
    if not (1 <= feedback.overall_rpe <= 10):
        raise HTTPException(status_code=422, detail="overall_rpe must be between 1 and 10")
    if not (1 <= feedback.energy_level <= 10):
        raise HTTPException(status_code=422, detail="energy_level must be between 1 and 10")
    if not (1 <= feedback.soreness_level <= 10):
        raise HTTPException(status_code=422, detail="soreness_level must be between 1 and 10")

    workout.status = "COMPLETED"
    workout.completed_at = datetime.utcnow()
    if workout.started_at:
        # Use total_seconds() to handle cross-midnight durations correctly
        duration = int((workout.completed_at - workout.started_at).total_seconds() // 60)
        workout.total_duration_min = max(1, duration)

    # Save post-workout feedback
    fb = PostWorkoutFeedback(
        workout_id=workout_id,
        overall_rpe=feedback.overall_rpe,
        energy_level=feedback.energy_level,
        soreness_level=feedback.soreness_level,
        pain_flag=feedback.pain_flag,
        difficulty_notes=feedback.difficulty_notes,
        logged_at=datetime.utcnow(),
    )
    db.add(fb)

    # Also update recovery log with latest soreness/energy
    from app.models.recovery import RecoveryLog, compute_recovery_score
    recovery_score = compute_recovery_score(
        energy=feedback.energy_level,
        soreness=feedback.soreness_level,
    )
    recovery_log = RecoveryLog(
        user_id=current_user.id,
        date=datetime.utcnow(),
        energy_level=feedback.energy_level,
        soreness_level=feedback.soreness_level,
        stress_level=None,
        mood=None,
        recovery_score=recovery_score,
        logged_at=datetime.utcnow(),
    )
    db.add(recovery_log)

    db.commit()

    # Trigger fitness state recomputation (adaptation loop)
    try:
        fs_calc.compute(current_user.id, datetime.utcnow(), db)
    except Exception:
        pass

    return {
        "message": "Workout completed! Fortis is adapting your next session.",
        "workout_id": workout_id,
        "recovery_score": recovery_score,
        "adaptation_triggered": True,
    }


@router.get("/history")
def get_workout_history(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    workouts = db.query(Workout).filter(
        Workout.user_id == current_user.id
    ).order_by(desc(Workout.date)).limit(limit).all()

    result = []
    for w in workouts:
        exercises = db.query(WorkoutExercise).filter(WorkoutExercise.workout_id == w.id).count()
        feedback = db.query(PostWorkoutFeedback).filter(PostWorkoutFeedback.workout_id == w.id).first()
        result.append({
            "id": w.id,
            "date": w.date.isoformat(),
            "workout_type": w.workout_type,
            "status": w.status,
            "exercise_count": exercises,
            "duration_min": w.total_duration_min,
            "overall_rpe": feedback.overall_rpe if feedback else None,
        })
    return result
