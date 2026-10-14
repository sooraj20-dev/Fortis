"""
body_scan.py — Video frame ingestion, MediaPipe Pose Landmarker Tasks API, quality checks, and joint angle computation.
Migrated to modern MediaPipe Tasks API for Python 3.11/3.14 compatibility on Windows x64.
"""
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from typing import Dict, List, Any, Tuple, Optional, Union
import os
import math
import logging
from pathlib import Path

from app.vision.interfaces import BasePoseExtractor

logger = logging.getLogger(__name__)

# Default model path relative to this file
DEFAULT_MODEL_PATH = Path(__file__).resolve().parent / "models" / "pose_landmarker.task"
OFFICIAL_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"


def calculate_angle_2d(a: Tuple[float, float], b: Tuple[float, float], c: Tuple[float, float]) -> float:
    """
    Calculate the angle at vertex b (in degrees) given points a, b, c.
    Points are (x, y) coordinates.
    """
    ba = np.array([a[0] - b[0], a[1] - b[1]], dtype=np.float64)
    bc = np.array([c[0] - b[0], c[1] - b[1]], dtype=np.float64)

    norm_ba = float(np.linalg.norm(ba))
    norm_bc = float(np.linalg.norm(bc))

    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 180.0

    cosine_angle = float(np.dot(ba, bc) / (norm_ba * norm_bc))
    cosine_angle = max(-1.0, min(1.0, cosine_angle))
    angle = np.arccos(cosine_angle)
    return float(np.degrees(angle))


def calculate_vertical_angle(top: Tuple[float, float], bottom: Tuple[float, float]) -> float:
    """
    Calculate angle of vector (bottom -> top) relative to vertical (upwards is 0 degrees).
    """
    dx = top[0] - bottom[0]
    dy = bottom[1] - top[1]  # Inverted Y in image coordinates (top has smaller Y)
    angle_rad = math.atan2(abs(dx), max(dy, 1e-6))
    return float(math.degrees(angle_rad))


