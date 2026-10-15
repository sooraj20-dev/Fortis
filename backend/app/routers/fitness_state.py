"""Fitness state router"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
from app.database import get_db
from app.deps import get_current_user, require_onboarded_user
from app.models.user import User
from app.models.intelligence import FitnessState, FortisDecision
from app.intelligence.fitness_state import FitnessStateCalculator
from app.intelligence.decision_engine import FortisDecisionEngine
from app.intelligence.baseline import BaselineTracker
from app.intelligence.explainability import build_explanation
from app.schemas.intelligence import FitnessStateResponse, FortisDecisionResponse

router = APIRouter(prefix="/api/fitness-state", tags=["fitness-state"], dependencies=[Depends(require_onboarded_user)])
fs_calc = FitnessStateCalculator()
de = FortisDecisionEngine()
bt = BaselineTracker()


@router.get("", response_model=FitnessStateResponse)
def get_fitness_state(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = datetime.utcnow()
    state = db.query(FitnessState).filter(
        FitnessState.user_id == current_user.id,
        func.date(FitnessState.date) == today.date()
    ).first()
    if not state:
        state = fs_calc.compute(current_user.id, today, db)
    return state


@router.post("/compute", response_model=FitnessStateResponse)
def recompute_fitness_state(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    state = fs_calc.compute(current_user.id, datetime.utcnow(), db)
    return state


@router.get("/history")
def get_fitness_state_history(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cutoff = datetime.utcnow() - timedelta(days=days)
    states = db.query(FitnessState).filter(
        FitnessState.user_id == current_user.id,
        FitnessState.date >= cutoff
    ).order_by(FitnessState.date).all()
    return [FitnessStateResponse.model_validate(s).model_dump() for s in states]


@router.get("/decision")
def get_today_decision(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = datetime.utcnow()
    decision = db.query(FortisDecision).filter(
        FortisDecision.user_id == current_user.id,
        func.date(FortisDecision.date) == today.date()
    ).first()
    if not decision:
        decision = de.compute_decision(current_user.id, db)

    state = db.query(FitnessState).filter(
        FitnessState.user_id == current_user.id,
        func.date(FitnessState.date) == today.date()
    ).first()
    if not state:
        state = fs_calc.compute(current_user.id, today, db)

    baselines = bt.get_all_baselines(current_user.id, db)
    explanation = build_explanation(decision, state, baselines)

    return {
        "decision": FortisDecisionResponse.model_validate(decision).model_dump(),
        "explanation": explanation,
    }


@router.get("/decision-timeline")
def get_decision_timeline(
    limit: int = 10,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    decisions = db.query(FortisDecision).filter(
        FortisDecision.user_id == current_user.id
    ).order_by(desc(FortisDecision.date)).limit(limit).all()
    return [FortisDecisionResponse.model_validate(d).model_dump() for d in decisions]


@router.post("/feedback")
def submit_feedback(
    decision_id: int,
    feedback: str,
    reason: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from app.models.intelligence import RecommendationFeedback
    fb = RecommendationFeedback(
        decision_id=decision_id,
        user_id=current_user.id,
        feedback=feedback,
        reason=reason,
    )
    db.add(fb)
    db.commit()
    return {"message": "Feedback recorded", "success": True}
