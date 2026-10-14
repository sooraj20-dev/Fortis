"""
BaselineTracker — Tracks personal rolling averages per user per metric.
Uses Exponential Moving Average (EMA) with alpha=0.3.
Personal baseline is the key differentiator: Fortis compares you against
YOUR OWN history, not population norms.
"""
from sqlalchemy.orm import Session
from app.models.intelligence import UserBaseline
from datetime import datetime


ALPHA = 0.3  # EMA smoothing factor


class BaselineTracker:

    def get_baseline(self, user_id: int, metric_name: str, db: Session) -> float | None:
        record = db.query(UserBaseline).filter(
            UserBaseline.user_id == user_id,
            UserBaseline.metric_name == metric_name
        ).first()
        if record:
            return record.rolling_average
        return None

    def get_all_baselines(self, user_id: int, db: Session) -> dict:
        records = db.query(UserBaseline).filter(UserBaseline.user_id == user_id).all()
        return {r.metric_name: r.rolling_average for r in records}

    def update_baseline(self, user_id: int, metric_name: str, new_value: float, db: Session) -> float:
        record = db.query(UserBaseline).filter(
            UserBaseline.user_id == user_id,
            UserBaseline.metric_name == metric_name
        ).first()

        if record is None:
            # Initialize baseline with first value
            record = UserBaseline(
                user_id=user_id,
                metric_name=metric_name,
                rolling_average=new_value,
                sample_count=1,
                last_updated=datetime.utcnow()
            )
            db.add(record)
        else:
            # EMA update
            updated = ALPHA * new_value + (1 - ALPHA) * record.rolling_average
            record.rolling_average = round(updated, 3)
            record.sample_count += 1
            record.last_updated = datetime.utcnow()

        db.commit()
        db.refresh(record)
        return record.rolling_average

    def compute_delta(self, current: float, baseline: float | None) -> float:
        """Positive delta = above baseline (usually good for sleep/energy, bad for RPE)"""
        if baseline is None or baseline == 0:
            return 0.0
        return round(current - baseline, 2)

    def compute_pct_delta(self, current: float, baseline: float | None) -> float:
        """Percentage delta from baseline"""
        if baseline is None or baseline == 0:
            return 0.0
        return round((current - baseline) / baseline * 100, 1)
