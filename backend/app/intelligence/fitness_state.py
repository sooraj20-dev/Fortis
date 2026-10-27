"""
FitnessStateCalculator — Computes a user's Personal Fitness State from actual DB data.

The core philosophy: every signal feeds into a weighted score that forms
the FitnessState. This state then drives FortisDecisionEngine decisions.

OBSERVE (logs) → UNDERSTAND (FitnessState) → PREDICT (fatigue) → DECIDE (decision engine)
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta, date
from typing import Optional
import logging
import math

from app.models.intelligence import FitnessState
from app.models.workout import Workout, ExerciseLog, PostWorkoutFeedback, WorkoutExercise
from app.models.recovery import RecoveryLog, SleepLog
from app.models.nutrition import FoodLog
from app.ml.interfaces import BaseFatigueModel, FatigueFeatures
from app.ml.registry import get_fatigue_model
from app.ml.model_config import ml_config
from app.intelligence.baseline import BaselineTracker
from app.database import DatabaseUnavailableError

logger = logging.getLogger(__name__)


def clamp(value: float, min_val: float = 0.0, max_val: float = 100.0) -> float:
    if value is None or math.isnan(value) or math.isinf(value):
        return min_val
    return max(min_val, min(max_val, float(value)))


class FitnessStateCalculator:

    def __init__(
        self,
        fatigue_predictor: Optional[BaseFatigueModel] = None,
        baseline_tracker: Optional[BaselineTracker] = None
    ):
        self.fatigue_predictor = fatigue_predictor or get_fatigue_model()
        self.baseline_tracker = baseline_tracker or BaselineTracker()

    def compute(self, user_id: int, target_date: datetime, db: Session) -> FitnessState:
        """
        Compute today's FitnessState from all available signals.
        Queries the DB for real data — no hardcoded values.
        """
        today = target_date.date() if isinstance(target_date, datetime) else target_date
        window_7d = today - timedelta(days=7)
        window_30d = today - timedelta(days=30)

        # --- CONSISTENCY SCORE (30-day workout adherence) ---
        try:
            completed_30d = db.query(Workout).filter(
                Workout.user_id == user_id,
                Workout.status == "COMPLETED",
                func.date(Workout.date) >= window_30d
            ).count()

            planned_30d = db.query(Workout).filter(
                Workout.user_id == user_id,
                func.date(Workout.date) >= window_30d
            ).count()
        except DatabaseUnavailableError:
            raise  # Database is down — do not compute a state from partial data

        consistency_score = clamp((completed_30d / max(planned_30d, 1)) * 100)

        # --- STRENGTH SCORE (based on performance vs planned) ---
        recent_workouts = db.query(Workout).filter(
            Workout.user_id == user_id,
            Workout.status == "COMPLETED",
            func.date(Workout.date) >= window_7d
        ).all()

        strength_score = None
        if recent_workouts:
            w_ids = [w.id for w in recent_workouts if getattr(w, "id", None) is not None]
            total_sets_planned = 0
            total_sets_done = 0
            if w_ids:
                all_we = db.query(WorkoutExercise).filter(WorkoutExercise.workout_id.in_(w_ids)).all()
                total_sets_planned = sum(we.planned_sets or 0 for we in all_we)
                we_ids = [we.id for we in all_we if getattr(we, "id", None) is not None]
                if we_ids:
                    total_sets_done = db.query(ExerciseLog).filter(ExerciseLog.workout_exercise_id.in_(we_ids)).count()

            completion_rate = total_sets_done / max(total_sets_planned, 1)
            strength_score = clamp(50 + (completion_rate - 0.5) * 60 + len(recent_workouts) * 4)

        # --- ENDURANCE SCORE (derived from workout duration + frequency) ---
        endurance_score = None
        if recent_workouts:
            durations = [w.total_duration_min for w in recent_workouts if w.total_duration_min]
            avg_duration = sum(durations) / len(durations) if durations else 0.0
            endurance_score = clamp(40 + min(avg_duration, 60) * 0.8 + len(recent_workouts) * 3)

        # --- RECOVERY SCORE (from recovery logs) ---
        recent_recovery = db.query(RecoveryLog).filter(
            RecoveryLog.user_id == user_id,
            func.date(RecoveryLog.date) >= window_7d
        ).order_by(desc(RecoveryLog.date)).all()

        recovery_score = None
        if recent_recovery:
            scores = [r.recovery_score for r in recent_recovery if r.recovery_score is not None]
            if scores:
                recovery_score = clamp(sum(scores) / len(scores))

        # --- SLEEP/ENERGY COMPONENT ---
        recent_sleep = db.query(SleepLog).filter(
            SleepLog.user_id == user_id,
            func.date(SleepLog.date) >= window_7d
        ).order_by(desc(SleepLog.date)).all()

        avg_sleep_hours = None
        avg_sleep_quality = None
        if recent_sleep:
            avg_sleep_hours = sum(s.duration_hours for s in recent_sleep) / len(recent_sleep)
            avg_sleep_quality = sum(s.quality for s in recent_sleep) / len(recent_sleep)

        # --- NUTRITION SCORE (food logging adherence + macro balance) ---
        food_logs_7d = db.query(FoodLog).filter(
            FoodLog.user_id == user_id,
            func.date(FoodLog.date) >= window_7d
        ).all()

        nutrition_score = None
        if food_logs_7d:
            days_with_logs = len(set(str(fl.date.date()) for fl in food_logs_7d))
            nutrition_score = clamp(40 + (days_with_logs / 7) * 60)

        # Check if user has any recorded training or recovery activity
        has_activity = (completed_30d > 0) or (len(recent_recovery) > 0) or (len(recent_sleep) > 0) or (len(food_logs_7d) > 0)

        # --- MOBILITY SCORE (from form results) ---
        from app.models.workout import ExerciseFormResult
        recent_form = db.query(ExerciseFormResult).filter(
            ExerciseFormResult.user_id == user_id,
            func.date(ExerciseFormResult.analyzed_at) >= window_30d
        ).order_by(desc(ExerciseFormResult.analyzed_at)).limit(10).all()

        mobility_score = None
        if recent_form:
            avg_form = sum(f.form_score for f in recent_form) / len(recent_form)
            mobility_score = clamp(avg_form)

        # --- FATIGUE RISK (from ML model) ---
        recent_rpe_records = db.query(PostWorkoutFeedback).join(
            Workout, Workout.id == PostWorkoutFeedback.workout_id
        ).filter(
            Workout.user_id == user_id,
            func.date(Workout.date) >= window_7d
        ).order_by(desc(Workout.date)).all()

        avg_rpe = None
        avg_soreness = None
        avg_energy = None

        if recent_recovery:
            soreness_vals = [r.soreness_level for r in recent_recovery if r.soreness_level is not None]
            energy_vals = [r.energy_level for r in recent_recovery if r.energy_level is not None]
            if soreness_vals:
                avg_soreness = sum(soreness_vals) / len(soreness_vals)
            if energy_vals:
                avg_energy = sum(energy_vals) / len(energy_vals)
        elif recent_rpe_records:
            soreness_vals = [r.soreness_level for r in recent_rpe_records if r.soreness_level is not None]
            energy_vals = [r.energy_level for r in recent_rpe_records if r.energy_level is not None]
            if soreness_vals:
                avg_soreness = sum(soreness_vals) / len(soreness_vals)
            if energy_vals:
                avg_energy = sum(energy_vals) / len(energy_vals)

        if recent_rpe_records:
            rpe_vals = [r.overall_rpe for r in recent_rpe_records if r.overall_rpe is not None]
            if rpe_vals:
                avg_rpe = sum(rpe_vals) / len(rpe_vals)

        # Update baselines only when actual measured data exists
        if avg_sleep_hours is not None:
            self.baseline_tracker.update_baseline(user_id, "sleep_hours", avg_sleep_hours, db)
        if avg_rpe is not None:
            self.baseline_tracker.update_baseline(user_id, "rpe", avg_rpe, db)
        if avg_soreness is not None:
            self.baseline_tracker.update_baseline(user_id, "soreness", avg_soreness, db)
        if avg_energy is not None:
            self.baseline_tracker.update_baseline(user_id, "energy", avg_energy, db)

        workout_freq_7d = len(recent_workouts)
        rest_days_3d = 3 - db.query(Workout).filter(
            Workout.user_id == user_id,
            Workout.status == "COMPLETED",
            func.date(Workout.date) >= today - timedelta(days=3)
        ).count()

        fatigue_risk = None
        readiness_score = None
        fortis_pulse = None

        if has_activity:
            features = FatigueFeatures(
                recent_rpe_avg=avg_rpe if avg_rpe is not None else 6.0,
                workout_frequency_7d=workout_freq_7d,
                sleep_avg_hours=avg_sleep_hours if avg_sleep_hours is not None else 7.0,
                sleep_quality_avg=avg_sleep_quality if avg_sleep_quality is not None else 7.0,
                soreness_avg=avg_soreness if avg_soreness is not None else 4.0,
                energy_avg=avg_energy if avg_energy is not None else 6.5,
                rest_days_3d=max(0, rest_days_3d),
                training_volume_7d=sum(
                    w.total_duration_min for w in recent_workouts if w.total_duration_min
                ) or 0
            )
            fatigue_result = self.fatigue_predictor.predict(features)
            fatigue_risk = fatigue_result.fatigue_risk

            # --- READINESS SCORE ---
            rec_val = recovery_score if recovery_score is not None else 60.0
            sleep_h = avg_sleep_hours if avg_sleep_hours is not None else 7.0
            soreness_val = avg_soreness if avg_soreness is not None else 4.0
            sleep_ratio = min(1.0, max(0.0, sleep_h / 8.5))
            soreness_recovery = max(0.0, 10.0 - soreness_val) / 9.0
            fatigue_inverted_ratio = max(0.0, 100.0 - fatigue_risk) / 100.0

            readiness_score = clamp(
                (rec_val * 0.35) +
                (soreness_recovery * 25.0) +
                (sleep_ratio * 25.0) +
                (fatigue_inverted_ratio * 15.0)
            )

        # --- FORTIS PULSE (weighted composite) ---
        from app.models.scan import BodyScan
        latest_scan = db.query(BodyScan).filter(
            BodyScan.user_id == user_id,
            BodyScan.status == "COMPLETED"
        ).order_by(desc(BodyScan.scan_date)).first()

        movement_quality = None
        stability = None
        movement_consistency = None
        scan_confidence = None
        last_scan_date = None

        if latest_scan and latest_scan.metrics:
            movement_quality = latest_scan.metrics.movement_quality
            stability = latest_scan.metrics.stability
            movement_consistency = latest_scan.metrics.movement_consistency
            scan_confidence = latest_scan.confidence
            last_scan_date = latest_scan.scan_date

        if has_activity and readiness_score is not None and fatigue_risk is not None:
            s_score = strength_score if strength_score is not None else 50.0
            e_score = endurance_score if endurance_score is not None else 50.0
            r_score = recovery_score if recovery_score is not None else 60.0
            n_score = nutrition_score if nutrition_score is not None else 50.0
            m_score = mobility_score if mobility_score is not None else 50.0

            if movement_quality is not None:
                w = ml_config.PULSE_WEIGHTS_WITH_SCAN
                fatigue_inverted = clamp(100.0 - fatigue_risk)
                fortis_pulse = clamp(
                    s_score * w["strength"] +
                    r_score * w["recovery"] +
                    consistency_score * w["consistency"] +
                    n_score * w["nutrition"] +
                    fatigue_inverted * w["fatigue"] +
                    movement_quality * w["movement"]
                )
            else:
                w = ml_config.PULSE_WEIGHTS_DEFAULT
                fortis_pulse = clamp(
                    s_score * w["strength"] +
                    e_score * w["endurance"] +
                    r_score * w["recovery"] +
                    consistency_score * w["consistency"] +
                    n_score * w["nutrition"] +
                    m_score * w["mobility"] +
                    readiness_score * w["readiness"]
                )

        # Check if state already exists for today
        existing = db.query(FitnessState).filter(
            FitnessState.user_id == user_id,
            func.date(FitnessState.date) == today
        ).first()

        if existing:
            existing.strength_score = round(strength_score, 1) if strength_score is not None else None
            existing.endurance_score = round(endurance_score, 1) if endurance_score is not None else None
            existing.recovery_score = round(recovery_score, 1) if recovery_score is not None else None
            existing.consistency_score = round(consistency_score, 1) if consistency_score is not None else None
            existing.nutrition_score = round(nutrition_score, 1) if nutrition_score is not None else None
            existing.mobility_score = round(mobility_score, 1) if mobility_score is not None else None
            existing.readiness_score = round(readiness_score, 1) if readiness_score is not None else None
            existing.fatigue_risk = round(fatigue_risk, 1) if fatigue_risk is not None else None
            existing.fortis_pulse = round(fortis_pulse, 1) if fortis_pulse is not None else None
            if movement_quality is not None:
                existing.movement_quality = round(movement_quality, 1)
                existing.stability = round(stability, 1) if stability is not None else None
                existing.movement_consistency = round(movement_consistency, 1) if movement_consistency is not None else None
                existing.scan_confidence = round(scan_confidence, 1) if scan_confidence is not None else None
                existing.last_scan_date = last_scan_date
            existing.computed_at = datetime.utcnow()
            db.commit()
            db.refresh(existing)
            return existing

        state = FitnessState(
            user_id=user_id,
            date=datetime.combine(today, datetime.min.time()),
            strength_score=round(strength_score, 1) if strength_score is not None else None,
            endurance_score=round(endurance_score, 1) if endurance_score is not None else None,
            recovery_score=round(recovery_score, 1) if recovery_score is not None else None,
            consistency_score=round(consistency_score, 1) if consistency_score is not None else None,
            nutrition_score=round(nutrition_score, 1) if nutrition_score is not None else None,
            mobility_score=round(mobility_score, 1) if mobility_score is not None else None,
            readiness_score=round(readiness_score, 1) if readiness_score is not None else None,
            fatigue_risk=round(fatigue_risk, 1) if fatigue_risk is not None else None,
            fortis_pulse=round(fortis_pulse, 1) if fortis_pulse is not None else None,
            movement_quality=round(movement_quality, 1) if movement_quality is not None else None,
            stability=round(stability, 1) if stability is not None else None,
            movement_consistency=round(movement_consistency, 1) if movement_consistency is not None else None,
            scan_confidence=round(scan_confidence, 1) if scan_confidence is not None else None,
            last_scan_date=last_scan_date,
            computed_at=datetime.utcnow()
        )
        db.add(state)
        db.commit()
        db.refresh(state)
        return state
