from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ExerciseResponse(BaseModel):
    id: int
    name: str
    muscle_groups: List[str]
    equipment_required: List[str]
    difficulty: str
    instructions: str
    category: str
    model_config = {"from_attributes": True}


class WorkoutExerciseResponse(BaseModel):
    id: int
    workout_id: int
    exercise_id: int
    exercise: ExerciseResponse
    planned_sets: int
    planned_reps: int
    planned_weight_kg: Optional[float] = None
    order_index: int
    model_config = {"from_attributes": True}


class WorkoutResponse(BaseModel):
    id: int
    user_id: int
    date: datetime
    status: str
    workout_type: str
    notes: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_duration_min: Optional[int] = None
    exercises: List[WorkoutExerciseResponse] = []
    model_config = {"from_attributes": True}


class ExerciseLogCreate(BaseModel):
    workout_exercise_id: int
    set_number: int
    reps_completed: int
    weight_kg: float = 0.0
    rpe: Optional[float] = None
    notes: Optional[str] = None


class ExerciseLogResponse(BaseModel):
    id: int
    workout_exercise_id: int
    set_number: int
    reps_completed: int
    weight_kg: float
    rpe: Optional[float] = None
    notes: Optional[str] = None
    completed_at: datetime
    model_config = {"from_attributes": True}


class PostWorkoutFeedbackCreate(BaseModel):
    overall_rpe: float
    energy_level: int
    soreness_level: int
    pain_flag: bool = False
    difficulty_notes: Optional[str] = None


class FormResultResponse(BaseModel):
    id: int
    user_id: int
    exercise_id: int
    form_score: float
    breakdown: dict
    feedback: List[str]
    analyzed_at: datetime
    model_config = {"from_attributes": True}
