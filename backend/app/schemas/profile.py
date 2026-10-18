from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ──────────────────────────────────────────────
# Response schemas (GET /api/profile)
# ──────────────────────────────────────────────

class ProfileResponse(BaseModel):
    id: int
    user_id: int
    age: Optional[int] = None
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    gender: Optional[str] = None
    activity_level: Optional[str] = None
    workout_location: Optional[str] = None
    injury_notes: Optional[str] = None
    exercises_to_avoid: Optional[List[str]] = None
    preferred_exercise_types: Optional[List[str]] = None
    strength_benchmarks: Optional[Dict[str, Any]] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class GoalResponse(BaseModel):
    id: int
    user_id: int
    primary_goal: str
    experience_level: str
    created_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class EquipmentResponse(BaseModel):
    id: int
    user_id: int
    equipment_list: List[str]
    model_config = {"from_attributes": True}


class ScheduleResponse(BaseModel):
    id: int
    user_id: int
    days_per_week: int
    workout_duration_min: int
    preferred_time: str
    model_config = {"from_attributes": True}


class NutritionPrefResponse(BaseModel):
    id: int
    user_id: int
    diet_type: str
    allergies: List[str]
    regional_preference: Optional[str] = None
    preferred_cuisine: Optional[str] = None
    daily_budget_inr: Optional[float] = None
    meals_per_day: Optional[int] = None
    cooking_access: Optional[str] = None
    cooking_available: Optional[bool] = None
    model_config = {"from_attributes": True}


class FullProfileResponse(BaseModel):
    profile: Optional[ProfileResponse] = None
    goal: Optional[GoalResponse] = None
    equipment: Optional[EquipmentResponse] = None
    schedule: Optional[ScheduleResponse] = None
    nutrition_pref: Optional[NutritionPrefResponse] = None
    name: str
    email: str
    avatar_url: Optional[str] = None
    onboarding_complete: bool


# ──────────────────────────────────────────────
# Onboarding submit (POST /api/onboarding/complete)
# ──────────────────────────────────────────────

class OnboardingData(BaseModel):
    # ── Step 1: Personal details ──────────────────
    age: int = Field(..., ge=12, le=120)
    height_cm: Optional[float] = Field(default=None, ge=50.0, le=280.0)
    weight_kg: Optional[float] = Field(default=None, ge=20.0, le=350.0)
    gender: Optional[str] = "unspecified"
    # regional_preference doubles as Step 1 "region/country" (food + locale)
    regional_preference: str = Field(default="Kerala")

    # ── Step 2: Fitness goals ─────────────────────
    primary_goal: str = Field(default="GENERAL_FITNESS")
    experience_level: str = Field(default="BEGINNER")
    workout_location: Optional[str] = Field(default="home")        # home / gym / outdoors
    equipment_list: List[str] = Field(default_factory=lambda: ["bodyweight"])

    # ── Step 2: Schedule ──────────────────────────
    days_per_week: int = Field(default=3, ge=1, le=7)
    workout_duration_min: int = Field(default=45, ge=15, le=120)
    preferred_time: Optional[str] = Field(default="morning")       # morning / afternoon / evening

    # ── Step 3: Nutrition ─────────────────────────
    diet_type: str = Field(default="non_vegetarian")
    allergies: List[str] = Field(default_factory=list)
    preferred_cuisine: Optional[str] = Field(default="Kerala/South Indian")
    daily_budget_inr: Optional[float] = Field(default=150.0, ge=30.0)
    meals_per_day: Optional[int] = Field(default=3, ge=1, le=6)
    cooking_access: Optional[str] = Field(default="home")          # home / hostel / mixed
    cooking_available: Optional[bool] = True

    # ── Step 4: Lifestyle / recovery ─────────────
    activity_level: Optional[str] = Field(default="MODERATELY_ACTIVE")
    typical_sleep_hours: Optional[float] = Field(default=None, ge=3.0, le=14.0)
    typical_sleep_quality: Optional[int] = Field(default=None, ge=1, le=10)
    typical_energy_level: Optional[int] = Field(default=None, ge=1, le=10)
    typical_soreness_level: Optional[int] = Field(default=None, ge=1, le=10)
    typical_stress_level: Optional[int] = Field(default=None, ge=1, le=10)

    # ── Step 5: Exercise readiness ────────────────
    injury_notes: Optional[str] = Field(default=None, max_length=1000)
    exercises_to_avoid: Optional[List[str]] = Field(default_factory=list)
    preferred_exercise_types: Optional[List[str]] = Field(default_factory=list)
    strength_benchmarks: Optional[Dict[str, Any]] = Field(default=None)


# ──────────────────────────────────────────────
# Profile update (PATCH /api/profile)
# ──────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    age: Optional[int] = Field(default=None, ge=12, le=120)
    height_cm: Optional[float] = Field(default=None, ge=50.0, le=280.0)
    weight_kg: Optional[float] = Field(default=None, ge=20.0, le=350.0)
    gender: Optional[str] = None
    activity_level: Optional[str] = None
    workout_location: Optional[str] = None
    injury_notes: Optional[str] = Field(default=None, max_length=1000)
    exercises_to_avoid: Optional[List[str]] = None
    preferred_exercise_types: Optional[List[str]] = None
    strength_benchmarks: Optional[Dict[str, Any]] = None
    avatar_url: Optional[str] = None

    # Goal
    primary_goal: Optional[str] = None
    experience_level: Optional[str] = None

    # Equipment & Schedule
    equipment_list: Optional[List[str]] = None
    days_per_week: Optional[int] = Field(default=None, ge=1, le=7)
    workout_duration_min: Optional[int] = Field(default=None, ge=15, le=120)
    preferred_time: Optional[str] = None

    # Nutrition
    diet_type: Optional[str] = None
    allergies: Optional[List[str]] = None
    regional_preference: Optional[str] = None
    preferred_cuisine: Optional[str] = None
    daily_budget_inr: Optional[float] = Field(default=None, ge=30.0)
    meals_per_day: Optional[int] = Field(default=None, ge=1, le=6)
    cooking_access: Optional[str] = None
    cooking_available: Optional[bool] = None
