from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime
from sqlalchemy.sql import func
from app.database import Base

class SleepLog(Base):
    __tablename__ = "sleep_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime(timezone=True))
    duration_hours = Column(Float)
    quality = Column(Integer)
    bedtime = Column(String, nullable=True)
    wake_time = Column(String, nullable=True)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())

class RecoveryLog(Base):
    __tablename__ = "recovery_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime(timezone=True))
    energy_level = Column(Integer)
    soreness_level = Column(Integer)
    stress_level = Column(Integer, nullable=True)
    mood = Column(Integer, nullable=True)
    recovery_score = Column(Float)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())


def compute_recovery_score(
    energy: float = None,
    soreness: float = None,
    stress: float = None,
    mood: float = None,
) -> float:
    """
    Authoritative, consistent Fortis recovery score (0.0 to 100.0).
    Input scales: 1-10. Higher energy/mood increases score; higher soreness/stress reduces score.
    """
    # Only measured signals contribute; missing values do not receive default scores.
    components = []
    for value, weight, inverse in ((energy, 0.30, False), (soreness, 0.30, True),
                                   (stress, 0.20, True), (mood, 0.20, False)):
        if value is None:
            continue
        measured = max(1.0, min(10.0, float(value)))
        normalized = (11.0 - measured if inverse else measured) * 10.0
        components.append((normalized, weight))
    if not components:
        return None
    weight_total = sum(weight for _, weight in components)
    return round(sum(score * weight for score, weight in components) / weight_total, 1)

