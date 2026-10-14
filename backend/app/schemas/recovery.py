from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class SleepLogCreate(BaseModel):
    date: Optional[str] = None
    duration_hours: float
    quality: int  # 1-10
    bedtime: Optional[str] = None
    wake_time: Optional[str] = None


class SleepLogResponse(BaseModel):
    id: int
    date: datetime
    duration_hours: float
    quality: int
    bedtime: Optional[str] = None
    wake_time: Optional[str] = None
    logged_at: datetime
    model_config = {"from_attributes": True}


class RecoveryLogCreate(BaseModel):
    date: Optional[str] = None
    energy_level: int  # 1-10
    soreness_level: int  # 1-10
    stress_level: int  # 1-10
    mood: int  # 1-10


class RecoveryLogResponse(BaseModel):
    id: int
    date: datetime
    energy_level: int
    soreness_level: int
    stress_level: int
    mood: int
    recovery_score: float
    logged_at: datetime
    model_config = {"from_attributes": True}


class RecoverySummary(BaseModel):
    date: str
    recovery_score: float
    sleep_hours: Optional[float] = None
    sleep_quality: Optional[int] = None
    energy_level: Optional[int] = None
    soreness_level: Optional[int] = None
    stress_level: Optional[int] = None
    mood: Optional[int] = None
    recommendation: str
