"""
app.ml package — ML contracts, model registry, fatigue, and progress models.
"""
from app.ml.interfaces import (
    BaseFatigueModel,
    BaseProgressModel,
    FatigueFeatures,
    FatiguePrediction,
)
from app.ml.model_config import ml_config
from app.ml.registry import (
    get_fatigue_model,
    get_progress_model,
    register_fatigue_model,
    register_progress_model,
    list_registered_models,
)
from app.ml.fatigue import FatiguePredictor, WeightedInterpretableFatigueModel
from app.ml.progress import OLSProgressModel, forecast_pulse, compute_consistency_streak

__all__ = [
    "BaseFatigueModel",
    "BaseProgressModel",
    "FatigueFeatures",
    "FatiguePrediction",
    "ml_config",
    "get_fatigue_model",
    "get_progress_model",
    "register_fatigue_model",
    "register_progress_model",
    "list_registered_models",
    "FatiguePredictor",
    "WeightedInterpretableFatigueModel",
    "OLSProgressModel",
    "forecast_pulse",
    "compute_consistency_streak",
]
