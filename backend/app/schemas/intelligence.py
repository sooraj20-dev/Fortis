from pydantic import BaseModel
from typing import Optional, List, Dict
from datetime import datetime


class FitnessStateResponse(BaseModel):
    id: int
    date: datetime
    strength_score: Optional[float] = None
    endurance_score: Optional[float] = None
    recovery_score: Optional[float] = None
    consistency_score: Optional[float] = None
    nutrition_score: Optional[float] = None
    mobility_score: Optional[float] = None
    readiness_score: Optional[float] = None
    fatigue_risk: Optional[float] = None
    fortis_pulse: Optional[float] = None
    movement_quality: Optional[float] = None
    stability: Optional[float] = None
    movement_consistency: Optional[float] = None
    scan_confidence: Optional[float] = None
    last_scan_date: Optional[datetime] = None
    computed_at: datetime
    model_config = {"from_attributes": True}


class FortisDecisionResponse(BaseModel):
    id: int
    date: datetime
    decision_type: str  # PROGRESSIVE | NORMAL | REDUCED | RECOVERY | REST
    readiness_score: Optional[float] = None
    fatigue_risk: Optional[float] = None
    confidence: float
    adjustment_factor: float
    reasons: List[str]
    recommendations: List[str]
    baseline_deltas: Dict[str, float]
    created_at: datetime
    model_config = {"from_attributes": True}


class FeedbackCreate(BaseModel):
    decision_id: int
    feedback: str  # POSITIVE | NEGATIVE
    reason: Optional[str] = None


class ChatMessageCreate(BaseModel):
    content: str


class ChatMessageResponse(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    created_at: datetime
    model_config = {"from_attributes": True}


class ChatSessionResponse(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class WeeklyReviewResponse(BaseModel):
    id: int
    week_start: datetime
    workouts_completed: int
    workouts_planned: int
    avg_rpe: float
    avg_recovery: float
    consistency_pct: float
    nutrition_adherence_pct: float
    ai_insights: List[str]
    next_week_recommendations: List[str]
    generated_at: datetime
    model_config = {"from_attributes": True}


class DashboardResponse(BaseModel):
    greeting: str
    date: str
    fortis_pulse: Optional[float] = None
    fitness_state: Optional[FitnessStateResponse] = None
    today_decision: Optional[FortisDecisionResponse] = None
    today_workout: Optional[dict] = None
    nutrition_summary: Optional[dict] = None
    recovery_summary: Optional[dict] = None
    recent_decisions: List[FortisDecisionResponse] = []


class ProgressResponse(BaseModel):
    fitness_state_history: List[FitnessStateResponse]
    workout_consistency: List[dict]
    rpe_trend: List[dict]
    form_score_history: List[dict]
    forecast: Optional[dict] = None
