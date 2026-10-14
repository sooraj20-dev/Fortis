from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, JSON, Boolean
from sqlalchemy.sql import func
from app.database import Base

class Exercise(Base):
    __tablename__ = "exercises"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    muscle_groups = Column(JSON)
    equipment_required = Column(JSON)
    difficulty = Column(String)
    instructions = Column(String)
    demo_url = Column(String, nullable=True)
    category = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Workout(Base):
    __tablename__ = "workouts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime(timezone=True))
    status = Column(String)
    workout_type = Column(String)
    notes = Column(String, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    total_duration_min = Column(Integer, nullable=True)
    decision_id = Column(Integer, nullable=True)

class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"
    id = Column(Integer, primary_key=True, index=True)
    workout_id = Column(Integer, ForeignKey("workouts.id"))
    exercise_id = Column(Integer, ForeignKey("exercises.id"))
    planned_sets = Column(Integer)
    planned_reps = Column(Integer)
    planned_weight_kg = Column(Float, nullable=True)
    order_index = Column(Integer)

class ExerciseLog(Base):
    __tablename__ = "exercise_logs"
    id = Column(Integer, primary_key=True, index=True)
    workout_exercise_id = Column(Integer, ForeignKey("workout_exercises.id"))
    set_number = Column(Integer)
    reps_completed = Column(Integer)
    weight_kg = Column(Float)
    rpe = Column(Float, nullable=True)
    notes = Column(String, nullable=True)
    completed_at = Column(DateTime(timezone=True), server_default=func.now())

class PostWorkoutFeedback(Base):
    __tablename__ = "post_workout_feedback"
    id = Column(Integer, primary_key=True, index=True)
    workout_id = Column(Integer, ForeignKey("workouts.id"))
    overall_rpe = Column(Float)
    energy_level = Column(Integer)
    soreness_level = Column(Integer)
    pain_flag = Column(Boolean, default=False)
    difficulty_notes = Column(String, nullable=True)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())

class ExerciseFormResult(Base):
    __tablename__ = "exercise_form_results"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    exercise_id = Column(Integer, ForeignKey("exercises.id"))
    video_path = Column(String)
    form_score = Column(Float)
    breakdown = Column(JSON)
    feedback = Column(JSON)
    analyzed_at = Column(DateTime(timezone=True), server_default=func.now())
