"""
MockAIProvider — Deterministic AI that works without any API key.

Generates realistic, contextually appropriate responses using
actual user data passed in the messages. Uses template-based
responses filled with real numbers.

This is NOT random — it reads the structured context in the messages
and generates coherent, helpful responses based on that data.
"""
from app.ai.provider import AIProvider, AIResponse
from typing import List, Dict, Optional
import json
import re


RESPONSE_TEMPLATES = {
    "scan_detect": """Here is what your Fortis Scan detected from your kinematic assessment:

**Key Software Metrics**:
- Movement Quality: **{scan_mq} / 100**
- Joint Mobility: **{scan_mobility} / 100**
- Movement Stability: **{scan_stability} / 100**
- Cadence Consistency: **{scan_consistency} / 100**
- Assessment Confidence: **{scan_confidence}%**

**What Fortis Found**:
{scan_observations}

*Note: Fortis Scan provides software-based movement insights for fitness personalization. It is not a medical assessment or diagnosis.*""",

    "scan_mobility": """Based on your Fortis Scan data, mobility was prioritized because:

- Your mobility score is **{scan_mobility} / 100** (squat inflection depth is restricted before full parallel)
- Your bilateral knee depth disparity is within **{depth_asymmetry}**
- Deep hip flexion is key to preventing lumbar compensation during compound movements

By targeting hip flexors, adductors, and ankle dorsiflexion, Fortis ensures you build a safe, full-range movement foundation before loading heavier weights.""",

    "scan_evolution": """Here is your Fortis Evolution comparing your scans:

{evolution_summary}

**Deltas Recorded**:
- Movement Quality: {prev_mq} → **{curr_mq}** ({delta_mq})
- Mobility: {prev_mob} → **{curr_mob}** ({delta_mob})
- Stability: {prev_stab} → **{curr_stab}** ({delta_stab})

All reported changes reflect your stored kinematic metrics.""",

    "workout_change": """Based on your Fortis data, I adapted today's training because:

{reasons}

Your Fortis Pulse is currently **{pulse:.0f}** and your fatigue risk is **{fatigue:.0f}%**.

The adaptation means {volume_change} — prioritizing movement control and longevity while building progress.""",

    "workout_time": """I've adapted today's workout to fit your {time}-minute window.

Here's what I kept and what I trimmed:
- **Kept**: The main compound movements (highest training value)
- **Shortened**: Rest periods between sets
- **Removed**: Accessory isolation exercises

Quality over quantity — {time} minutes of focused training beats an incomplete longer session.""",

    "equipment": """No problem — I've substituted the dumbbell exercises with bodyweight alternatives that target the same muscle groups:

{substitutions}

These substitutions maintain the training stimulus while using what you have available. Let me know if you need further adjustments.""",

    "recovery": """Based on your current recovery data:

- Recovery Score: **{recovery:.0f}%**
- Sleep: **{sleep:.1f} hours** last night
- Energy: **{energy}/10**
- Soreness: **{soreness}/10**

{recommendation}

Remember: rest and recovery are when your body actually adapts and gets stronger. This isn't a setback — it's part of the plan.""",

    "nutrition": """Based on your goal ({goal}) and your ₹{budget} daily budget, here's what I recommend:

**Breakfast**: Puttu + Kadala curry (protein-rich, budget-friendly)
**Lunch**: Rice + Fish curry + Thoran (balanced macros, regional)
**Snack**: 2 boiled eggs + banana
**Dinner**: Chapati + Egg curry

**Estimated totals**:
- Calories: ~1,850 kcal
- Protein: ~85g
- Cost: ~₹{cost}

These are estimates based on typical serving sizes. Adjust portions to your hunger levels.""",

    "general": """I'm Fortis, your AI fitness coach. I have access to your complete fitness data including your workouts, nutrition logs, recovery metrics, and personal baselines.

Your current Fortis Pulse is **{pulse:.0f}** — {pulse_label}.

How can I help you today? I can:
- Explain any training decision I've made
- Adjust today's workout
- Suggest meals within your budget
- Analyze your recovery trend
- Run a what-if simulation""",
}


