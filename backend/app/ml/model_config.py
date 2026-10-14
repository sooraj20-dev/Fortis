"""
model_config.py — Configuration and settings for selecting and fine-tuning ML models.

Supports configuring default models, hyperparameter bounds, and fallback strategies.
"""
import os
from typing import Dict, Any


class MLModelConfig:
    # Model selections (can be overridden via environment variables)
    FATIGUE_MODEL_NAME: str = os.getenv("FORTIS_FATIGUE_MODEL", "weighted_interpretable_v1")
    PROGRESS_MODEL_NAME: str = os.getenv("FORTIS_PROGRESS_MODEL", "ols_regression_v1")

    # Fatigue model default feature weights (must sum to 1.0)
    DEFAULT_FATIGUE_WEIGHTS: Dict[str, float] = {
        "rpe": 0.20,
        "frequency": 0.12,
        "sleep_hours": 0.20,
        "sleep_quality": 0.12,
        "soreness": 0.18,
        "energy": 0.10,
        "rest_days": 0.05,
        "volume": 0.03,
    }

    # Pulse formula weights when verified scan is present (sums to 1.0)
    PULSE_WEIGHTS_WITH_SCAN: Dict[str, float] = {
        "strength": 0.18,
        "recovery": 0.23,
        "consistency": 0.18,
        "nutrition": 0.14,
        "fatigue": 0.18,      # applied to (100 - fatigue_risk)
        "movement": 0.09,
    }

    # Default pulse formula weights when no scan exists (sums to 1.0)
    PULSE_WEIGHTS_DEFAULT: Dict[str, float] = {
        "strength": 0.20,
        "endurance": 0.10,
        "recovery": 0.20,
        "consistency": 0.25,
        "nutrition": 0.10,
        "mobility": 0.05,
        "readiness": 0.10,
    }


ml_config = MLModelConfig()
