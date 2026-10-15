"""Fast unit coverage for data calculations that must not depend on database state."""
from app.models.recovery import compute_recovery_score
from app.ml.progress import forecast_pulse
from app.nutrition import budget_optimizer


class _Session:
    pass


def _item(cost, calories, protein, carbs, fat):
    return {
        "quantity_g": 100, "estimated_cost_inr": cost,
        "calories": calories, "protein_g": protein, "carbs_g": carbs, "fat_g": fat,
        "cal_per_100g": calories, "prot_per_100g": protein,
        "carbs_per_100g": carbs, "fat_per_100g": fat,
        "cost_per_100g": cost,
    }


def test_budget_plan_cost_and_nutrient_totals_match_displayed_items(monkeypatch):
    monkeypatch.setattr(budget_optimizer, "_select_standard_meal", lambda *args: [_item(80, 300, 12, 45, 8)])
    monkeypatch.setattr(budget_optimizer, "_select_from_ingredients", lambda *args: [_item(80, 300, 12, 45, 8)])
    result = budget_optimizer.generate_meal_plan(_Session(), "GENERAL_FITNESS", 100)
    items = [item for meal in result["meals"].values() for item in meal]
    assert result["total_cost_inr"] == round(sum(item["estimated_cost_inr"] for item in items), 2)
    assert result["total_cost_inr"] <= result["target_budget_inr"]
    assert result["total_calories"] == round(sum(item["calories"] for item in items), 1)
    assert result["total_protein_g"] == round(sum(item["protein_g"] for item in items), 1)


def test_recovery_score_uses_only_measured_signals():
    assert compute_recovery_score(energy=8, soreness=2) == 85.0
    assert compute_recovery_score() is None


def test_progress_forecast_is_missing_until_sufficient_history():
    result = forecast_pulse([54, None], days_ahead=14)
    assert result["trend_label"] == "insufficient_data"
    assert result["forecast_7d"] is None
    assert result["forecast_14d"] is None
    assert result["data_points"] == 1
