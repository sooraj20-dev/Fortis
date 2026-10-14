"""
fatigue.py — Interpretable fatigue risk prediction model.

Implements BaseFatigueModel contract so it can be swapped out via registry
for other implementations (e.g., XGBoost, Random Forest, Neural Net) without
affecting FitnessStateCalculator or API routes.
"""
import logging
from typing import Dict, Any
from app.ml.interfaces import BaseFatigueModel, FatigueFeatures, FatiguePrediction
from app.ml.model_config import ml_config

logger = logging.getLogger(__name__)


# Feature normalization helpers
def _norm_rpe(rpe: float) -> float:
    """RPE 1-10 mapped smoothly to 0.0-1.0 fatigue contribution (1=minimal, 10=maximum)."""
    clamped_rpe = max(1.0, min(10.0, float(rpe)))
    return (clamped_rpe - 1.0) / 9.0


def _norm_freq(freq: int) -> float:
    """Workout frequency → fatigue (ideal 3-4/week, penalize high fatigue spikes)."""
    f = max(0, min(7, int(freq)))
    if f <= 2:
        return 0.10
    elif f <= 4:
        return 0.25 + (f - 2) * 0.12
    else:
        return 0.50 + (f - 4) * 0.16


def _norm_sleep(hours: float) -> float:
    """Sleep hours → fatigue contribution (lower sleep = more fatigue). Optimal ~8.5h."""
    h = max(3.0, min(12.0, float(hours)))
    if h >= 8.5:
        return max(0.0, 0.10 - (h - 8.5) * 0.02)
    return min(1.0, (8.5 - h) / 5.0)


def _norm_sleep_quality(quality: float) -> float:
    """Sleep quality 1-10 → fatigue (lower quality = more fatigue)."""
    q = max(1.0, min(10.0, float(quality)))
    return (10.0 - q) / 9.0


def _norm_soreness(soreness: float) -> float:
    """Soreness 1-10 → fatigue contribution (1=no soreness, 10=extreme soreness)."""
    s = max(1.0, min(10.0, float(soreness)))
    return (s - 1.0) / 9.0


def _norm_energy(energy: float) -> float:
    """Energy 1-10 → fatigue (1=exhausted, 10=high vitality; inverted for fatigue)."""
    e = max(1.0, min(10.0, float(energy)))
    return (10.0 - e) / 9.0


def _norm_rest(rest_days: int) -> float:
    """Rest days in last 3 days → fatigue (0 rest days = higher fatigue)."""
    r = max(0, min(3, int(rest_days)))
    return (3.0 - r) / 3.0


def _norm_volume(volume_min: float) -> float:
    """Training volume in last 7 days (minutes) → fatigue."""
    vol = max(0.0, float(volume_min))
    if vol <= 60.0:
        return 0.05
    return min(1.0, (vol - 60.0) / 300.0)


class WeightedInterpretableFatigueModel(BaseFatigueModel):
    """
    Interpretable weighted scoring fatigue prediction model.
    Provides complete traceability, feature importance, and explainability.
    """

    def __init__(self, weights: Dict[str, float] = None, version: str = "1.0.0"):
        self.weights = dict(weights or ml_config.DEFAULT_FATIGUE_WEIGHTS)
        # Normalize weights to ensure sum is strictly 1.0
        total_w = sum(self.weights.values()) or 1.0
        self.weights = {k: v / total_w for k, v in self.weights.items()}
        self.version = version

    def predict(self, features: FatigueFeatures) -> FatiguePrediction:
        components = {
            "rpe": _norm_rpe(features.recent_rpe_avg) * self.weights["rpe"],
            "frequency": _norm_freq(features.workout_frequency_7d) * self.weights["frequency"],
            "sleep_hours": _norm_sleep(features.sleep_avg_hours) * self.weights["sleep_hours"],
            "sleep_quality": _norm_sleep_quality(features.sleep_quality_avg) * self.weights["sleep_quality"],
            "soreness": _norm_soreness(features.soreness_avg) * self.weights["soreness"],
            "energy": _norm_energy(features.energy_avg) * self.weights["energy"],
            "rest_days": _norm_rest(features.rest_days_3d) * self.weights["rest_days"],
            "volume": _norm_volume(features.training_volume_7d) * self.weights["volume"],
        }

        raw_score = sum(components.values())
        # Clamped strictly between 0.0 and 100.0 (allows reaching full boundary range)
        fatigue_risk = round(min(100.0, max(0.0, raw_score * 100.0)), 1)

        # Contributing factors for explainability (percentage of total fatigue)
        denominator = max(raw_score, 0.0001)
        contributing = {
            k: round((v / denominator) * 100.0, 1)
            for k, v in components.items()
        }

        return FatiguePrediction(
            fatigue_risk=fatigue_risk,
            contributing_factors=contributing,
            model_type="weighted_interpretable_v1",
            model_version=self.version,
            confidence=0.88,
        )

    def get_feature_importance(self) -> Dict[str, float]:
        """Return model feature weights."""
        return dict(self.weights)

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "name": "WeightedInterpretableFatigueModel",
            "type": "weighted_interpretable_v1",
            "version": self.version,
            "description": "Multi-signal physiological weighted fatigue risk estimator",
            "features": list(self.weights.keys()),
            "weights": self.weights,
            "trainable": False,
        }


# Default alias for backwards compatibility
FatiguePredictor = WeightedInterpretableFatigueModel
