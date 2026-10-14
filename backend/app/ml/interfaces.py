"""
interfaces.py — Common model contracts and input/output definitions for Fortis ML models.

Separates model implementations from application business logic so that predictive,
fatigue, and progress models can be replaced or fine-tuned independently without
altering database models, API routes, or frontend components.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional


@dataclass
class FatigueFeatures:
    """Standard input contract for fatigue risk models."""
    recent_rpe_avg: float = 6.5          # 1.0 - 10.0
    workout_frequency_7d: int = 3         # 0 - 7
    sleep_avg_hours: float = 7.0          # hours
    sleep_quality_avg: float = 7.0        # 1.0 - 10.0
    soreness_avg: float = 4.0             # 1.0 - 10.0
    energy_avg: float = 6.5               # 1.0 - 10.0
    rest_days_3d: int = 1                 # 0 - 3
    training_volume_7d: float = 120.0     # total minutes


@dataclass
class FatiguePrediction:
    """Standard output contract for fatigue risk models."""
    fatigue_risk: float                   # Clamped 0.0 - 100.0
    contributing_factors: Dict[str, float] = field(default_factory=dict)
    model_type: str = "weighted_interpretable_v1"
    model_version: str = "1.0.0"
    confidence: float = 0.85


class BaseFatigueModel(ABC):
    """Abstract base class for all Fatigue Prediction models."""

    @abstractmethod
    def predict(self, features: FatigueFeatures) -> FatiguePrediction:
        """Compute fatigue risk from normalized user features."""
        pass

    @abstractmethod
    def get_feature_importance(self) -> Dict[str, float]:
        """Return relative weights or importance scores of features."""
        pass

    @abstractmethod
    def get_model_info(self) -> Dict[str, Any]:
        """Return metadata describing the model architecture, version, and capabilities."""
        pass


class BaseProgressModel(ABC):
    """Abstract base class for Progress Forecasting models."""

    @abstractmethod
    def forecast_pulse(
        self,
        pulse_history: List[float],
        days_ahead: int = 14
    ) -> Dict[str, Any]:
        """
        Forecast Fortis Pulse trajectory for the next N days.
        Returns:
            - current_trend: float (slope)
            - trend_label: 'improving' | 'stable' | 'declining' | 'insufficient_data'
            - current_value: float
            - forecast_7d: float
            - forecast_14d: float
            - confidence: float (0.0 - 1.0)
            - data_points: int
            - model_version: str
        """
        pass

    @abstractmethod
    def compute_consistency_streak(self, completed_dates: List[str]) -> int:
        """Count current consecutive days with completed workouts."""
        pass

    @abstractmethod
    def get_model_info(self) -> Dict[str, Any]:
        """Return metadata describing the progress model."""
        pass
