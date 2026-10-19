from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from typing import Literal


class AdaptationRequest(BaseModel):
    available_minutes: int = Field(ge=10, le=120)
    equipment_ids: List[Literal["bodyweight", "dumbbells", "resistance_bands", "exercise_mat", "pull_up_bar", "bench", "full_gym"]] = Field(default_factory=lambda: ["bodyweight"], min_length=1, max_length=7)


class DecisionReason(BaseModel):
    rule_id: Literal["TIME_CONSTRAINT", "EQUIPMENT_MISMATCH", "PLAN_UNAVAILABLE", "SUITABLE_PLAN"]
    label: str
    detail: str


class AdaptationDraftResponse(BaseModel):
    recommendation_id: str
    category: Literal["SHORTER_SESSION", "EQUIPMENT_ADAPTATION", "TIME_AND_EQUIPMENT", "NORMAL_PLAN"]
    title: str
    summary: str
    reasons: List[DecisionReason]
    original_duration_min: int
    target_duration_min: int
    estimated_duration_min: int
    exercises: List[dict]
    changes: List[str]
    requires_confirmation: bool = True


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
