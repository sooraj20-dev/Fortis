"""
Budget Nutrition Optimizer — Constraint-aware algorithm for cost-optimal meal planning.

Creates meal plans that maximize nutrition while strictly respecting a daily budget limit.
"""
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from app.models.nutrition import FoodItem


MEAL_TEMPLATES = {
    "STRENGTH": {
        "target_protein_pct": 0.30,
        "target_carbs_pct": 0.45,
        "target_fat_pct": 0.25,
        "target_calories": 2400,
    },
    "MUSCLE": {
        "target_protein_pct": 0.30,
        "target_carbs_pct": 0.45,
        "target_fat_pct": 0.25,
        "target_calories": 2600,
    },
    "WEIGHT_MANAGEMENT": {
        "target_protein_pct": 0.35,
        "target_carbs_pct": 0.35,
        "target_fat_pct": 0.30,
        "target_calories": 1800,
    },
    "ENDURANCE": {
        "target_protein_pct": 0.20,
        "target_carbs_pct": 0.55,
        "target_fat_pct": 0.25,
        "target_calories": 2500,
    },
    "GENERAL_FITNESS": {
        "target_protein_pct": 0.25,
        "target_carbs_pct": 0.50,
        "target_fat_pct": 0.25,
        "target_calories": 2200,
    },
}

MEAL_BUDGET_SPLIT = {
    "BREAKFAST": 0.25,
    "LUNCH": 0.35,
    "SNACK": 0.15,
    "DINNER": 0.25,
}

KERALA_MEAL_COMBOS = {
    "BREAKFAST": [
        ("Puttu", 150, "Kadala Curry", 120),
        ("Appam", 150, "Egg Curry", 120),
        ("Idli", 150, "Sambar", 120),
        ("Dosa (Plain)", 120, "Sambar", 120),
        ("Idiyappam", 150, "Egg Curry", 120),
    ],
    "LUNCH": [
        ("Rice (Kerala)", 200, "Fish Curry", 120),
        ("Rice (Kerala)", 200, "Chicken Curry", 120),
        ("Rice (Kerala)", 200, "Egg Curry", 120),
        ("Rice (Kerala)", 200, "Sambar", 150),
        ("Chapati", 120, "Dal", 150),
    ],
    "SNACK": [
        ("Banana", 100, "Boiled Eggs", 100),
        ("Banana", 100, None, None),
        ("Boiled Eggs", 100, None, None),
        ("Puttu with Banana", 100, None, None),
    ],
    "DINNER": [
        ("Chapati", 120, "Egg Curry", 120),
        ("Rice (Kerala)", 180, "Fish Curry", 100),
        ("Dosa (Plain)", 120, "Sambar", 120),
        ("Chapati", 120, "Dal", 150),
        ("Puttu", 150, "Kadala Curry", 120),
    ],
}


