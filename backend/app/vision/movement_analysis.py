"""
movement_analysis.py — Dynamic movement tracking, repetition segmentation, stability, and consistency analysis.
"""
from typing import Dict, List, Any
import numpy as np
from app.vision.interfaces import BaseMovementAnalyzer


class MovementAnalyzer(BaseMovementAnalyzer):
    """
    Analyzes dynamic repetition kinetics: stability, cadence consistency, and movement quality.
    """

    def analyze(
        self,
        time_series: List[Dict[str, Any]],
        posture_res: Dict[str, Any],
        mobility_res: Dict[str, Any]
    ) -> Dict[str, Any]:
        valid_frames = [f for f in time_series if f.get("has_pose") and f.get("angles")]

        if not valid_frames or len(valid_frames) < 10:
            return {
                "movement_quality": 50.0,
                "stability": 50.0,
                "movement_consistency": 50.0,
                "squat_movement_score": 50.0,
                "metrics": {
                    "detected_reps": 1,
                    "torso_variance_deg": 0.0,
                    "torso_total_range_deg": 0.0,
                    "knee_wobble_index": 2.0,
                },
                "observations": [
                    {
                        "category": "MOVEMENT",
                        "status": "ATTENTION",
                        "text": "Insufficient movement repetitions detected for kinetic analysis",
                        "severity": "medium",
                    }
                ],
            }

        knee_angles = np.array([f["angles"].get("avg_knee_flexion", 180.0) for f in valid_frames])
        torso_leans = np.array([f["angles"].get("torso_inclination", 0.0) for f in valid_frames])
        timestamps = np.array([f.get("timestamp", 0.0) for f in valid_frames])

        # Repetition detection via knee angle minima
        # In a squat, standing is ~160°-180°, bottom is <125°.
        # We find inflection troughs with smoothing (window size 5)
        kernel_size = min(5, len(knee_angles))
        smoothed_knee = np.convolve(knee_angles, np.ones(kernel_size) / kernel_size, mode="same")
        rep_inflections = []
        in_rep = False
        min_in_rep = 180.0
        min_idx = 0

        for i, val in enumerate(smoothed_knee):
            if val < 130.0 and not in_rep:
                in_rep = True
                min_in_rep = val
                min_idx = i
            elif in_rep:
                if val < min_in_rep:
                    min_in_rep = val
                    min_idx = i
                elif val > 145.0:
                    # Completed a rep cycle
                    rep_inflections.append((min_idx, min_in_rep, timestamps[min_idx]))
                    in_rep = False
                    min_in_rep = 180.0

        # If sequence ended near the bottom of a rep
        if in_rep and min_in_rep < 125.0:
            rep_inflections.append((min_idx, min_in_rep, timestamps[min_idx]))

        num_reps = max(1, len(rep_inflections))

        # Stability: analyze torso lean deviation and lateral knee jitter
        torso_variance = float(np.std(torso_leans))
        torso_range = float(np.ptp(torso_leans))

        # Check knee wobble: normalize knee separation by hip width in each frame for scale invariance
        norm_knee_wobbles = []
        for f in valid_frames:
            lms = f.get("landmarks", {})
            if "left_knee" in lms and "right_knee" in lms:
                knee_dist = abs(lms["left_knee"]["x"] - lms["right_knee"]["x"])
                hip_dist = 0.20
                if "left_hip" in lms and "right_hip" in lms:
                    hip_dist = max(1e-4, abs(lms["left_hip"]["x"] - lms["right_hip"]["x"]))
                norm_knee_wobbles.append(knee_dist / hip_dist)

        knee_wobble_std = float(np.std(norm_knee_wobbles)) if norm_knee_wobbles else 0.03

        # Stability Score (0 - 100)
        # Moderate torso lean variance and low knee wobble = high stability
        stability_base = 86.0
        stability_penalty = (torso_variance * 2.0) + (knee_wobble_std * 120.0)
        stability_score = max(40.0, min(96.0, stability_base - stability_penalty))

        # Consistency Score (0 - 100)
        # Variance of depth across repetitions and temporal spacing
        if len(rep_inflections) >= 2:
            rep_depths = [r[1] for r in rep_inflections]
            depth_std = float(np.std(rep_depths))
            rep_times = [r[2] for r in rep_inflections]
            cadence_std = float(np.std(np.diff(rep_times))) if len(rep_times) > 2 else 0.3
            consistency_penalty = (depth_std * 1.5) + (cadence_std * 12.0)
            movement_consistency = max(45.0, min(97.0, 92.0 - consistency_penalty))
        else:
            # Single rep detected: base consistency on smoothness
            movement_consistency = max(55.0, min(90.0, 82.0 - (torso_variance * 1.5)))

        # Squat Movement Score
        mobility_val = mobility_res.get("mobility", 65.0)
        posture_val = posture_res.get("posture_score", 70.0)
        squat_movement_score = round(
            (mobility_val * 0.40) + (stability_score * 0.35) + (movement_consistency * 0.25),
            1
        )

        # Movement Quality (Overall flagship indicator)
        symmetry_val = posture_res.get("symmetry_indicator", 75.0)
        movement_quality = round(
            (squat_movement_score * 0.50) +
            (stability_score * 0.20) +
            (mobility_val * 0.15) +
            (symmetry_val * 0.15),
            1
        )

        observations = []

        # Lower-body stability observation
        if knee_wobble_std < 0.05:
            observations.append({
                "category": "STABILITY",
                "status": "POSITIVE",
                "text": "Stable lower-body movement",
                "joint_affected": "knee",
                "severity": "low",
            })
        else:
            observations.append({
                "category": "STABILITY",
                "status": "ATTENTION",
                "text": "Subtle lateral knee movement during concentric phase",
                "joint_affected": "knee",
                "severity": "medium",
            })

        # Torso position observation
        if torso_range > 16.0 or torso_variance > 5.5:
            observations.append({
                "category": "STABILITY",
                "status": "ATTENTION",
                "text": "Torso position changes during descent",
                "joint_affected": "torso",
                "severity": "medium",
            })
        else:
            observations.append({
                "category": "STABILITY",
                "status": "POSITIVE",
                "text": "Torso angle remains consistent throughout descent and drive",
                "joint_affected": "torso",
                "severity": "low",
            })

        # Consistency observation
        if movement_consistency >= 75.0:
            observations.append({
                "category": "CONSISTENCY",
                "status": "POSITIVE",
                "text": "Consistent repetition cadence and motor control",
                "joint_affected": "kinetic_chain",
                "severity": "low",
            })
        else:
            observations.append({
                "category": "CONSISTENCY",
                "status": "ATTENTION",
                "text": "Tempo variation detected across repetitions",
                "joint_affected": "kinetic_chain",
                "severity": "low",
            })

        return {
            "movement_quality": movement_quality,
            "stability": round(stability_score, 1),
            "movement_consistency": round(movement_consistency, 1),
            "squat_movement_score": squat_movement_score,
            "metrics": {
                "detected_reps": num_reps,
                "torso_variance_deg": round(torso_variance, 1),
                "torso_total_range_deg": round(torso_range, 1),
                "knee_wobble_index": round(knee_wobble_std * 100, 2),
            },
            "observations": observations,
        }
