"""
progress.py — Statistical trend-based progress forecasting.

Implements BaseProgressModel contract. Uses OLS linear regression on historical
FitnessState Fortis Pulse values to forecast trajectories and evaluate streaks.
"""
from typing import List, Dict, Any, Tuple
import statistics
from datetime import datetime, date, timedelta
from app.ml.interfaces import BaseProgressModel


def _linear_regression(x: List[float], y: List[float]) -> Tuple[float, float]:
    """Simple OLS linear regression. Returns (slope, intercept)."""
    n = len(x)
    if n < 2:
        return 0.0, y[0] if y else 50.0

    x_mean = statistics.mean(x)
    y_mean = statistics.mean(y)

    numerator = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
    denominator = sum((xi - x_mean) ** 2 for xi in x)

    if denominator == 0:
        return 0.0, y_mean

    slope = numerator / denominator
    intercept = y_mean - slope * x_mean
    return slope, intercept


class OLSProgressModel(BaseProgressModel):
    """
    Ordinary Least Squares (OLS) statistical trend progress model.
    """

    def __init__(self, version: str = "1.0.0"):
        self.version = version

    def forecast_pulse(
        self,
        pulse_history: List[float],
        days_ahead: int = 14
    ) -> Dict[str, Any]:
        """
        Forecast FORTIS PULSE for the next N days.
        """
        if not pulse_history or all(p is None for p in pulse_history):
            return {
                "current_trend": 0.0,
                "trend_label": "insufficient_data",
                "current_value": None,
                "forecast_7d": None,
                "forecast_14d": None,
                "confidence": 0.0,
                "data_points": 0,
                "model_version": self.version,
                "disclaimer": "Insufficient history for trajectory calculation.",
            }

        valid_history = [float(p) for p in pulse_history if p is not None]
        n = len(valid_history)
        if n == 0:
            return {
                "current_trend": 0.0,
                "trend_label": "insufficient_data",
                "current_value": None,
                "forecast_7d": None,
                "forecast_14d": None,
                "confidence": 0.0,
                "data_points": 0,
                "model_version": self.version,
                "disclaimer": "Insufficient history for trajectory calculation.",
            }

        x = [float(i) for i in range(n)]

        slope, intercept = _linear_regression(x, valid_history)

        current = valid_history[-1]
        forecast_7d = max(10.0, min(100.0, slope * (n + 7) + intercept))
        forecast_14d = max(10.0, min(100.0, slope * (n + 14) + intercept))

        # Trend categorization
        if slope > 0.25:
            trend_label = "improving"
        elif slope < -0.25:
            trend_label = "declining"
        else:
            trend_label = "stable"

        # Confidence based on historical data volume
        confidence = min(0.92, round(0.40 + (n / 30.0) * 0.50, 2))

        return {
            "current_trend": round(slope, 3),
            "trend_label": trend_label,
            "current_value": round(current, 1),
            "forecast_7d": round(forecast_7d, 1),
            "forecast_14d": round(forecast_14d, 1),
            "confidence": confidence,
            "data_points": n,
            "model_version": self.version,
            "disclaimer": "Estimated trajectory based on your personal historical data. Individual adaptation varies.",
        }

    def compute_consistency_streak(self, completed_dates: List[str]) -> int:
        """
        Count consecutive workout completion days ending today or yesterday.
        Safely parses ISO date strings and validates true consecutive calendar days.
        """
        if not completed_dates:
            return 0

        parsed_dates = set()
        for d in completed_dates:
            try:
                if isinstance(d, (datetime, date)):
                    parsed_dates.add(d.date() if isinstance(d, datetime) else d)
                elif isinstance(d, str):
                    clean_d = d.split("T")[0]
                    parsed_dates.add(datetime.strptime(clean_d, "%Y-%m-%d").date())
            except Exception:
                continue

        if not parsed_dates:
            return 0

        sorted_dates = sorted(parsed_dates, reverse=True)
        today = date.today()
        latest = sorted_dates[0]

        # Streak is active if latest workout was today or yesterday
        if (today - latest).days > 1:
            return 0

        streak = 1
        current = latest
        for d in sorted_dates[1:]:
            if (current - d).days == 1:
                streak += 1
                current = d
            elif (current - d).days == 0:
                continue  # duplicate day
            else:
                break

        return streak

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "name": "OLSProgressModel",
            "type": "ols_regression_v1",
            "version": self.version,
            "description": "Ordinary Least Squares linear regression progress trajectory model",
            "trainable": False,
        }


# Singleton default instance
_default_progress_model = OLSProgressModel()


# Backwards compatibility helper functions
def forecast_pulse(pulse_history: List[float], days_ahead: int = 14) -> dict:
    return _default_progress_model.forecast_pulse(pulse_history, days_ahead)


def compute_consistency_streak(completed_dates: List[str]) -> int:
    return _default_progress_model.compute_consistency_streak(completed_dates)
