"""
WorkoutAdaptation — Modifies workout based on FortisDecision.

Takes the current planned workout and applies the adjustment_factor
from FortisDecisionEngine to produce an adapted version.
"""
from typing import List, Dict, Any, Optional
from app.models.intelligence import FortisDecision
import re


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


def build_time_equipment_draft(planned, catalogue, available_minutes: int, equipment_ids: List[str]):
    """Deterministic adaptation; estimates 45s work + 60s rest per set and 1m per transition."""
    def equipment_key(value):
        key = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
        return {"dumbbells": "dumbbell", "barbells": "barbell", "resistance_bands": "resistance_band", "pull_ups_bar": "pull_up_bar"}.get(key, key)

    normalized = {equipment_key(x) for x in equipment_ids}
    normalized.add("bodyweight")
    if "full_gym" in normalized:
        normalized.update({"dumbbell", "barbell", "cable", "machine", "resistance_band", "bench", "pull_up_bar", "kettlebell", "smith_machine"})
    reasons, changes, result = [], [], []
    original_min = max(1, round(sum((x.planned_sets or 1) * 1.75 for x in planned) + max(0, len(planned)-1)))
    if available_minutes < original_min:
        reasons.append({"rule_id": "TIME_CONSTRAINT", "label": "Available time", "detail": f"You selected {available_minutes} minutes; the planned session is estimated at {original_min} minutes."})

    for item in planned:
        source = next((x for x in catalogue if x.id == item.exercise_id), None)
        if not source:
            continue
        required = {equipment_key(x) for x in (source.equipment_required or [])}
        compatible = not required or required.issubset(normalized) or required == {"bodyweight"}
        chosen = source
        if not compatible:
            if not any(r["rule_id"] == "EQUIPMENT_MISMATCH" for r in reasons):
                reasons.append({"rule_id": "EQUIPMENT_MISMATCH", "label": "Available equipment", "detail": "Some planned exercises require equipment you did not select."})
            muscles, category = {m.lower() for m in (source.muscle_groups or [])}, (source.category or "").lower()
            candidates = [e for e in catalogue if e.id != source.id and {equipment_key(x) for x in (e.equipment_required or [])}.issubset(normalized) and muscles.intersection(m.lower() for m in (e.muscle_groups or [])) and (e.category or "").lower() == category]
            chosen = candidates[0] if candidates else None
        if chosen is None:
            changes.append(f"{source.name} removed: no catalogue alternative matches the selected equipment and workout focus.")
            continue
        sets = max(1, int(item.planned_sets or 1))
        result.append({"exercise_id": chosen.id, "name": chosen.name, "muscle_groups": chosen.muscle_groups or [], "equipment_required": chosen.equipment_required or [], "planned_sets": sets, "planned_reps": item.planned_reps or 10, "planned_weight_kg": item.planned_weight_kg, "order_index": len(result), "change": None if chosen.id == source.id else f"Replaced {source.name}: matching category and muscle group with selected equipment."})
        if chosen.id != source.id:
            changes.append(result[-1]["change"])

    estimate = lambda: max(1, round(sum(x["planned_sets"] * 1.75 for x in result) + max(0, len(result)-1)))
    while result and estimate() > available_minutes:
        idx = next((i for i in range(len(result)-1, -1, -1) if result[i]["planned_sets"] > 1), None)
        if idx is None:
            break
        result[idx]["planned_sets"] -= 1
    if estimate() > available_minutes:
        changes.append("The remaining exercises do not fit the selected time at the minimum of one set each; consider a longer duration.")
    elif estimate() < original_min and available_minutes < original_min:
        changes.append("Sets were reduced to bring the session closer to your available time.")
    if not reasons:
        reasons.append({"rule_id": "SUITABLE_PLAN", "label": "Plan fit", "detail": "The selected time and equipment support this planned session."})
    return {"original_duration_min": original_min, "estimated_duration_min": estimate(), "exercises": result, "changes": changes, "reasons": reasons}
