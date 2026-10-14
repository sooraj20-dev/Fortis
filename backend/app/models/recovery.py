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
    stress_level = Column(Integer)
    mood = Column(Integer)
    recovery_score = Column(Float)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())
