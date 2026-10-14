"""
mobility_analysis.py — Functional joint mobility and range of motion (ROM) assessment.
"""
from typing import Dict, List, Any
import numpy as np
from app.vision.interfaces import BaseMobilityAnalyzer


class MobilityAnalyzer(BaseMobilityAnalyzer):
    """
    Evaluates dynamic range of motion (ROM) of hips, knees, and lower kinetic chain.
    """

    def analyze(self, time_series: List[Dict[str, Any]]) -> Dict[str, Any]:
        valid_frames = [f for f in time_series if f.get("has_pose") and f.get("angles")]

        if not valid_frames:
            return {
                "mobility": 50.0,
                "metrics": {
                    "max_knee_flexion_deg": 0.0,
                    "deepest_knee_angle_deg": 180.0,
                    "deepest_hip_angle_deg": 180.0,
                    "depth_asymmetry_deg": 0.0,
                    "depth_status": "Insufficient data",
                },
                "observations": [
                    {
                        "category": "MOBILITY",
                        "status": "ATTENTION",
                        "text": "Insufficient kinematic data to evaluate joint mobility",
                        "severity": "medium",
                    }
                ],
            }

        knee_angles = [f["angles"].get("avg_knee_flexion", 180.0) for f in valid_frames]
        l_knee_angles = [f["angles"].get("left_knee_flexion", 180.0) for f in valid_frames]
        r_knee_angles = [f["angles"].get("right_knee_flexion", 180.0) for f in valid_frames]
        l_hip_angles = [f["angles"].get("left_hip_angle", 180.0) for f in valid_frames]
        r_hip_angles = [f["angles"].get("right_hip_angle", 180.0) for f in valid_frames]

        min_knee_angle = float(np.min(knee_angles)) if knee_angles else 180.0

        min_l_hip = float(np.min(l_hip_angles)) if l_hip_angles else 180.0
        min_r_hip = float(np.min(r_hip_angles)) if r_hip_angles else 180.0
        min_avg_hip = (min_l_hip + min_r_hip) / 2.0

        # Find the frame where maximum squat depth was achieved to evaluate true bilateral asymmetry
        deepest_frame = min(valid_frames, key=lambda f: f["angles"].get("avg_knee_flexion", 180.0))
        depth_asymmetry = abs(
            deepest_frame["angles"].get("left_knee_flexion", 180.0) -
            deepest_frame["angles"].get("right_knee_flexion", 180.0)
        )

        # Score calculations (functional software scores, 0-100)
        # Deep squat knee angle is ~70°-85°, parallel is ~90°-95°, shallow is >110°.
        if min_knee_angle <= 85.0:
            knee_score = 92.0
            depth_status = "Full depth achieved"
        elif min_knee_angle <= 95.0:
            knee_score = 85.0
            depth_status = "Parallel depth achieved"
        elif min_knee_angle <= 110.0:
            knee_score = 70.0
            depth_status = "Moderate depth reached"
        else:
            knee_score = 55.0
            depth_status = "Partial range of motion"

        # Hip flexion score (smaller angle = greater flexion; ~75°-90° is optimal for squats)
        if min_avg_hip <= 85.0:
            hip_score = 90.0
        elif min_avg_hip <= 100.0:
            hip_score = 80.0
        elif min_avg_hip <= 115.0:
            hip_score = 68.0
        else:
            hip_score = 52.0

        asymmetry_penalty = min(20.0, depth_asymmetry * 1.5)
        overall_mobility = max(35.0, min(98.0, (knee_score * 0.55 + hip_score * 0.45) - asymmetry_penalty))

        observations = []

        if min_knee_angle <= 95.0:
            observations.append({
                "category": "MOBILITY",
                "status": "POSITIVE",
                "text": "Consistent squat depth achieved",
                "joint_affected": "knee",
                "severity": "low",
            })
        else:
            observations.append({
                "category": "MOBILITY",
                "status": "ATTENTION",
                "text": "Squat depth stops above parallel — limited ankle/hip flexion",
                "joint_affected": "hip",
                "severity": "medium",
            })

        if depth_asymmetry < 6.0:
            observations.append({
                "category": "MOBILITY",
                "status": "POSITIVE",
                "text": "Symmetrical bilateral range of motion across lower joints",
                "joint_affected": "knee",
                "severity": "low",
            })
        else:
            observations.append({
                "category": "MOBILITY",
                "status": "ATTENTION",
                "text": f"Slight left/right depth disparity ({depth_asymmetry:.1f}° difference)",
                "joint_affected": "knee",
                "severity": "low",
            })

        return {
            "mobility": round(overall_mobility, 1),
            "metrics": {
                "max_knee_flexion_deg": round(180.0 - min_knee_angle, 1),
                "deepest_knee_angle_deg": round(min_knee_angle, 1),
                "deepest_hip_angle_deg": round(min_avg_hip, 1),
                "depth_asymmetry_deg": round(depth_asymmetry, 1),
                "depth_status": depth_status,
            },
            "observations": observations,
        }
