"""
WorkoutAdaptation — Modifies workout based on FortisDecision.

Takes the current planned workout and applies the adjustment_factor
from FortisDecisionEngine to produce an adapted version.
"""
from typing import List, Dict, Any, Optional
from app.models.intelligence import FortisDecision


def adapt_workout_exercises(
    exercises: List[Dict[str, Any]],
    decision: FortisDecision,
    user_experience: str = "INTERMEDIATE"
) -> List[Dict[str, Any]]:
    """
    Adapt a list of planned exercises based on the Fortis decision.
    Returns modified exercise list with adjusted sets/reps/weight.
    """
    factor = decision.adjustment_factor

    if factor == 0.0:
        # REST day — return empty
        return []

    adapted = []
    for ex in exercises:
        planned_sets = ex.get("planned_sets", 3)
        planned_reps = ex.get("planned_reps", 10)
        planned_weight = ex.get("planned_weight_kg", 0)

        if factor >= 1.1:  # PROGRESSIVE
            # Add sets or reps
            new_sets = planned_sets
            new_reps = min(planned_reps + 2, 15)
            new_weight = round(planned_weight * 1.05, 1) if planned_weight and planned_weight > 0 else planned_weight
            adaptation_note = "↑ Progressive overload applied"
        elif factor == 1.0:  # NORMAL
            new_sets = planned_sets
            new_reps = planned_reps
            new_weight = planned_weight
            adaptation_note = None
        elif factor >= 0.75:  # REDUCED
            new_sets = max(2, round(planned_sets * factor))
            new_reps = planned_reps
            new_weight = planned_weight
            adaptation_note = "↓ Volume reduced for recovery"
        elif factor >= 0.5:  # RECOVERY
            new_sets = max(1, round(planned_sets * 0.6))
            new_reps = max(8, round(planned_reps * 0.8))
            new_weight = round(planned_weight * 0.7, 1) if planned_weight and planned_weight > 0 else planned_weight
            adaptation_note = "↓ Recovery session — light intensity"
        else:  # Very low factor
            new_sets = 1
            new_reps = planned_reps
            new_weight = round(planned_weight * 0.6, 1) if planned_weight and planned_weight > 0 else planned_weight
            adaptation_note = "↓ Minimal volume — focus on movement quality"

        # Check for movement control priority from decision
        needs_movement_control = any(
            "movement-control" in r.lower() or "descent tempo" in r.lower() or "stability" in r.lower()
            for r in (decision.recommendations or []) + (decision.reasons or [])
        )
        if needs_movement_control and not adaptation_note:
            adaptation_note = "🎯 Movement control focus — 3s eccentric tempo"

        adapted_ex = dict(ex)
        adapted_ex["planned_sets"] = new_sets
        adapted_ex["planned_reps"] = new_reps
        adapted_ex["planned_weight_kg"] = new_weight
        if needs_movement_control:
            adapted_ex["tempo"] = "3-1-1 (3s descent control)"
        if adaptation_note:
            adapted_ex["adaptation_note"] = adaptation_note
        adapted.append(adapted_ex)

    return adapted


def substitute_exercise(
    exercise_name: str,
    available_equipment: List[str],
    all_exercises: List[Any],
    prefer_stability: bool = False
) -> Optional[Any]:
    """
    Exercise substitution engine: substitutes an exercise when equipment is unavailable
    or when movement scan calls for higher-stability alternatives.
    """
    valid_eq = set([e.lower() for e in available_equipment] + ["bodyweight"])

    # Find the target exercise
    target = None
    for ex in all_exercises:
        if ex.name.lower() == exercise_name.lower():
            target = ex
            break

    if not target:
        return None

    target_muscles = set([m.lower() for m in (target.muscle_groups or [])])
    target_cat = (target.category or "").lower()

    # Search candidates with matching muscle groups and valid equipment
    candidates = []
    for ex in all_exercises:
        if ex.id == target.id:
            continue
        ex_eq = [e.lower() for e in (ex.equipment_required or [])]
        has_eq = all(e in valid_eq for e in ex_eq) or any(e in valid_eq for e in ex_eq) or "bodyweight" in ex_eq
        if not has_eq:
            continue

        ex_muscles = set([m.lower() for m in (ex.muscle_groups or [])])
        overlap = len(target_muscles.intersection(ex_muscles))
        if overlap > 0:
            score = overlap * 2
            if (ex.category or "").lower() == target_cat:
                score += 3
            if prefer_stability and ex.difficulty in ["BEGINNER", "INTERMEDIATE"]:
                score += 2
            candidates.append((score, ex))

    candidates.sort(key=lambda c: c[0], reverse=True)
    return candidates[0][1] if candidates else None


def get_workout_type_for_decision(decision_type: str, base_type: str) -> str:
    """Determine workout type label based on decision."""
    overrides = {
        "PROGRESSIVE": f"Progressive {base_type}",
        "NORMAL": base_type,
        "REDUCED": f"Light {base_type}",
        "RECOVERY": "Active Recovery",
        "REST": "Rest Day",
    }
    return overrides.get(decision_type, base_type)


def estimate_workout_duration(exercises: List[Dict], sets_per_exercise: float = 3) -> int:
    """Estimate workout duration in minutes."""
    if not exercises:
        return 0
    total_sets = sum(ex.get("planned_sets", sets_per_exercise) for ex in exercises)
    # ~2.5 min per set (including rest)
    return max(15, round(total_sets * 2.5))
