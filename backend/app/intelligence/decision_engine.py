"""
FortisDecisionEngine — The central intelligence of the Fortis platform.

This engine takes all available user signals and produces a structured
FortisDecision that drives workout adaptation, recovery recommendations,
and AI coach explanations.

Decision types:
  PROGRESSIVE  — User is performing well, ready for increased load
  NORMAL       — Maintain current training
  REDUCED      — Slightly lower volume/intensity
  RECOVERY     — Focus on active recovery
  REST         — Rest day recommended

The key innovation: every decision compares current state against the
user's PERSONAL BASELINE, not population averages.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta, date
from typing import Optional

from app.models.intelligence import FitnessState, FortisDecision
from app.models.workout import Workout, PostWorkoutFeedback
from app.models.recovery import RecoveryLog, SleepLog
from app.intelligence.baseline import BaselineTracker
from app.intelligence.fitness_state import FitnessStateCalculator

import logging

logger = logging.getLogger(__name__)


DECISION_THRESHOLDS = {
    "PROGRESSIVE": {"pulse_min": 76, "fatigue_max": 35},
    "NORMAL": {"pulse_min": 58, "fatigue_max": 55},
    "REDUCED": {"pulse_min": 45, "fatigue_max": 70},
    "RECOVERY": {"pulse_min": 30, "fatigue_max": 85},
    "REST": {"pulse_min": 0, "fatigue_max": 100},
}

ADJUSTMENT_FACTORS = {
    "PROGRESSIVE": 1.15,
    "NORMAL": 1.0,
    "REDUCED": 0.80,
    "RECOVERY": 0.60,
    "REST": 0.0,
}


class FortisDecisionEngine:

    def __init__(
        self,
        baseline_tracker: Optional[BaselineTracker] = None,
        fs_calculator: Optional[FitnessStateCalculator] = None
    ):
        self.baseline_tracker = baseline_tracker or BaselineTracker()
        self.fs_calculator = fs_calculator or FitnessStateCalculator()

    def compute_decision(self, user_id: int, db: Session) -> FortisDecision:
        today = datetime.utcnow()
        today_date = today.date()

        # Check if decision already exists for today
        existing = db.query(FortisDecision).filter(
            FortisDecision.user_id == user_id,
            func.date(FortisDecision.date) == today_date
        ).first()
        if existing:
            return existing

        # Get or compute today's fitness state
        state = db.query(FitnessState).filter(
            FitnessState.user_id == user_id,
            func.date(FitnessState.date) == today_date
        ).first()

        if not state:
            state = self.fs_calculator.compute(user_id, today, db)

        # Get personal baselines
        baselines = self.baseline_tracker.get_all_baselines(user_id, db)

        # Get most recent raw signals
        latest_recovery = db.query(RecoveryLog).filter(
            RecoveryLog.user_id == user_id
        ).order_by(desc(RecoveryLog.date)).first()

        latest_sleep = db.query(SleepLog).filter(
            SleepLog.user_id == user_id
        ).order_by(desc(SleepLog.date)).first()

        latest_feedback = db.query(PostWorkoutFeedback).join(
            Workout, Workout.id == PostWorkoutFeedback.workout_id
        ).filter(
            Workout.user_id == user_id
        ).order_by(desc(Workout.date)).first()

        # Consecutive training days
        window_3d = today_date - timedelta(days=3)
        training_3d = db.query(Workout).filter(
            Workout.user_id == user_id,
            Workout.status == "COMPLETED",
            func.date(Workout.date) >= window_3d
        ).count()

        # Compute baseline deltas with null-safe access
        sleep_hours = latest_sleep.duration_hours if (latest_sleep and latest_sleep.duration_hours is not None) else 7.0
        sleep_quality = latest_sleep.quality if (latest_sleep and latest_sleep.quality is not None) else 7
        energy = latest_recovery.energy_level if (latest_recovery and latest_recovery.energy_level is not None) else 7
        soreness = latest_recovery.soreness_level if (latest_recovery and latest_recovery.soreness_level is not None) else 4
        recent_rpe = latest_feedback.overall_rpe if (latest_feedback and latest_feedback.overall_rpe is not None) else 6.5

        baseline_deltas = {
            "sleep_hours": self.baseline_tracker.compute_delta(
                sleep_hours, baselines.get("sleep_hours")),
            "rpe": self.baseline_tracker.compute_delta(
                recent_rpe, baselines.get("rpe")),
            "soreness": self.baseline_tracker.compute_delta(
                soreness, baselines.get("soreness")),
            "energy": self.baseline_tracker.compute_delta(
                energy, baselines.get("energy")),
        }

        # --- DETERMINE DECISION TYPE WITH STRICT SAFEGUARD PRIORITY ---
        is_baseline_pending = (state.fortis_pulse is None)

        if is_baseline_pending:
            decision_type = "NORMAL"
        # Priority 1: Pain and extreme soreness safeguard
        elif (latest_feedback and latest_feedback.pain_flag) or soreness >= 9:
            decision_type = "REST"
        # Priority 2: Critical fatigue overload safeguard
        elif (state.fatigue_risk is not None and state.fatigue_risk >= 85):
            decision_type = "REST"
        # Priority 3: Cumulative training fatigue safeguard
        elif training_3d >= 3 and (state.fatigue_risk is not None and state.fatigue_risk > 65):
            decision_type = "RECOVERY"
        elif (state.fatigue_risk is not None and state.fatigue_risk >= 70):
            decision_type = "RECOVERY"
        # Priority 4: Progressive overload eligibility
        elif (state.fortis_pulse is not None and state.fortis_pulse >= 76) and (state.fatigue_risk is not None and state.fatigue_risk <= 35) and soreness <= 4:
            decision_type = "PROGRESSIVE"
        # Priority 5: Normal training with subtle degradation check
        elif (state.fortis_pulse is not None and state.fortis_pulse >= 58) and (state.fatigue_risk is not None and state.fatigue_risk <= 55):
            if baseline_deltas.get("sleep_hours", 0) < -1.5 or baseline_deltas.get("soreness", 0) > 2.5:
                decision_type = "REDUCED"
            else:
                decision_type = "NORMAL"
        # Priority 6: Reduced volume
        elif (state.fortis_pulse is not None and state.fortis_pulse >= 45) and (state.fatigue_risk is not None and state.fatigue_risk <= 70):
            decision_type = "REDUCED"
        # Priority 7: Active recovery
        elif (state.fortis_pulse is not None and state.fortis_pulse >= 30) and (state.fatigue_risk is not None and state.fatigue_risk <= 85):
            decision_type = "RECOVERY"
        # Priority 8: Default rest
        else:
            decision_type = "REST"

        # --- BUILD REASONS LIST ---
        reasons = []

        if is_baseline_pending:
            reasons.append("Starter training plan based on your profile.")
            reasons.append("Complete workouts and recovery check-ins to establish your Fortis baseline.")
        else:
            # Sleep analysis
            sleep_baseline = baselines.get("sleep_hours", 7.0)
            sleep_delta = baseline_deltas.get("sleep_hours", 0)
            if sleep_delta < -1.5:
                reasons.append(f"Sleep significantly below your baseline ({sleep_hours:.1f}h vs {sleep_baseline:.1f}h typical)")
            elif sleep_delta < -0.7:
                reasons.append(f"Sleep slightly below your baseline ({sleep_hours:.1f}h vs {sleep_baseline:.1f}h typical)")
            elif sleep_delta > 0.5:
                reasons.append(f"Good sleep — above your baseline ({sleep_hours:.1f}h)")

            # RPE analysis
            rpe_baseline = baselines.get("rpe", 6.5)
            rpe_delta = baseline_deltas.get("rpe", 0)
            if rpe_delta > 1.5:
                reasons.append(f"Recent workouts feeling harder than usual (RPE {recent_rpe:.1f} vs {rpe_baseline:.1f} typical)")
            elif rpe_delta < -1.0:
                reasons.append(f"Workouts feeling easier — good adaptation (RPE {recent_rpe:.1f})")

            # Soreness analysis
            soreness_baseline = baselines.get("soreness", 4.0)
            soreness_delta = baseline_deltas.get("soreness", 0)
            if soreness >= 7:
                reasons.append(f"High muscle soreness reported ({soreness}/10)")
            elif soreness_delta > 2.0:
                reasons.append(f"Soreness elevated above your baseline ({soreness}/10)")

            # Energy analysis
            energy_baseline = baselines.get("energy", 6.5)
            energy_delta = baseline_deltas.get("energy", 0)
            if energy <= 4:
                reasons.append(f"Low energy levels reported ({energy}/10)")
            elif energy >= 8 and energy_delta > 0.5:
                reasons.append(f"Energy levels high — above your baseline")

            # Consistency/fatigue
            if training_3d >= 3:
                reasons.append("3 consecutive training days — cumulative fatigue building")
            if state.consistency_score and state.consistency_score >= 80:
                reasons.append(f"Strong training consistency ({state.consistency_score:.0f}%)")
            if state.fatigue_risk is not None and state.fatigue_risk > 65:
                reasons.append(f"Elevated fatigue risk ({state.fatigue_risk:.0f}%)")

            # Scan and movement intelligence
            if getattr(state, "movement_quality", None) is not None:
                mq = state.movement_quality
                mob = state.mobility_score
                stab = getattr(state, "stability", None)
                if stab is not None and stab < 72:
                    reasons.append(f"Movement stability needs attention ({stab:.0f}/100) — torso/knee shift observed")
                elif mq >= 78:
                    reasons.append(f"Solid movement mechanics verified by scan ({mq:.0f}/100 quality score)")

                if mob is not None and mob < 68:
                    reasons.append(f"Hip and ankle mobility restricted ({mob:.0f}/100) — limiting squat depth")

        # Ensure at least one reason
        if not reasons:
            if decision_type == "PROGRESSIVE":
                reasons = ["Good recovery metrics", "Consistent training pattern", "Performance trending upward"]
            elif decision_type == "NORMAL":
                reasons = ["All metrics within your normal range", "Recovery is adequate"]
            else:
                p_text = f"at {state.fortis_pulse:.0f}" if state.fortis_pulse is not None else "pending baseline"
                reasons = [f"Fortis Pulse {p_text} — below optimal threshold"]

        # --- RECOMMENDATIONS ---
        recommendations = self._build_recommendations(decision_type, state, sleep_hours)

        # --- CONFIDENCE ---
        # Higher confidence when we have more data and signals are clear
        data_points = sum([
            1 if latest_sleep else 0,
            1 if latest_recovery else 0,
            1 if latest_feedback else 0,
            1 if state.consistency_score > 0 else 0,
        ])
        base_confidence = 0.60 + (data_points / 4) * 0.30
        # Reduce confidence if signals are mixed
        if len(reasons) > 3:
            base_confidence *= 0.92
        confidence = round(min(0.95, base_confidence), 2)

        decision = FortisDecision(
            user_id=user_id,
            date=datetime.combine(today_date, datetime.min.time()),
            decision_type=decision_type,
            readiness_score=round(state.readiness_score, 1) if state.readiness_score is not None else None,
            fatigue_risk=round(state.fatigue_risk, 1) if state.fatigue_risk is not None else None,
            confidence=confidence,
            adjustment_factor=ADJUSTMENT_FACTORS[decision_type],
            reasons=reasons,
            recommendations=recommendations,
            baseline_deltas=baseline_deltas,
            created_at=datetime.utcnow()
        )

        db.add(decision)
        db.commit()
        db.refresh(decision)

        logger.info(f"Decision for user {user_id}: {decision_type} (pulse={state.fortis_pulse}, fatigue={state.fatigue_risk})")
        return decision

    def _build_recommendations(self, decision_type: str, state: FitnessState, sleep_hours: float) -> list[str]:
        recs = {
            "PROGRESSIVE": [
                "Increase weights by 2.5-5% on main lifts",
                "Consider adding one extra set to compound movements",
                "Excellent time to challenge personal records",
            ],
            "NORMAL": [
                "Follow today's planned workout",
                "Maintain current training intensity and volume",
                "Focus on good form and full range of motion",
            ],
            "REDUCED": [
                "Reduce training volume by 20% (fewer sets, same exercises)",
                "Keep weights the same but reduce sets to 2 instead of 3",
                "Focus on quality of movement over quantity",
                "Prioritize sleep tonight (aim for 7-8 hours)",
            ],
            "RECOVERY": [
                "Do a light 20-minute recovery session (walking, stretching, yoga)",
                "Foam roll major muscle groups",
                "Focus on nutrition and hydration today",
                "Get 7-8 hours of sleep tonight",
            ],
            "REST": [
                "Take a complete rest day today",
                "Light walking is fine but avoid structured training",
                "Focus on nutrition, hydration, and sleep",
                "Your body repairs and grows stronger during rest",
            ],
        }
        base = list(recs.get(decision_type, ["Follow your fitness plan"]))
        if getattr(state, "stability", None) is not None and state.stability < 72:
            base.append("Prioritize movement-control exercises and controlled descent tempo")
        elif getattr(state, "mobility_score", None) is not None and state.mobility_score < 70:
            base.append("Include targeted hip and ankle mobility warmup prior to working sets")
        if sleep_hours < 6.0:
            base.append("Prioritize getting to bed earlier tonight")
        return base
