"""Recovery router — sleep, energy, soreness logging"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.recovery import SleepLog, RecoveryLog
from app.schemas.recovery import SleepLogCreate, RecoveryLogCreate

router = APIRouter(prefix="/api/recovery", tags=["recovery"])


def _compute_recovery_score(energy: int, soreness: int, stress: int, mood: int) -> float:
    """
    Compute recovery score from raw signals.
    All inputs are 1-10. Higher energy/mood = better. Higher soreness/stress = worse.
    """
    score = (
        energy * 12 +
        (10 - soreness) * 10 +
        (10 - stress) * 8 +
        mood * 10
    ) / 4
    return round(min(100, max(0, score)), 1)


@router.get("/today")
def get_today_recovery(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = datetime.utcnow().date()

    recovery = db.query(RecoveryLog).filter(
        RecoveryLog.user_id == current_user.id,
        func.date(RecoveryLog.date) == today
    ).order_by(desc(RecoveryLog.date)).first()

    sleep = db.query(SleepLog).filter(
        SleepLog.user_id == current_user.id,
        func.date(SleepLog.date) == today
    ).order_by(desc(SleepLog.date)).first()

    # Also check yesterday's sleep (it affects today)
    yesterday = today - timedelta(days=1)
    if not sleep:
        sleep = db.query(SleepLog).filter(
            SleepLog.user_id == current_user.id,
            func.date(SleepLog.date) == yesterday
        ).order_by(desc(SleepLog.date)).first()

    score = recovery.recovery_score if recovery else None

    if score is None:
        rec_text = "Log your sleep and energy to establish daily recovery readiness."
    else:
        rec_text = (
            "Rest day recommended" if score < 40 else
            "Light activity or recovery session" if score < 55 else
            "Moderate training is fine" if score < 70 else
            "Full training recommended"
        )

    return {
        "date": today.isoformat(),
        "recovery_score": score,
        "energy_level": recovery.energy_level if recovery else None,
        "soreness_level": recovery.soreness_level if recovery else None,
        "stress_level": recovery.stress_level if recovery else None,
        "mood": recovery.mood if recovery else None,
        "sleep_hours": sleep.duration_hours if sleep else None,
        "sleep_quality": sleep.quality if sleep else None,
        "recommendation": rec_text,
        "logged_today": recovery is not None,
    }


@router.post("/log")
def log_recovery(data: RecoveryLogCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    score = _compute_recovery_score(data.energy_level, data.soreness_level, data.stress_level, data.mood)
    log_date = datetime.strptime(data.date, "%Y-%m-%d") if data.date else datetime.utcnow()
    log = RecoveryLog(
        user_id=current_user.id,
        date=log_date,
        energy_level=data.energy_level,
        soreness_level=data.soreness_level,
        stress_level=data.stress_level,
        mood=data.mood,
        recovery_score=score,
        logged_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    return {"message": "Recovery logged", "recovery_score": score}


@router.post("/sleep/log")
def log_sleep(data: SleepLogCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log_date = datetime.strptime(data.date, "%Y-%m-%d") if data.date else datetime.utcnow()
    log = SleepLog(
        user_id=current_user.id,
        date=log_date,
        duration_hours=data.duration_hours,
        quality=data.quality,
        bedtime=data.bedtime,
        wake_time=data.wake_time,
        logged_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    return {"message": "Sleep logged", "duration_hours": data.duration_hours}


@router.get("/history")
def get_recovery_history(
    days: int = 14,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    cutoff = datetime.utcnow() - timedelta(days=days)
    recovery_logs = db.query(RecoveryLog).filter(
        RecoveryLog.user_id == current_user.id,
        RecoveryLog.date >= cutoff
    ).order_by(RecoveryLog.date).all()

    sleep_logs = db.query(SleepLog).filter(
        SleepLog.user_id == current_user.id,
        SleepLog.date >= cutoff
    ).order_by(SleepLog.date).all()

    return {
        "recovery": [{
            "date": r.date.date().isoformat(),
            "recovery_score": r.recovery_score,
            "energy_level": r.energy_level,
            "soreness_level": r.soreness_level,
            "stress_level": r.stress_level,
            "mood": r.mood,
        } for r in recovery_logs],
        "sleep": [{
            "date": s.date.date().isoformat(),
            "duration_hours": s.duration_hours,
            "quality": s.quality,
        } for s in sleep_logs],
    }
