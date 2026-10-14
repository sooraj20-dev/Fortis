"""
registry.py — Registry for computer vision models and kinematic analyzers.
"""
import logging
from typing import Dict, Type, Optional, Any
from app.vision.interfaces import (
    BasePoseExtractor,
    BasePostureAnalyzer,
    BaseMobilityAnalyzer,
    BaseMovementAnalyzer,
)

logger = logging.getLogger(__name__)

_POSE_EXTRACTOR_REGISTRY: Dict[str, Type[BasePoseExtractor]] = {}
_POSTURE_ANALYZER_REGISTRY: Dict[str, Type[BasePostureAnalyzer]] = {}
_MOBILITY_ANALYZER_REGISTRY: Dict[str, Type[BaseMobilityAnalyzer]] = {}
_MOVEMENT_ANALYZER_REGISTRY: Dict[str, Type[BaseMovementAnalyzer]] = {}


def register_pose_extractor(name: str, cls: Type[BasePoseExtractor]) -> None:
    _POSE_EXTRACTOR_REGISTRY[name] = cls
    logger.info(f"Registered pose extractor '{name}'")


def register_posture_analyzer(name: str, cls: Type[BasePostureAnalyzer]) -> None:
    _POSTURE_ANALYZER_REGISTRY[name] = cls


def register_mobility_analyzer(name: str, cls: Type[BaseMobilityAnalyzer]) -> None:
    _MOBILITY_ANALYZER_REGISTRY[name] = cls


def register_movement_analyzer(name: str, cls: Type[BaseMovementAnalyzer]) -> None:
    _MOVEMENT_ANALYZER_REGISTRY[name] = cls


def get_pose_extractor(name: str = "mediapipe_tasks") -> BasePoseExtractor:
    from app.vision.body_scan import BodyScanExtractor
    cls = _POSE_EXTRACTOR_REGISTRY.get(name, BodyScanExtractor)
    return cls()


def get_posture_analyzer(name: str = "default") -> BasePostureAnalyzer:
    from app.vision.posture_analysis import PostureAnalyzer
    cls = _POSTURE_ANALYZER_REGISTRY.get(name, PostureAnalyzer)
    return cls()


def get_mobility_analyzer(name: str = "default") -> BaseMobilityAnalyzer:
    from app.vision.mobility_analysis import MobilityAnalyzer
    cls = _MOBILITY_ANALYZER_REGISTRY.get(name, MobilityAnalyzer)
    return cls()


def get_movement_analyzer(name: str = "default") -> BaseMovementAnalyzer:
    from app.vision.movement_analysis import MovementAnalyzer
    cls = _MOVEMENT_ANALYZER_REGISTRY.get(name, MovementAnalyzer)
    return cls()
