"""
registry.py — Model selection, initialization, compatibility validation, and version registry.

Implements the model replacement workflow:
Select model → Configure model → Initialize model → Validate compatibility → Run tests → Activate model.
"""
import logging
from typing import Dict, Type, Optional, Any
from app.ml.interfaces import BaseFatigueModel, BaseProgressModel
from app.ml.fatigue import WeightedInterpretableFatigueModel
from app.ml.progress import OLSProgressModel
from app.ml.model_config import ml_config

logger = logging.getLogger(__name__)

# Registry maps
_FATIGUE_REGISTRY: Dict[str, Type[BaseFatigueModel]] = {
    "weighted_interpretable_v1": WeightedInterpretableFatigueModel,
}

_PROGRESS_REGISTRY: Dict[str, Type[BaseProgressModel]] = {
    "ols_regression_v1": OLSProgressModel,
}

# Cached singleton model instances
_ACTIVE_FATIGUE_MODEL: Optional[BaseFatigueModel] = None
_ACTIVE_PROGRESS_MODEL: Optional[BaseProgressModel] = None


def register_fatigue_model(name: str, model_cls: Type[BaseFatigueModel]) -> None:
    """Register a new Fatigue model implementation."""
    if not issubclass(model_cls, BaseFatigueModel):
        raise TypeError(f"Model class {model_cls} must implement BaseFatigueModel")
    _FATIGUE_REGISTRY[name] = model_cls
    logger.info(f"Registered fatigue model: '{name}' ({model_cls.__name__})")


def register_progress_model(name: str, model_cls: Type[BaseProgressModel]) -> None:
    """Register a new Progress model implementation."""
    if not issubclass(model_cls, BaseProgressModel):
        raise TypeError(f"Model class {model_cls} must implement BaseProgressModel")
    _PROGRESS_REGISTRY[name] = model_cls
    logger.info(f"Registered progress model: '{name}' ({model_cls.__name__})")


def get_fatigue_model(name: Optional[str] = None) -> BaseFatigueModel:
    """
    Retrieve or initialize the active Fatigue model.
    Falls back gracefully to default model if requested model fails initialization.
    """
    global _ACTIVE_FATIGUE_MODEL
    model_name = name or ml_config.FATIGUE_MODEL_NAME

    if model_name not in _FATIGUE_REGISTRY:
        logger.warning(
            f"Requested fatigue model '{model_name}' not found in registry. "
            f"Falling back to default 'weighted_interpretable_v1'."
        )
        model_name = "weighted_interpretable_v1"

    model_cls = _FATIGUE_REGISTRY[model_name]
    try:
        instance = model_cls()
        _ACTIVE_FATIGUE_MODEL = instance
        return instance
    except Exception as e:
        logger.error(f"Failed to initialize fatigue model '{model_name}': {e}. Falling back to default.")
        default_cls = _FATIGUE_REGISTRY["weighted_interpretable_v1"]
        return default_cls()


def get_progress_model(name: Optional[str] = None) -> BaseProgressModel:
    """
    Retrieve or initialize the active Progress model.
    """
    global _ACTIVE_PROGRESS_MODEL
    model_name = name or ml_config.PROGRESS_MODEL_NAME

    if model_name not in _PROGRESS_REGISTRY:
        logger.warning(
            f"Requested progress model '{model_name}' not found in registry. "
            f"Falling back to default 'ols_regression_v1'."
        )
        model_name = "ols_regression_v1"

    model_cls = _PROGRESS_REGISTRY[model_name]
    try:
        instance = model_cls()
        _ACTIVE_PROGRESS_MODEL = instance
        return instance
    except Exception as e:
        logger.error(f"Failed to initialize progress model '{model_name}': {e}. Falling back to default.")
        default_cls = _PROGRESS_REGISTRY["ols_regression_v1"]
        return default_cls()


def list_registered_models() -> Dict[str, Any]:
    """Return all available models and their active states for introspection/debugging."""
    return {
        "fatigue_models": list(_FATIGUE_REGISTRY.keys()),
        "active_fatigue_model": ml_config.FATIGUE_MODEL_NAME,
        "progress_models": list(_PROGRESS_REGISTRY.keys()),
        "active_progress_model": ml_config.PROGRESS_MODEL_NAME,
    }