def generate_meal_plan(
    db: Session,
    goal: str,
    daily_budget_inr: float,
    regional_preference: str = "Kerala",
    diet_type: str = "non_vegetarian",
    allergies: List[str] = None,
    available_ingredients: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Generate a full-day meal plan strictly constrained within the user's daily budget.
    """
    allergies = allergies or []
    budget_limit = max(0.0, float(daily_budget_inr if daily_budget_inr is not None else 150.0))
    template = MEAL_TEMPLATES.get(goal, MEAL_TEMPLATES["GENERAL_FITNESS"])
    target_cal = template["target_calories"]
    target_protein = round(target_cal * template["target_protein_pct"] / 4.0, 1)

    meals: Dict[str, List[Dict[str, Any]]] = {}
    total_cost = 0.0
    remaining_daily_budget = budget_limit

    meal_types = ["BREAKFAST", "LUNCH", "SNACK", "DINNER"]
    for i, meal_type in enumerate(meal_types):
        fraction = MEAL_BUDGET_SPLIT.get(meal_type, 0.25)
        # Allocate fraction of total budget or whatever remains for last meal
        if i == len(meal_types) - 1:
            meal_budget = remaining_daily_budget
        else:
            meal_budget = min(remaining_daily_budget, budget_limit * fraction)

        if available_ingredients:
            items = _select_from_ingredients(
                db, meal_type, available_ingredients, meal_budget, diet_type, allergies
            )
        else:
            items = _select_standard_meal(
                db, meal_type, regional_preference, diet_type, meal_budget, allergies
            )

        meal_cost = sum(it["estimated_cost_inr"] for it in items)
        remaining_daily_budget = max(0.0, remaining_daily_budget - meal_cost)
        meals[meal_type] = items
        total_cost += meal_cost

    # Strict post-check: enforce total_cost <= budget_limit
    if total_cost > budget_limit and total_cost > 0:
        scale = budget_limit / total_cost
        total_cost = 0.0
        for m_type, m_items in meals.items():
            for it in m_items:
                it["quantity_g"] = max(0, int(it["quantity_g"] * scale))
                factor = it["quantity_g"] / 100.0
                it["calories"] = round(it.get("cal_per_100g", 120.0) * factor, 1)
                it["protein_g"] = round(it.get("prot_per_100g", 3.0) * factor, 1)
                it["carbs_g"] = round(it.get("carbs_per_100g", 15.0) * factor, 1)
                it["fat_g"] = round(it.get("fat_per_100g", 2.0) * factor, 1)
                it["estimated_cost_inr"] = round(it.get("cost_per_100g", 15.0) * factor, 2)
                if it["quantity_g"] <= 0:
                    it["estimated_cost_inr"] = 0.0
                total_cost += it["estimated_cost_inr"]

        # Rounding can still push scaled portions a few paise over the cap.
        # Remove the smallest remaining portions until displayed item costs fit.
        flat_items = [item for items in meals.values() for item in items]
        while sum(item["estimated_cost_inr"] for item in flat_items) > budget_limit:
            item = max(flat_items, key=lambda row: row["estimated_cost_inr"], default=None)
            if item is None:
                break
            item["quantity_g"] = max(0, item["quantity_g"] - 1)
            factor = item["quantity_g"] / 100.0
            for field, source, fallback in (("calories", "cal_per_100g", 120.0), ("protein_g", "prot_per_100g", 3.0), ("carbs_g", "carbs_per_100g", 15.0), ("fat_g", "fat_per_100g", 2.0)):
                item[field] = round(item.get(source, fallback) * factor, 1)
            item["estimated_cost_inr"] = round(item.get("cost_per_100g", 15.0) * factor, 2)
            if item["quantity_g"] == 0:
                flat_items.remove(item)

    total_calories = round(sum(it["calories"] for items in meals.values() for it in items), 1)
    total_protein = round(sum(it["protein_g"] for items in meals.values() for it in items), 1)
    total_carbs = round(sum(it["carbs_g"] for items in meals.values() for it in items), 1)
    total_fat = round(sum(it["fat_g"] for items in meals.values() for it in items), 1)
    total_cost_rounded = round(sum(it["estimated_cost_inr"] for items in meals.values() for it in items), 2)
    budget_remaining = round(max(0.0, budget_limit - total_cost_rounded), 2)

    # Explanation of macro and calorie delivery vs target
    if total_calories < target_cal * 0.88:
        needed_budget = round(budget_limit * (target_cal / max(total_calories, 1)) * 0.95)
        explanation = (
            f"At ₹{budget_limit:.0f}/day, this plan prioritizes authentic regional protein ({total_protein}g). "
            f"Delivered energy ({total_calories} kcal) is below target ({target_cal} kcal) due to budget limits. "
            f"Increasing budget to ~₹{needed_budget}/day reaches full caloric and macronutrient targets."
        )
    else:
        explanation = (
            f"This plan delivers {total_calories} kcal and {total_protein}g protein, "
            f"meeting your {goal.replace('_', ' ').lower()} requirements within your ₹{budget_limit:.0f} budget."
        )

    return {
        "meals": meals,
        "total_calories": total_calories,
        "total_protein_g": total_protein,
        "total_carbs_g": total_carbs,
        "total_fat_g": total_fat,
        "total_cost_inr": total_cost_rounded,
        "target_budget_inr": budget_limit,
        "budget_remaining_inr": budget_remaining,
        "budget_exceeded": False,
        "target_calories": target_cal,
        "target_protein_g": target_protein,
        "goal": goal,
        "regional_preference": regional_preference,
        "diet_type": diet_type,
        "explanation": explanation,
        "disclaimer": "Nutritional values are estimates based on regional food database averages. Actual values vary by preparation and portion size.",
    }


def _select_standard_meal(
    db: Session,
    meal_type: str,
    region: str,
    diet_type: str,
    budget: float,
    allergies: List[str]
) -> List[Dict]:
    """Select meal items within available meal budget using regional combo templates."""
    import random

    combos = KERALA_MEAL_COMBOS.get(meal_type, [])
    if not combos:
        return []

    # Filter combos based on diet type
    if diet_type == "vegetarian":
        combos = [c for c in combos if not any(
            meat in str(c).lower() for meat in ["fish", "chicken", "egg", "mutton", "beef"]
        )]

    if not combos:
        combos = KERALA_MEAL_COMBOS.get(meal_type, [])

    combo = random.choice(combos) if combos else None
    if not combo:
        return []

    items = []
    names_to_use = [(combo[0], combo[1])]
    if combo[2] is not None:
        names_to_use.append((combo[2], combo[3]))

    remaining_meal_budget = budget
    for food_name, target_qty in names_to_use:
        if remaining_meal_budget <= 2.0:
            break

        food = db.query(FoodItem).filter(
            FoodItem.name.ilike(f"%{food_name}%"),
            FoodItem.is_active == True
        ).first()

        if not food:
            continue

        cost_per_g = max(0.01, (food.estimated_cost_inr or 15.0) / 100.0)
        # Allocate at most half the remaining budget to first item if there are two items
        max_item_budget = remaining_meal_budget * (0.55 if len(names_to_use) > 1 and len(items) == 0 else 1.0)
        affordable_qty = int(max_item_budget / cost_per_g)
        qty_g = min(target_qty, affordable_qty)
        if qty_g <= 0:
            continue
        actual_cost = round(cost_per_g * qty_g, 2)

        if actual_cost > remaining_meal_budget:
            qty_g = max(0, int(remaining_meal_budget / cost_per_g))
            actual_cost = round(cost_per_g * qty_g, 2)
        if qty_g <= 0 or actual_cost > remaining_meal_budget:
            continue

        factor = qty_g / 100.0
        items.append({
            "food_id": food.id,
            "name": food.name,
            "quantity_g": qty_g,
            "calories": round(food.calories_per_100g * factor, 1),
            "protein_g": round(food.protein_per_100g * factor, 1),
            "carbs_g": round(food.carbs_per_100g * factor, 1),
            "fat_g": round(food.fat_per_100g * factor, 1),
            "estimated_cost_inr": actual_cost,
            "region": food.region,
            "cal_per_100g": food.calories_per_100g,
            "prot_per_100g": food.protein_per_100g,
            "carbs_per_100g": food.carbs_per_100g,
            "fat_per_100g": food.fat_per_100g,
            "cost_per_100g": food.estimated_cost_inr or 15.0,
        })
        remaining_meal_budget = max(0.0, remaining_meal_budget - actual_cost)

    return items


def _select_from_ingredients(
    db: Session,
    meal_type: str,
    available: List[str],
    budget: float,
    diet_type: str,
    allergies: List[str]
) -> List[Dict]:
    """Select meal items from available ingredients list while respecting budget."""
    available_lower = [a.lower().strip() for a in available if a.strip()]
    matching_foods = db.query(FoodItem).filter(FoodItem.is_active == True).all()

    matched = []
    for food in matching_foods:
        if any(avail in food.name.lower() or food.name.lower() in avail for avail in available_lower):
            matched.append(food)

    if not matched:
        return []

    items = []
    remaining_budget = budget
    for food in matched[:2]:
        if remaining_budget <= 2.0:
            break
        cost_per_g = max(0.01, (food.estimated_cost_inr or 15.0) / 100.0)
        max_item_budget = remaining_budget * 0.7 if len(items) == 0 else remaining_budget
        qty_g = min(food.typical_serving_g or 100, int(max_item_budget / cost_per_g))
        if qty_g <= 0:
            continue
        cost = round(cost_per_g * qty_g, 2)

        factor = qty_g / 100.0
        items.append({
            "food_id": food.id,
            "name": food.name,
            "quantity_g": qty_g,
            "calories": round(food.calories_per_100g * factor, 1),
            "protein_g": round(food.protein_per_100g * factor, 1),
            "carbs_g": round(food.carbs_per_100g * factor, 1),
            "fat_g": round(food.fat_per_100g * factor, 1),
            "estimated_cost_inr": cost,
            "from_available_ingredients": True,
            "cal_per_100g": food.calories_per_100g,
            "prot_per_100g": food.protein_per_100g,
            "carbs_per_100g": food.carbs_per_100g,
            "fat_per_100g": food.fat_per_100g,
            "cost_per_100g": food.estimated_cost_inr or 15.0,
        })
        remaining_budget = max(0.0, remaining_budget - cost)

    return items
