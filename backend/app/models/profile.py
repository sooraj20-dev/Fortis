from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, JSON, Boolean, Text
from sqlalchemy.sql import func
from app.database import Base


class Profile(Base):
    __tablename__ = "profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    # Personal details
    age = Column(Integer)
    height_cm = Column(Float)
    weight_kg = Column(Float)
    gender = Column(String)
    activity_level = Column(String)
    # Fitness goals (step 2)
    workout_location = Column(String)            # home / gym / outdoors
    # Exercise readiness (step 5)
    injury_notes = Column(Text)                  # free-text limitations
    exercises_to_avoid = Column(JSON)            # list[str]
    preferred_exercise_types = Column(JSON)      # list[str]
    strength_benchmarks = Column(JSON)           # {squat_kg, bench_kg, …}
    avatar_url = Column(String, nullable=True)   # profile image URL / path
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Goal(Base):
    __tablename__ = "goals"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    primary_goal = Column(String)
    experience_level = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Equipment(Base):
    __tablename__ = "equipment"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    equipment_list = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Schedule(Base):
    __tablename__ = "schedules"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    days_per_week = Column(Integer)
    workout_duration_min = Column(Integer)
    preferred_time = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class NutritionPreference(Base):
    __tablename__ = "nutrition_preferences"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    diet_type = Column(String)
    allergies = Column(JSON)
    regional_preference = Column(String)
    preferred_cuisine = Column(String)          # Kerala/South Indian etc.
    daily_budget_inr = Column(Float)
    meals_per_day = Column(Integer)             # 2 / 3 / 4 / 5
    cooking_access = Column(String)             # home / hostel / mixed
    cooking_available = Column(Boolean)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
