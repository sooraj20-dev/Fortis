"""
Explainability Builder — Creates human-readable explanations for every Fortis decision.

This is the Explainable AI component of Fortis.
Every important decision returns: decision, confidence, factors, reasoning, action.
"""
from typing import Dict, List, Any
from app.models.intelligence import FortisDecision, FitnessState


FACTOR_LABELS = {
    "sleep_hours": "Sleep",
    "rpe": "Recent Workout Effort",
    "soreness": "Muscle Soreness",
    "energy": "Energy Level",
}

DECISION_SUMMARIES = {
    "PROGRESSIVE": "Your body is primed for progressive overload. Push a bit harder today.",
    "NORMAL": "You're in a good state. Follow your planned training for today.",
    "REDUCED": "Reducing today's training volume to protect your recovery.",
    "RECOVERY": "Your body needs active recovery today. Light movement only.",
    "REST": "Rest is training too. Take the day off and let your body repair.",
}

DECISION_TITLES = {
    "PROGRESSIVE": "Progressive Training",
    "NORMAL": "Normal Training",
    "REDUCED": "Reduced Volume",
    "RECOVERY": "Recovery Session",
    "REST": "Rest Day",
}


def build_explanation(
    decision: FortisDecision,
    state: FitnessState,
    baselines: Dict[str, float],
) -> Dict[str, Any]:
    """
    Build a full explanation object for a FortisDecision.
    Returns structured data the frontend uses to display the Explainability Panel.
    """
    factors = []

    for metric, label in FACTOR_LABELS.items():
        delta = decision.baseline_deltas.get(metric, 0)
        baseline_val = baselines.get(metric)
        if baseline_val is None:
            continue

        # Determine direction and severity
        if metric == "sleep_hours":
            if delta < -1.5:
                direction = "down"
                severity = "negative"
                note = f"{baseline_val + delta:.1f}h vs {baseline_val:.1f}h baseline"
            elif delta < -0.5:
                direction = "down"
                severity = "warning"
                note = f"Slightly below baseline"
            elif delta > 0.5:
                direction = "up"
                severity = "positive"
                note = f"Above baseline — good"
            else:
                direction = "stable"
                severity = "neutral"
                note = "Within normal range"

        elif metric == "rpe":
            # Higher RPE = more fatigue (negative)
            if delta > 1.5:
                direction = "up"
                severity = "negative"
                note = f"Feeling harder than usual ({baseline_val + delta:.1f} vs {baseline_val:.1f})"
            elif delta < -1.0:
                direction = "down"
                severity = "positive"
                note = f"Feeling easier — good adaptation"
            else:
                direction = "stable"
                severity = "neutral"
                note = "Normal effort level"

        elif metric == "soreness":
            # Higher soreness = worse
            if delta > 2.0 or (baseline_val + delta) >= 7:
                direction = "up"
                severity = "negative"
                note = f"Elevated ({baseline_val + delta:.0f}/10)"
            elif delta < -1.0:
                direction = "down"
                severity = "positive"
                note = "Less soreness than usual"
            else:
                direction = "stable"
                severity = "neutral"
                note = "Normal soreness levels"

        elif metric == "energy":
            # Higher energy = better
            if delta < -1.5 or (baseline_val + delta) <= 4:
                direction = "down"
                severity = "negative"
                note = f"Low energy ({baseline_val + delta:.0f}/10)"
            elif delta > 1.0:
                direction = "up"
                severity = "positive"
                note = f"Energy above baseline"
            else:
                direction = "stable"
                severity = "neutral"
                note = "Normal energy levels"
        else:
            direction = "stable"
            severity = "neutral"
            note = ""

        factors.append({
            "metric": metric,
            "label": label,
            "direction": direction,
            "severity": severity,
            "note": note,
            "baseline": baseline_val,
            "current": round(baseline_val + delta, 2) if baseline_val is not None else None,
            "delta": delta,
        })

    # Volume change description
    adj = decision.adjustment_factor
    if adj > 1.0:
        volume_change = f"+{round((adj - 1) * 100)}% training volume"
    elif adj < 1.0 and adj > 0:
        volume_change = f"-{round((1 - adj) * 100)}% training volume"
    elif adj == 0:
        volume_change = "Rest day"
    else:
        volume_change = "Normal volume"

    return {
        "decision_type": decision.decision_type,
        "title": DECISION_TITLES.get(decision.decision_type, decision.decision_type),
        "summary": DECISION_SUMMARIES.get(decision.decision_type, ""),
        "volume_change": volume_change,
        "confidence": decision.confidence,
        "confidence_pct": round(decision.confidence * 100),
        "factors": factors,
        "reasons": decision.reasons,
        "recommendations": decision.recommendations,
        "readiness_score": decision.readiness_score,
        "fatigue_risk": decision.fatigue_risk,
        "baseline_deltas": decision.baseline_deltas,
        "fortis_pulse": state.fortis_pulse,
    }
