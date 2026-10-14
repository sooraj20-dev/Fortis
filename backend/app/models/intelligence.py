from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, JSON
from sqlalchemy.sql import func
from app.database import Base

class FitnessState(Base):
    __tablename__ = "fitness_states"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime(timezone=True))
    strength_score = Column(Float)
    endurance_score = Column(Float)
    recovery_score = Column(Float)
    consistency_score = Column(Float)
    nutrition_score = Column(Float)
    mobility_score = Column(Float)
    readiness_score = Column(Float)
    fatigue_risk = Column(Float)
    fortis_pulse = Column(Float)
    movement_quality = Column(Float, nullable=True)
    stability = Column(Float, nullable=True)
    movement_consistency = Column(Float, nullable=True)
    scan_confidence = Column(Float, nullable=True)
    last_scan_date = Column(DateTime(timezone=True), nullable=True)
    computed_at = Column(DateTime(timezone=True), server_default=func.now())

class UserBaseline(Base):
    __tablename__ = "user_baselines"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    metric_name = Column(String)
    rolling_average = Column(Float)
    sample_count = Column(Integer)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class FortisDecision(Base):
    __tablename__ = "fortis_decisions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime(timezone=True))
    decision_type = Column(String)
    readiness_score = Column(Float)
    fatigue_risk = Column(Float)
    confidence = Column(Float)
    adjustment_factor = Column(Float)
    reasons = Column(JSON)
    recommendations = Column(JSON)
    baseline_deltas = Column(JSON)
    workout_id = Column(Integer, ForeignKey("workouts.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Prediction(Base):
    __tablename__ = "predictions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    prediction_type = Column(String)
    predicted_value = Column(Float)
    confidence = Column(Float)
    features_used = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class RecommendationFeedback(Base):
    __tablename__ = "recommendation_feedback"
    id = Column(Integer, primary_key=True, index=True)
    decision_id = Column(Integer, ForeignKey("fortis_decisions.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    feedback = Column(String)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"))
    role = Column(String)
    content = Column(String)
    tool_calls = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class WeeklyReview(Base):
    __tablename__ = "weekly_reviews"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    week_start = Column(DateTime(timezone=True))
    workouts_completed = Column(Integer)
    workouts_planned = Column(Integer)
    avg_rpe = Column(Float)
    avg_recovery = Column(Float)
    consistency_pct = Column(Float)
    nutrition_adherence_pct = Column(Float)
    ai_insights = Column(JSON)
    next_week_recommendations = Column(JSON)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