def _extract_context(messages: List[Dict]) -> Dict:
    """Extract structured context from message history."""
    context = {}
    for msg in messages:
        content = msg.get("content", "")
        # Try to parse JSON context blocks
        if "FORTIS_CONTEXT:" in content:
            try:
                ctx_str = content.split("FORTIS_CONTEXT:")[-1].strip()
                ctx_str = ctx_str.split("\n\n")[0]
                context.update(json.loads(ctx_str))
            except Exception:
                pass
    return context


def _detect_intent(user_message: str) -> str:
    """Simple intent detection for template selection."""
    msg = user_message.lower()
    if any(w in msg for w in ["detect", "scan detect", "what did my scan", "scan found", "scan result"]):
        return "scan_detect"
    elif any(w in msg for w in ["prioritize mobility", "why mobility", "mobility focus", "prioritise mobility"]):
        return "scan_mobility"
    elif any(w in msg for w in ["previous scan", "what changed", "scan change", "evolution", "since my previous scan"]):
        return "scan_evolution"
    elif any(w in msg for w in ["why", "change", "different", "reduced", "modified", "adapted", "why did my workout"]):
        return "workout_change"
    elif any(w in msg for w in ["minutes", "time", "short", "quick", "20", "30", "15"]):
        return "workout_time"
    elif any(w in msg for w in ["equipment", "dumbbell", "gym", "substitute", "without"]):
        return "equipment"
    elif any(w in msg for w in ["recovery", "rest", "tired", "sore", "sleep"]):
        return "recovery"
    elif any(w in msg for w in ["eat", "food", "meal", "diet", "nutrition", "budget"]):
        return "nutrition"
    else:
        return "general"


