"""
interfaces.py — Vision subsystem interfaces and contracts.

Ensures that pose estimators, posture analyzers, mobility analyzers, and repetition
analyzers can be replaced or upgraded independently.
"""
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional


class BasePoseExtractor(ABC):
    """Abstract interface for video/frame pose landmark extractors."""

    @abstractmethod
    def extract_from_video(self, video_path: str, max_frames: int = 150) -> Dict[str, Any]:
        """
        Extract pose landmarks and computed joint angles from a video file.
        Returns:
            Dict containing quality_passed, confidence, time_series, etc.
        """
        pass

    @abstractmethod
    def get_model_info(self) -> Dict[str, Any]:
        """Return model metadata, underlying framework, and version."""
        pass


class BasePostureAnalyzer(ABC):
    """Abstract interface for static and stance posture analysis."""

    @abstractmethod
    def analyze(self, time_series: List[Dict[str, Any]]) -> Dict[str, Any]:
        pass


class BaseMobilityAnalyzer(ABC):
    """Abstract interface for range-of-motion and joint mobility analysis."""

    @abstractmethod
    def analyze(self, time_series: List[Dict[str, Any]]) -> Dict[str, Any]:
        pass


class BaseMovementAnalyzer(ABC):
    """Abstract interface for kinetic repetition, cadence, and stability analysis."""

    @abstractmethod
    def analyze(
        self,
        time_series: List[Dict[str, Any]],
        posture_res: Dict[str, Any],
        mobility_res: Dict[str, Any]
    ) -> Dict[str, Any]:
        pass
