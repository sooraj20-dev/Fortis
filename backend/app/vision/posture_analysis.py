"""
posture_analysis.py — Front and side static/quasi-static posture and alignment analysis.
"""
from typing import Dict, List, Any
import numpy as np
from app.vision.interfaces import BasePostureAnalyzer


class PostureAnalyzer(BasePostureAnalyzer):
    """
    Analyzes frontal and sagittal posture symmetry, alignment, and balance.
    """

    def analyze(self, time_series: List[Dict[str, Any]]) -> Dict[str, Any]:
        valid_frames = [f for f in time_series if f.get("has_pose") and f.get("angles")]

        if not valid_frames:
            return {
                "symmetry_indicator": 50.0,
                "posture_score": 50.0,
                "metrics": {
                    "posture_score": 50.0,
                    "symmetry_indicator": 50.0,
                    "shoulder_tilt_pct": 0.0,
                    "hip_tilt_pct": 0.0,
                    "torso_inclination_deg": 0.0,
                    "stance_to_shoulder_ratio": 1.1,
                },
                "observations": [
                    {
                        "category": "SYMMETRY",
                        "status": "ATTENTION",
                        "text": "Insufficient pose data for precise posture assessment",
                        "severity": "medium",
                    }
                ],
            }

        # Analyze first 20-30% of frames as starting posture stance
        baseline_frames = valid_frames[:max(3, len(valid_frames) // 3)]

        shoulder_tilts = [f["angles"].get("shoulder_tilt", 0.0) for f in baseline_frames]
        hip_tilts = [f["angles"].get("hip_tilt", 0.0) for f in baseline_frames]
        torso_leans = [f["angles"].get("torso_inclination", 0.0) for f in baseline_frames]

        avg_shoulder_tilt = float(np.mean(shoulder_tilts)) if shoulder_tilts else 0.0
        avg_hip_tilt = float(np.mean(hip_tilts)) if hip_tilts else 0.0
        avg_torso_lean = float(np.mean(torso_leans)) if torso_leans else 0.0

        # Check stance width: ankle distance vs shoulder distance
        stance_ratios = []
        for f in baseline_frames:
            lms = f.get("landmarks", {})
            if "left_shoulder" in lms and "right_shoulder" in lms and "left_ankle" in lms and "right_ankle" in lms:
                sh_dist = abs(lms["left_shoulder"]["x"] - lms["right_shoulder"]["x"])
                ak_dist = abs(lms["left_ankle"]["x"] - lms["right_ankle"]["x"])
                if sh_dist > 1e-4:
                    stance_ratios.append(ak_dist / sh_dist)

        avg_stance_ratio = float(np.mean(stance_ratios)) if stance_ratios else 1.1

        # Calculate symmetry indicator (0 - 100)
        # Scale-invariant tilt percentages: <2% is normal, >6% is noticeable asymmetry
        symmetry_penalty = (avg_shoulder_tilt * 4.0) + (avg_hip_tilt * 4.5)
        symmetry_indicator = max(40.0, min(98.0, 96.0 - symmetry_penalty))

        # Posture alignment score (0 - 100)
        torso_penalty = max(0.0, avg_torso_lean - 5.0) * 1.5
        posture_score = max(40.0, min(98.0, 92.0 - torso_penalty - (avg_shoulder_tilt * 2.5)))

        observations = []

        # Symmetry observations
        if avg_shoulder_tilt < 2.0 and avg_hip_tilt < 2.0:
            observations.append({
                "category": "SYMMETRY",
                "status": "POSITIVE",
                "text": "Balanced bilateral shoulder and pelvic symmetry",
                "joint_affected": "shoulder",
                "severity": "low",
            })
        elif avg_shoulder_tilt >= 3.5:
            observations.append({
                "category": "SYMMETRY",
                "status": "ATTENTION",
                "text": "Slight shoulder level asymmetry detected in stance",
                "joint_affected": "shoulder",
                "severity": "low",
            })

        if avg_hip_tilt >= 3.5:
            observations.append({
                "category": "SYMMETRY",
                "status": "ATTENTION",
                "text": "Minor pelvic lateral tilt detected",
                "joint_affected": "hip",
                "severity": "medium",
            })

        # Torso alignment
        if avg_torso_lean < 12.0:
            observations.append({
                "category": "POSTURE",
                "status": "POSITIVE",
                "text": "Upright thoracic and spinal alignment maintained",
                "joint_affected": "spine",
                "severity": "low",
            })
        else:
            observations.append({
                "category": "POSTURE",
                "status": "ATTENTION",
                "text": "Forward torso pitch observed during static setup",
                "joint_affected": "torso",
                "severity": "medium",
            })

        # Stance width
        if 0.9 <= avg_stance_ratio <= 1.4:
            observations.append({
                "category": "POSTURE",
                "status": "POSITIVE",
                "text": "Optimal shoulder-width athletic base",
                "joint_affected": "ankle",
                "severity": "low",
            })

        rounded_posture_score = round(posture_score, 1)
        rounded_symmetry = round(symmetry_indicator, 1)

        return {
            "symmetry_indicator": rounded_symmetry,
            "posture_score": rounded_posture_score,
            "metrics": {
                "posture_score": rounded_posture_score,
                "symmetry_indicator": rounded_symmetry,
                "shoulder_tilt_pct": round(avg_shoulder_tilt, 2),
                "hip_tilt_pct": round(avg_hip_tilt, 2),
                "torso_inclination_deg": round(avg_torso_lean, 1),
                "stance_to_shoulder_ratio": round(avg_stance_ratio, 2),
            },
            "observations": observations,
        }