class BodyScanExtractor(BasePoseExtractor):
    """
    Processes video frames with MediaPipe Pose Landmarker Tasks API and performs quality validation.
    Compatible with Python 3.11+ and Windows x64.
    """

    def __init__(
        self,
        model_path: Optional[Union[str, Path]] = None,
        min_detection_confidence: float = 0.5,
        min_tracking_confidence: float = 0.5,
    ):
        self.min_detection_confidence = min_detection_confidence
        self.min_tracking_confidence = min_tracking_confidence

        # Resolve model path via parameter, environment variable, or default location
        if model_path is not None:
            self.model_path = Path(model_path)
        elif os.environ.get("FORTIS_POSE_MODEL_PATH"):
            self.model_path = Path(os.environ["FORTIS_POSE_MODEL_PATH"])
        else:
            self.model_path = DEFAULT_MODEL_PATH

        self._ensure_model_exists()

        try:
            base_options = python.BaseOptions(model_asset_path=str(self.model_path.resolve()))
            options = vision.PoseLandmarkerOptions(
                base_options=base_options,
                running_mode=vision.RunningMode.IMAGE,
                min_pose_detection_confidence=self.min_detection_confidence,
                min_tracking_confidence=self.min_tracking_confidence,
            )
            self.landmarker = vision.PoseLandmarker.create_from_options(options)
            logger.info(f"MediaPipe PoseLandmarker initialized successfully using {self.model_path}")
        except Exception as e:
            logger.error(f"Failed to initialize MediaPipe PoseLandmarker from {self.model_path}: {e}")
            raise

    def _ensure_model_exists(self) -> None:
        """
        Verify that the model file exists, or attempt download from the official MediaPipe repository.
        """
        if self.model_path.exists():
            return

        # Attempt auto-download for default model location if missing
        if self.model_path == DEFAULT_MODEL_PATH:
            logger.info(f"Pose model not found at {self.model_path}. Attempting to download official model...")
            try:
                self.model_path.parent.mkdir(parents=True, exist_ok=True)
                import urllib.request
                urllib.request.urlretrieve(OFFICIAL_MODEL_URL, str(self.model_path))
                logger.info(f"Pose model downloaded successfully to {self.model_path}.")
            except Exception as e:
                logger.error(f"Failed to auto-download pose model: {e}")

        if not self.model_path.exists():
            raise FileNotFoundError(f"Pose model not found: {self.model_path}")

    def extract_from_video(self, video_path: str, max_frames: int = 150) -> Dict[str, Any]:
        """
        Reads video file, samples frames, extracts pose landmarks, and computes joint angles.
        """
        if not os.path.exists(video_path):
            return {
                "quality_passed": False,
                "confidence": 0.0,
                "error": f"Video file not found: {video_path}",
                "time_series": [],
            }

        try:
            cap = cv2.VideoCapture(video_path)
            if not cap.isOpened():
                return {
                    "quality_passed": False,
                    "confidence": 0.0,
                    "error": "Unable to open video stream",
                    "time_series": [],
                }
        except Exception as e:
            logger.error(f"VideoCapture exception on {video_path}: {e}")
            return {
                "quality_passed": False,
                "confidence": 0.0,
                "error": f"Unable to open video stream: {e}",
                "time_series": [],
            }

        total_video_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

        # Sample frames evenly if video has more than max_frames
        step = max(1, total_video_frames // max_frames)

        frame_idx = 0
        extracted_frames = []
        valid_frames_count = 0
        brightness_list = []
        confidences = []

        # Key landmark indices in MediaPipe Pose
        # 11: left_shoulder, 12: right_shoulder
        # 23: left_hip, 24: right_hip
        # 25: left_knee, 26: right_knee
        # 27: left_ankle, 28: right_ankle
        key_indices = [11, 12, 23, 24, 25, 26, 27, 28]

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % step == 0:
                    try:
                        # Frame lighting check (mean grayscale brightness)
                        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                        mean_brightness = float(np.mean(gray))
                        brightness_list.append(mean_brightness)

                        # MediaPipe Tasks API requires RGB Image
                        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
                        results = self.landmarker.detect(mp_image)

                        frame_data: Dict[str, Any] = {
                            "frame_index": frame_idx,
                            "timestamp": round(frame_idx / fps, 2),
                            "brightness": mean_brightness,
                            "has_pose": False,
                            "confidence": 0.0,
                            "angles": {},
                            "landmarks": {},
                        }

                        if results.pose_landmarks and len(results.pose_landmarks) > 0:
                            landmarks = results.pose_landmarks[0]

                            # Check key landmarks visibility / presence
                            visibilities = []
                            for idx in key_indices:
                                if idx < len(landmarks):
                                    lm = landmarks[idx]
                                    vis = float(lm.visibility) if lm.visibility is not None else (
                                        float(lm.presence) if lm.presence is not None else 1.0
                                    )
                                    visibilities.append(vis)

                            avg_vis = float(np.mean(visibilities)) if visibilities else 0.0
                            confidences.append(avg_vis)

                            # Store normalized coordinates of key points
                            lm_dict = {}
                            for idx, name in [
                                (0, "nose"),
                                (11, "left_shoulder"),
                                (12, "right_shoulder"),
                                (23, "left_hip"),
                                (24, "right_hip"),
                                (25, "left_knee"),
                                (26, "right_knee"),
                                (27, "left_ankle"),
                                (28, "right_ankle"),
                            ]:
                                if idx < len(landmarks):
                                    lm = landmarks[idx]
                                    vis = float(lm.visibility) if lm.visibility is not None else (
                                        float(lm.presence) if lm.presence is not None else 1.0
                                    )
                                    lm_dict[name] = {
                                        "x": float(lm.x),
                                        "y": float(lm.y),
                                        "z": float(lm.z),
                                        "visibility": vis,
                                    }

                            frame_data["landmarks"] = lm_dict
                            frame_data["confidence"] = avg_vis

                            # Validate key landmarks for angle computation (require individual confidence >= 0.35)
                            def has_valid_lm(name: str) -> bool:
                                return name in lm_dict and lm_dict[name].get("visibility", 0.0) >= 0.35

                            has_left_leg = has_valid_lm("left_hip") and has_valid_lm("left_knee") and has_valid_lm("left_ankle")
                            has_right_leg = has_valid_lm("right_hip") and has_valid_lm("right_knee") and has_valid_lm("right_ankle")
                            has_left_torso = has_valid_lm("left_shoulder") and has_valid_lm("left_hip") and has_valid_lm("left_knee")
                            has_right_torso = has_valid_lm("right_shoulder") and has_valid_lm("right_hip") and has_valid_lm("right_knee")

                            if avg_vis >= 0.40 and (has_left_leg or has_right_leg):
                                frame_data["has_pose"] = True
                                valid_frames_count += 1

                                # Calculate angles with individual landmark verification
                                l_hip = (lm_dict["left_hip"]["x"], lm_dict["left_hip"]["y"]) if has_valid_lm("left_hip") else None
                                l_knee = (lm_dict["left_knee"]["x"], lm_dict["left_knee"]["y"]) if has_valid_lm("left_knee") else None
                                l_ankle = (lm_dict["left_ankle"]["x"], lm_dict["left_ankle"]["y"]) if has_valid_lm("left_ankle") else None

                                r_hip = (lm_dict["right_hip"]["x"], lm_dict["right_hip"]["y"]) if has_valid_lm("right_hip") else None
                                r_knee = (lm_dict["right_knee"]["x"], lm_dict["right_knee"]["y"]) if has_valid_lm("right_knee") else None
                                r_ankle = (lm_dict["right_ankle"]["x"], lm_dict["right_ankle"]["y"]) if has_valid_lm("right_ankle") else None

                                l_shoulder = (lm_dict["left_shoulder"]["x"], lm_dict["left_shoulder"]["y"]) if has_valid_lm("left_shoulder") else None
                                r_shoulder = (lm_dict["right_shoulder"]["x"], lm_dict["right_shoulder"]["y"]) if has_valid_lm("right_shoulder") else None

                                l_knee_angle = calculate_angle_2d(l_hip, l_knee, l_ankle) if has_left_leg else None
                                r_knee_angle = calculate_angle_2d(r_hip, r_knee, r_ankle) if has_right_leg else None

                                # Average knee flexion handling missing sides
                                if l_knee_angle is not None and r_knee_angle is not None:
                                    avg_knee_flexion = (l_knee_angle + r_knee_angle) / 2.0
                                elif l_knee_angle is not None:
                                    avg_knee_flexion = l_knee_angle
                                    r_knee_angle = l_knee_angle
                                elif r_knee_angle is not None:
                                    avg_knee_flexion = r_knee_angle
                                    l_knee_angle = r_knee_angle
                                else:
                                    avg_knee_flexion = 180.0
                                    l_knee_angle = 180.0
                                    r_knee_angle = 180.0

                                l_hip_angle = calculate_angle_2d(l_shoulder, l_hip, l_knee) if has_left_torso else None
                                r_hip_angle = calculate_angle_2d(r_shoulder, r_hip, r_knee) if has_right_torso else None

                                if l_hip_angle is None and r_hip_angle is not None:
                                    l_hip_angle = r_hip_angle
                                elif r_hip_angle is None and l_hip_angle is not None:
                                    r_hip_angle = l_hip_angle
                                elif l_hip_angle is None and r_hip_angle is None:
                                    l_hip_angle = 170.0
                                    r_hip_angle = 170.0

                                # Torso vertical inclination (mid-hip to mid-shoulder)
                                if l_hip and r_hip and l_shoulder and r_shoulder:
                                    mid_hip = ((l_hip[0] + r_hip[0]) / 2, (l_hip[1] + r_hip[1]) / 2)
                                    mid_shoulder = ((l_shoulder[0] + r_shoulder[0]) / 2, (l_shoulder[1] + r_shoulder[1]) / 2)
                                    torso_lean = calculate_vertical_angle(mid_shoulder, mid_hip)
                                elif l_hip and l_shoulder:
                                    torso_lean = calculate_vertical_angle(l_shoulder, l_hip)
                                elif r_hip and r_shoulder:
                                    torso_lean = calculate_vertical_angle(r_shoulder, r_hip)
                                else:
                                    torso_lean = 6.0

                                # Scale-invariant symmetry indicators
                                # Normalizing height differential by horizontal distance gives scale-invariant percentage and angle in degrees
                                if l_shoulder and r_shoulder:
                                    sh_dx = abs(r_shoulder[0] - l_shoulder[0])
                                    sh_dy = abs(r_shoulder[1] - l_shoulder[1])
                                    sh_dist = math.hypot(sh_dx, sh_dy)
                                    shoulder_tilt = (sh_dy / max(sh_dist, 1e-4)) * 100.0
                                else:
                                    shoulder_tilt = 0.5

                                if l_hip and r_hip:
                                    hip_dx = abs(r_hip[0] - l_hip[0])
                                    hip_dy = abs(r_hip[1] - l_hip[1])
                                    hip_dist = math.hypot(hip_dx, hip_dy)
                                    hip_tilt = (hip_dy / max(hip_dist, 1e-4)) * 100.0
                                else:
                                    hip_tilt = 0.5

                                frame_data["angles"] = {
                                    "left_knee_flexion": round(l_knee_angle, 1),
                                    "right_knee_flexion": round(r_knee_angle, 1),
                                    "avg_knee_flexion": round(avg_knee_flexion, 1),
                                    "left_hip_angle": round(l_hip_angle, 1),
                                    "right_hip_angle": round(r_hip_angle, 1),
                                    "torso_inclination": round(torso_lean, 1),
                                    "shoulder_tilt": round(shoulder_tilt, 2),
                                    "hip_tilt": round(hip_tilt, 2),
                                }

                        extracted_frames.append(frame_data)
                        if len(extracted_frames) >= max_frames:
                            break
                    except Exception as frame_err:
                        logger.warning(f"Error processing frame {frame_idx}: {frame_err}")
                        continue

                frame_idx += 1
        finally:
            cap.release()

        # Quality Check Pipeline
        total_extracted = len(extracted_frames)
        valid_ratio = valid_frames_count / max(total_extracted, 1)
        avg_confidence = float(np.mean(confidences)) if confidences else 0.0
        avg_brightness = float(np.mean(brightness_list)) if brightness_list else 0.0

        quality_passed = True
        reasons = []

        if avg_brightness < 25:
            quality_passed = False
            reasons.append("Lighting too dark; please ensure adequate ambient lighting")
        elif avg_brightness > 240:
            quality_passed = False
            reasons.append("Excessive glare or overexposure detected")

        if valid_ratio < 0.35:
            quality_passed = False
            reasons.append("Subject not clearly framed; ensure full head-to-toe visibility")

        if avg_confidence < 0.40:
            quality_passed = False
            reasons.append("Low pose confidence; keep camera steady and avoid loose-fitting obstructions")

        return {
            "quality_passed": quality_passed,
            "quality_reasons": reasons,
            "confidence": round(avg_confidence * 100, 1),
            "valid_ratio": round(valid_ratio, 2),
            "avg_brightness": round(avg_brightness, 1),
            "frames_analyzed": total_extracted,
            "valid_frames": valid_frames_count,
            "time_series": extracted_frames,
        }

    def get_model_info(self) -> Dict[str, Any]:
        return {
            "name": "BodyScanExtractor",
            "type": "mediapipe_pose_landmarker_tasks",
            "model_path": str(self.model_path),
            "framework": "MediaPipe Tasks Vision v0.10+",
            "running_mode": "IMAGE",
            "min_detection_confidence": self.min_detection_confidence,
            "min_tracking_confidence": self.min_tracking_confidence,
        }

    def close(self) -> None:
        """Release PoseLandmarker resources."""
        if hasattr(self, "landmarker") and self.landmarker is not None:
            try:
                self.landmarker.close()
            except Exception as e:
                logger.warning(f"Error closing PoseLandmarker: {e}")
            self.landmarker = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
