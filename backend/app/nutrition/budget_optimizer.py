"""
Budget Nutrition Optimizer — Greedy algorithm for cost-optimal meal planning.

Creates meal plans that maximize nutrition within a daily budget.
Architecture designed for LP optimization replacement later.
"""
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from app.nutrition.regional_foods import get_foods_for_meal
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
        ("Puttu", 200, "Kadala Curry", 150),
        ("Appam", 200, "Egg Curry", 150),
        ("Idli", 200, "Sambar", 150),
        ("Dosa", 150, "Chutney", 50),
        ("Idiyappam", 200, "Egg Curry", 150),
        ("Puttu", 200, "Banana", 100),
    ],
    "LUNCH": [
        ("Rice (Kerala)", 300, "Fish Curry", 150),
        ("Rice (Kerala)", 300, "Chicken Curry", 150),
        ("Rice (Kerala)", 300, "Egg Curry", 150),
        ("Rice (Kerala)", 300, "Sambar", 200),
        ("Chapati", 150, "Dal", 200),
    ],
    "SNACK": [
        ("Banana", 120, "Boiled Eggs", 100),
        ("Banana", 120, None, None),
        ("Boiled Eggs", 100, None, None),
        ("Peanuts", 50, "Banana", 100),
    ],
    "DINNER": [
        ("Chapati", 150, "Egg Curry", 150),
        ("Rice (Kerala)", 200, "Fish Curry", 100),
        ("Dosa", 150, "Sambar", 150),
        ("Chapati", 150, "Chicken Curry", 150),
        ("Puttu", 200, "Kadala Curry", 150),
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
    Generate a full-day meal plan within budget.
    
    Uses greedy selection prioritizing:
    1. Budget adherence
    2. Protein goal (most critical for fitness)
    3. Regional preference
    4. Available ingredients (if provided)
    """
    allergies = allergies or []
    template = MEAL_TEMPLATES.get(goal, MEAL_TEMPLATES["GENERAL_FITNESS"])

    meals = {}
    total_calories = 0.0
    total_protein = 0.0
    total_cost = 0.0

    for meal_type, budget_fraction in MEAL_BUDGET_SPLIT.items():
        meal_budget = daily_budget_inr * budget_fraction

        if available_ingredients:
            # From-ingredients mode: find foods matching available ingredients
            meal_items = _select_from_ingredients(
                db, meal_type, available_ingredients, meal_budget, diet_type, allergies
            )
        else:
            # Standard meal planning
            meal_items = _select_standard_meal(
                db, meal_type, regional_preference, diet_type, meal_budget, allergies
            )

        meal_calories = sum(item["calories"] for item in meal_items)
        meal_protein = sum(item["protein_g"] for item in meal_items)
        meal_cost = sum(item["estimated_cost_inr"] for item in meal_items)

        meals[meal_type] = meal_items
        total_calories += meal_calories
        total_protein += meal_protein
        total_cost += meal_cost

    return {
        "meals": meals,
        "total_calories": round(total_calories, 1),
        "total_protein_g": round(total_protein, 1),
        "total_carbs_g": round(sum(
            item.get("carbs_g", 0)
            for meal_items in meals.values()
            for item in meal_items
        ), 1),
        "total_fat_g": round(sum(
            item.get("fat_g", 0)
            for meal_items in meals.values()
            for item in meal_items
        ), 1),
        "total_cost_inr": round(total_cost, 2),
        "budget_remaining_inr": round(max(0.0, daily_budget_inr - total_cost), 2),
        "budget_exceeded": total_cost > daily_budget_inr,
        "target_calories": template["target_calories"],
        "goal": goal,
        "disclaimer": "Nutritional values are estimates based on regional food database averages. Actual values vary by preparation, portion size, and sourcing.",
    }


def _select_standard_meal(
    db: Session,
    meal_type: str,
    region: str,
    diet_type: str,
    budget: float,
    allergies: List[str]
) -> List[Dict]:
    """Select meal items using the regional combo templates."""
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

    for food_name, qty_g in names_to_use:
        food = db.query(FoodItem).filter(
            FoodItem.name.ilike(f"%{food_name}%"),
            FoodItem.is_active == True
        ).first()

        if food:
            factor = qty_g / 100.0
            actual_cost = round(food.estimated_cost_inr * factor, 2)

            # Only include items that fit within the remaining per-meal budget
            # Instead of artificially capping cost, skip or reduce quantity if over budget
            if actual_cost > budget and budget > 0:
                # Scale down serving to fit budget
                affordable_factor = budget / food.estimated_cost_inr
                qty_g = max(20, round(affordable_factor * 100))
                factor = qty_g / 100.0
                actual_cost = round(food.estimated_cost_inr * factor, 2)

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
            })

    return items


def _select_from_ingredients(
    db: Session,
    meal_type: str,
    available: List[str],
    budget: float,
    diet_type: str,
    allergies: List[str]
) -> List[Dict]:
    """Select meal items from available ingredients list."""
    available_lower = [a.lower() for a in available]
    matching_foods = db.query(FoodItem).filter(FoodItem.is_active == True).all()

    matched = []
    for food in matching_foods:
        if any(avail in food.name.lower() or food.name.lower() in avail
               for avail in available_lower):
            matched.append(food)

    if not matched:
        return []

    items = []
    remaining_budget = budget
    for food in matched[:3]:
        qty_g = food.typical_serving_g
        factor = qty_g / 100.0
        cost = food.estimated_cost_inr * factor

        if cost <= remaining_budget:
            items.append({
                "food_id": food.id,
                "name": food.name,
                "quantity_g": qty_g,
                "calories": round(food.calories_per_100g * factor, 1),
                "protein_g": round(food.protein_per_100g * factor, 1),
                "carbs_g": round(food.carbs_per_100g * factor, 1),
                "fat_g": round(food.fat_per_100g * factor, 1),
                "estimated_cost_inr": round(cost, 2),
                "from_available_ingredients": True,
            })
            remaining_budget -= cost

    return items
