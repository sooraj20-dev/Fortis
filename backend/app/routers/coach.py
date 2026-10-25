"""AI Coach router — context-aware chat with Fortis data"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime
from app.database import get_db
from app.deps import get_current_user, require_onboarded_user
from app.models.user import User
from app.models.intelligence import ChatSession, ChatMessage, FitnessState, FortisDecision
from app.models.profile import Goal, NutritionPreference
from app.models.recovery import RecoveryLog, SleepLog
from app.models.workout import Workout, PostWorkoutFeedback
from app.ai.provider import AIProviderError, get_ai_provider
from app.schemas.intelligence import ChatMessageCreate
import json

router = APIRouter(prefix="/api/coach", tags=["coach"], dependencies=[Depends(require_onboarded_user)])

SYSTEM_PROMPT = """You are Fortis, an AI fitness coach. Answer the user's latest question directly and use the supplied Fortis context when it is relevant.

Return only a valid JSON object in this exact envelope: {"candidates":[{"output":"<coach response>","finish_reason":"stop"}]}. Keep the response focused, clear, and actionable; use enough detail to answer the question without unnecessary filler. Do not include markdown fences or extra JSON fields.

IMPORTANT RULES:
1. Answer what the user actually asked; do not force unrelated fitness advice or repeat a generic workout answer.
2. Use only relevant facts from FORTIS_CONTEXT. Never invent personal details, workout history, measurements, or decision reasons.
3. When asked about today's workout, refer to the saved today's workout and recent workout history if present. Explain repetition only when the history supports it; otherwise say what information is missing.
4. Explain Fortis decisions using the actual reasons stored in the context. Treat nulls, empty lists, and missing records as unavailable, not as negative findings.
5. Be supportive and concise. You may suggest changes, but cannot change workouts, log food, or update user data.
6. Never give medical advice or diagnose conditions. Respect recorded injuries, exercise avoidances, allergies, and diet preferences.
7. For food questions, use the user's recorded diet, allergies, regional/cuisine preferences, and budget when available.
8. Clearly distinguish stored measurements from estimates and general recommendations. When referring to scan metrics, use official terms such as 'Movement Quality', 'Joint Mobility', and 'Fortis Scan'.