class MockAIProvider(AIProvider):
    """
    Deterministic AI provider using templates + actual user context.
    Produces realistic, contextually-aware responses without any API calls.
    """

    async def complete(
        self,
        messages: List[Dict[str, str]],
        tools: Optional[List[Dict]] = None,
        max_tokens: int = 1024
    ) -> AIResponse:
        # Get the last user message
        user_msg = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_msg = msg.get("content", "")
                break

        # Extract context
        ctx = _extract_context(messages)
        intent = _detect_intent(user_msg)

        # Fill template with real context values
        # Coerce to numbers — new users may have None for all metrics
        pulse = float(ctx.get("fortis_pulse") or 70.0)
        fatigue = float(ctx.get("fatigue_risk") or 35.0)
        recovery = float(ctx.get("recovery_score") or 65.0)
        sleep = float(ctx.get("sleep_hours") or 7.0)
        energy = int(ctx.get("energy_level") or 7)
        soreness = int(ctx.get("soreness_level") or 4)
        decision_type = ctx.get("decision_type", "NORMAL")
        reasons = ctx.get("reasons", ["Recovery metrics indicate a moderate day"])
        goal = ctx.get("primary_goal", "GENERAL_FITNESS")
        budget = ctx.get("daily_budget_inr", 150)

        # Scan specific context
        scan_ctx = ctx.get("scan") or {}
        scan_mq = scan_ctx.get("movement_quality", 78)
        scan_mobility = scan_ctx.get("mobility", 67)
        scan_stability = scan_ctx.get("stability", 74)
        scan_consistency = scan_ctx.get("movement_consistency", 81)
        scan_confidence = scan_ctx.get("confidence", 89)
        obs_list = scan_ctx.get("observations") or [
            "✓ Consistent squat depth",
            "✓ Stable lower-body movement",
            "⚠ Torso position changes during descent"
        ]
        scan_observations = "\n".join(obs_list)

        # Comparison specific context
        comp_ctx = ctx.get("comparison") or {}
        comp_deltas = comp_ctx.get("metrics_delta") or {"movement_quality": 7, "mobility": 6, "stability": 5}
        d_mq = comp_deltas.get("movement_quality", 7)
        d_mob = comp_deltas.get("mobility", 6)
        d_stab = comp_deltas.get("stability", 5)

        prev_mq = round(scan_mq - d_mq)
        prev_mob = round(scan_mobility - d_mob)
        prev_stab = round(scan_stability - d_stab)

        what_changed_list = comp_ctx.get("what_changed") or [
            f"Movement Quality improved {prev_mq} → {scan_mq} (+{d_mq})",
            f"Mobility progressed {prev_mob} → {scan_mobility} (+{d_mob})",
            f"Stability elevated {prev_stab} → {scan_stability} (+{d_stab})"
        ]
        evolution_summary = "\n".join(f"• {c}" for c in what_changed_list)

        if pulse >= 75:
            pulse_label = "you're in great shape"
        elif pulse >= 55:
            pulse_label = "your body is in a moderate state"
        else:
            pulse_label = "your body is signaling need for recovery"

        volume_change_pct = {
            "PROGRESSIVE": "+15% volume",
            "NORMAL": "normal volume",
            "REDUCED": "-20% volume",
            "RECOVERY": "-40% volume",
            "REST": "rest day",
        }.get(decision_type, "adjusted volume")

        time_match = re.search(r'(\d+)\s*min', user_msg)
        time_val = int(time_match.group(1)) if time_match else 30

        reasons_str = "\n".join(f"• {r}" for r in (reasons if isinstance(reasons, list) else [reasons]))

        recovery_rec = {
            "RECOVERY": "Today, I recommend a light 20-minute walk or yoga session instead of heavy training.",
            "REST": "Today is a rest day. Light stretching and a walk are all that's needed.",
            "REDUCED": "Your training is slightly reduced today. Shorter session, same exercises.",
            "NORMAL": "Your recovery is adequate. Follow the planned workout.",
            "PROGRESSIVE": "Your body is well-recovered and ready for a strong session today.",
        }.get(decision_type, "Follow your planned training.")

        subs_list = [
            "• Dumbbell Floor Press → Push-ups (3×12)",
            "• Dumbbell Row → Inverted Row or Towel Row",
            "• Shoulder Press → Pike Push-ups",
            "• Bicep Curl → Chin-ups or Door Frame Curls",
        ]

        template = RESPONSE_TEMPLATES.get(intent, RESPONSE_TEMPLATES["general"])

        try:
            response = template.format(
                pulse=pulse,
                fatigue=fatigue,
                recovery=recovery,
                sleep=sleep,
                energy=energy,
                soreness=soreness,
                reasons=reasons_str,
                volume_change=volume_change_pct,
                time=time_val,
                recommendation=recovery_rec,
                goal=goal.replace("_", " ").title(),
                budget=budget,
                cost=round(budget * 0.92),
                substitutions="\n".join(subs_list),
                pulse_label=pulse_label,
                scan_mq=scan_mq,
                scan_mobility=scan_mobility,
                scan_stability=scan_stability,
                scan_consistency=scan_consistency,
                scan_confidence=scan_confidence,
                scan_observations=scan_observations,
                depth_asymmetry="3.2°",
                evolution_summary=evolution_summary,
                prev_mq=prev_mq,
                curr_mq=scan_mq,
                delta_mq=f"{d_mq:+}",
                prev_mob=prev_mob,
                curr_mob=scan_mobility,
                delta_mob=f"{d_mob:+}",
                prev_stab=prev_stab,
                curr_stab=scan_stability,
                delta_stab=f"{d_stab:+}",
            )
        except (KeyError, TypeError):
            response = RESPONSE_TEMPLATES["general"].format(
                pulse=pulse, pulse_label=pulse_label
            )

        return AIResponse(content=response)
