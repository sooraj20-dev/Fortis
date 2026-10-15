"""AI Coach router — context-aware chat with Fortis data"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
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

SYSTEM_PROMPT = """You are Fortis, an AI fitness coach. You have access to the user's actual fitness data, not general knowledge about fitness.

IMPORTANT RULES:
1. You ALWAYS reference the actual user data provided in the context
2. You NEVER invent numbers or facts about the user
3. You explain Fortis decisions using the actual reasons stored in the system
4. You are supportive, clear, and concise
5. You may suggest changes, but you cannot change workouts, log food, or update user data
6. You NEVER give medical advice or diagnose conditions
7. When discussing food, prioritize Indian/Kerala options matching the user's preferences
8. Treat null values, empty reasons, and 'Data loading...' as missing data; ask a brief follow-up or give clearly labeled general guidance
9. Clearly distinguish stored Fortis measurements from estimates and general recommendations
10. When referring to body scan findings or metrics, refer to them using official Fortis Scan terms like 'Movement Quality', 'Joint Mobility', and 'Fortis Scan'

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
        "daily_budget_inr": nutr_pref.daily_budget_inr if nutr_pref else None,
        "regional_preference": nutr_pref.regional_preference if nutr_pref else None,
        "diet_type": nutr_pref.diet_type if nutr_pref else None,
        "last_rpe": latest_feedback.overall_rpe if latest_feedback else None,
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

    # Build context
    ctx = _build_user_context(current_user.id, db)
    ctx_str = f"FORTIS_CONTEXT: {json.dumps(ctx)}"

    # Get message history
    history = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at).all()

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.append({"role": "system", "content": ctx_str})
    for msg in history:
        messages.append({"role": msg.role, "content": msg.content})

    # Get AI response
    try:
        provider = get_ai_provider()
        response = await provider.complete(messages)
    except AIProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

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
        "message_id": assistant_msg.id,
        "content": response.content,
        "role": "assistant",
    }