You are the communication layer of Fortis intelligence — the brain is the decision engine, you are the voice."""


def _build_user_context(user_id: int, db: Session) -> dict:
    """Gather all relevant user context to pass to the AI."""
    today = datetime.utcnow()
    today_date = today.date()

    state = db.query(FitnessState).filter(
        FitnessState.user_id == user_id,
        func.date(FitnessState.date) == today_date
    ).first()

    decision = db.query(FortisDecision).filter(
        FortisDecision.user_id == user_id,
        func.date(FortisDecision.date) == today_date
    ).first()

    latest_recovery = db.query(RecoveryLog).filter(
        RecoveryLog.user_id == user_id
    ).order_by(desc(RecoveryLog.date)).first()

    latest_sleep = db.query(SleepLog).filter(
        SleepLog.user_id == user_id
    ).order_by(desc(SleepLog.date)).first()

    goal = db.query(Goal).filter(Goal.user_id == user_id).first()
    nutr_pref = db.query(NutritionPreference).filter(NutritionPreference.user_id == user_id).first()

    from app.models.profile import Profile, Equipment, Schedule
    profile = db.query(Profile).filter(Profile.user_id == user_id).first()
    equipment = db.query(Equipment).filter(Equipment.user_id == user_id).first()
    schedule = db.query(Schedule).filter(Schedule.user_id == user_id).first()

    today_workout = db.query(Workout).filter(
        Workout.user_id == user_id,
        func.date(Workout.date) == today_date,
    ).first()
    today_workout_info = None
    if today_workout:
        from app.models.workout import WorkoutExercise, Exercise
        planned = db.query(WorkoutExercise).filter(
            WorkoutExercise.workout_id == today_workout.id
        ).order_by(WorkoutExercise.order_index).all()
        exercise_ids = [item.exercise_id for item in planned]
        exercise_by_id = {
            item.id: item for item in db.query(Exercise).filter(Exercise.id.in_(exercise_ids)).all()
        } if exercise_ids else {}
        today_workout_info = {
            "date": today_workout.date.date().isoformat() if today_workout.date else today_date.isoformat(),
            "type": today_workout.workout_type,
            "status": today_workout.status,
            "duration_minutes": today_workout.total_duration_min,
            "exercises": [
                {
                    "name": exercise_by_id[item.exercise_id].name,
                    "muscle_groups": exercise_by_id[item.exercise_id].muscle_groups,
                    "sets": item.planned_sets,
                    "reps": item.planned_reps,
                }
                for item in planned if item.exercise_id in exercise_by_id
            ],
        }

    recent_workouts = db.query(Workout).filter(
        Workout.user_id == user_id,
        func.date(Workout.date) < today_date,
    ).order_by(desc(Workout.date)).limit(7).all()
    recent_workout_info = []
    if recent_workouts:
        from app.models.workout import WorkoutExercise, Exercise
        workout_ids = [item.id for item in recent_workouts]
        planned = db.query(WorkoutExercise).filter(
            WorkoutExercise.workout_id.in_(workout_ids)
        ).order_by(WorkoutExercise.workout_id, WorkoutExercise.order_index).all()
        exercise_ids = {item.exercise_id for item in planned}
        exercise_by_id = {
            item.id: item for item in db.query(Exercise).filter(Exercise.id.in_(exercise_ids)).all()
        } if exercise_ids else {}
        by_workout = {}
        for item in planned:
            exercise = exercise_by_id.get(item.exercise_id)
            if exercise:
                by_workout.setdefault(item.workout_id, []).append(exercise.name)
        recent_workout_info = [
            {
                "date": item.date.date().isoformat() if item.date else None,
                "type": item.workout_type,
                "status": item.status,
                "exercises": by_workout.get(item.id, []),
            }
            for item in recent_workouts
        ]

    latest_feedback = db.query(PostWorkoutFeedback).join(
        Workout, Workout.id == PostWorkoutFeedback.workout_id
    ).filter(Workout.user_id == user_id).order_by(desc(Workout.date)).first()

    # Get latest scan and comparisons
    from app.models.scan import BodyScan, ScanComparison
    latest_scan = db.query(BodyScan).filter(
        BodyScan.user_id == user_id,
        BodyScan.status == "COMPLETED"
    ).order_by(desc(BodyScan.scan_date)).first()

    scan_info = None
    if latest_scan and latest_scan.metrics:
        m = latest_scan.metrics
        obs = [f"{'✓' if o.status == 'POSITIVE' else '⚠'} {o.text}" for o in latest_scan.observations]
        scan_info = {
            "has_scan": True,
            "scan_id": latest_scan.id,
            "movement_quality": m.movement_quality,
            "mobility": m.mobility,
            "stability": m.stability,
            "movement_consistency": m.movement_consistency,
            "symmetry_indicator": m.symmetry_indicator,
            "squat_movement_score": m.squat_movement_score,
            "confidence": latest_scan.confidence,
            "observations": obs,
        }

    latest_comp = db.query(ScanComparison).filter(
        ScanComparison.user_id == user_id
    ).order_by(desc(ScanComparison.comparison_date)).first()

    comparison_info = None
    if latest_comp:
        comparison_info = {
            "metrics_delta": latest_comp.metrics_delta,
            "what_changed": latest_comp.what_changed,
        }

    return {
        "fortis_pulse": state.fortis_pulse if state else None,
        "readiness_score": state.readiness_score if state else None,
        "fatigue_risk": state.fatigue_risk if state else None,
        "recovery_score": state.recovery_score if state else None,
        "consistency_score": state.consistency_score if state else None,
        "decision_type": decision.decision_type if decision else None,
        "reasons": decision.reasons if decision else [],
        "recommendations": decision.recommendations if decision else [],
        "adjustment_factor": decision.adjustment_factor if decision else None,
        "energy_level": latest_recovery.energy_level if latest_recovery else None,
        "soreness_level": latest_recovery.soreness_level if latest_recovery else None,
        "stress_level": latest_recovery.stress_level if latest_recovery else None,
        "sleep_hours": latest_sleep.duration_hours if latest_sleep else None,
        "primary_goal": goal.primary_goal if goal else None,
        "experience_level": goal.experience_level if goal else None,
        "profile": {
            "age": profile.age if profile else None,
            "height_cm": profile.height_cm if profile else None,
            "weight_kg": profile.weight_kg if profile else None,
            "gender": profile.gender if profile else None,
            "activity_level": profile.activity_level if profile else None,
            "workout_location": profile.workout_location if profile else None,
            "injury_notes": profile.injury_notes if profile else None,
            "exercises_to_avoid": profile.exercises_to_avoid if profile else [],
            "preferred_exercise_types": profile.preferred_exercise_types if profile else [],
        },
        "equipment": equipment.equipment_list if equipment else [],
        "schedule": {
            "days_per_week": schedule.days_per_week if schedule else None,
            "workout_duration_min": schedule.workout_duration_min if schedule else None,
            "preferred_time": schedule.preferred_time if schedule else None,
        },
        "daily_budget_inr": nutr_pref.daily_budget_inr if nutr_pref else None,
        "regional_preference": nutr_pref.regional_preference if nutr_pref else None,
        "diet_type": nutr_pref.diet_type if nutr_pref else None,
        "nutrition_preferences": {
            "allergies": nutr_pref.allergies if nutr_pref else [],
            "preferred_cuisine": nutr_pref.preferred_cuisine if nutr_pref else None,
            "meals_per_day": nutr_pref.meals_per_day if nutr_pref else None,
            "cooking_access": nutr_pref.cooking_access if nutr_pref else None,
        },
        "last_rpe": latest_feedback.overall_rpe if latest_feedback else None,
        "today_workout": today_workout_info,
        "recent_workouts": recent_workout_info,
        "scan": scan_info,
        "comparison": comparison_info,
    }


@router.get("/sessions")
def get_sessions(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).order_by(desc(ChatSession.updated_at)).limit(10).all()
    return [{"id": s.id, "title": s.title, "created_at": s.created_at.isoformat()} for s in sessions]


@router.post("/sessions")
def create_session(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = ChatSession(
        user_id=current_user.id,
        title=f"Chat {datetime.utcnow().strftime('%b %d')}",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(session)
    db.commit()
    return {"id": session.id, "title": session.title}


@router.get("/sessions/{session_id}/messages")
def get_messages(session_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at).all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in messages]


@router.post("/sessions/{session_id}/message")
async def send_message(
    session_id: int,
    data: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == current_user.id
    ).first()
    if not session:
        session = ChatSession(
            user_id=current_user.id,
            title=f"Coach {datetime.utcnow().strftime('%b %d')}",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        session_id = session.id

    # Save user message
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=data.content,
        created_at=datetime.utcnow(),
    )
    db.add(user_msg)
    # Keep the user's question even when the provider is temporarily rate limited.
    session.updated_at = datetime.utcnow()
    db.commit()

    # Build context
    ctx = _build_user_context(current_user.id, db)
    ctx_str = f"FORTIS_CONTEXT: {json.dumps(ctx)}"

    # Get message history
    recent_history = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(desc(ChatMessage.created_at)).limit(12).all()
    history = list(reversed(recent_history))

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.append({"role": "system", "content": ctx_str})
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    # Get AI response
    try:
        provider = get_ai_provider()
        response = await provider.complete(messages, max_tokens=192, user_id=current_user.id)
    except AIProviderError as exc:
        message = str(exc)
        if "request limit" in message.lower() or "rate limit" in message.lower() or "quota" in message.lower():
            raise HTTPException(status_code=429, detail=message) from exc
        raise HTTPException(status_code=503, detail=message) from exc

    # Save assistant response
    assistant_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=response.content,
        created_at=datetime.utcnow(),
    )
    db.add(assistant_msg)

    # Update session timestamp
    session.updated_at = datetime.utcnow()
    db.commit()

    return {
        "content": response.content,
        "candidates": [{"output": response.content, "finish_reason": response.finish_reason}],
    }
