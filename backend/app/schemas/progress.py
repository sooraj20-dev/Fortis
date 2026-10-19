from datetime import date
from typing import Literal, Optional, List
from pydantic import BaseModel


class WorkoutCalendarEvent(BaseModel):
    date: date
    status: Literal["completed", "planned", "missed"]
    completed: bool
    planned: bool
    workout_name: Optional[str] = None
    session_id: Optional[str] = None


class ProgressSummary(BaseModel):
    days: int
    workouts_completed: int
    workouts_planned: int
    consistency_pct: Optional[float] = None
    avg_rpe: Optional[float] = None
    current_pulse: Optional[float] = None
    weekly_goal: Optional[int] = None
    current_streak: int = 0


class FitnessStateHistoryItem(BaseModel):
    date: date
    fortis_pulse: Optional[float] = None
    strength_score: Optional[float] = None
    recovery_score: Optional[float] = None
    consistency_score: Optional[float] = None
    fatigue_risk: Optional[float] = None


class ForecastResponse(BaseModel):
    trend_label: str
    forecast_7d: Optional[float] = None
    forecast_14d: Optional[float] = None
    current_value: Optional[float] = None
    current_trend: Optional[float] = None
    confidence: Optional[float] = None
    data_points: Optional[int] = None
    model_version: Optional[str] = None
    disclaimer: str


class WorkoutConsistencyItem(BaseModel):
    date: date
    status: Optional[str] = None
    workout_type: Optional[str] = None
    duration_min: Optional[int] = None


class RPETrendItem(BaseModel):
    date: date
    rpe: float
    energy: Optional[int] = None
    soreness: Optional[int] = None


class FormScoreHistoryItem(BaseModel):
    date: date
    # Historical form records may not contain an exercise reference.
    exercise_id: Optional[int] = None
    form_score: float


class ProgressResponse(BaseModel):
    summary: ProgressSummary
    workout_calendar: List[WorkoutCalendarEvent]
    fitness_state_history: List[FitnessStateHistoryItem]
    workout_consistency: List[WorkoutConsistencyItem]
    rpe_trend: List[RPETrendItem]
    form_score_history: List[FormScoreHistoryItem]
    forecast: ForecastResponse
