"""
Regional Foods Database — Kerala & Indian food intelligence.

This module provides helper functions to query and manage the regional food database.
Includes nutritional data with estimates clearly labeled.
"""
from sqlalchemy.orm import Session
from app.models.nutrition import FoodItem
from typing import List, Optional


def search_foods(
    db: Session,
    query: str = "",
    region: Optional[str] = None,
    meal_type: Optional[str] = None,
    dietary_tags: Optional[List[str]] = None,
    limit: int = 20
) -> List[FoodItem]:
    q = db.query(FoodItem).filter(FoodItem.is_active == True)

    if query:
        q = q.filter(FoodItem.name.ilike(f"%{query}%"))
    if region:
        q = q.filter(FoodItem.region == region)
    if meal_type:
        q = q.filter(FoodItem.meal_type == meal_type)

    foods = q.limit(limit).all()

    if dietary_tags:
        filtered = []
        for food in foods:
            tags = food.dietary_tags or []
            if any(tag in tags for tag in dietary_tags):
                filtered.append(food)
        return filtered

    return foods


def get_food_by_name(db: Session, name: str) -> Optional[FoodItem]:
    return db.query(FoodItem).filter(
        FoodItem.name.ilike(f"%{name}%"),
        FoodItem.is_active == True
    ).first()


def get_foods_for_meal(
    db: Session,
    meal_type: str,
    region: str = "Kerala",
    diet_type: str = "non_vegetarian",
    exclude_allergies: List[str] = None,
    limit: int = 10
) -> List[FoodItem]:
    q = db.query(FoodItem).filter(
        FoodItem.is_active == True,
        FoodItem.meal_type.in_([meal_type, "any"])
    )

    if region:
        q = q.filter(FoodItem.region.in_([region, "General", "South India"]))

    if diet_type == "vegetarian":
        q = q.filter(FoodItem.dietary_tags.contains(["vegetarian"]))

    foods = q.limit(limit * 3).all()

    if exclude_allergies:
        foods = [f for f in foods if not any(
            a.lower() in str(f.dietary_tags).lower()
            for a in exclude_allergies
        )]

    return foods[:limit]


def calculate_nutrition(food: FoodItem, quantity_g: float) -> dict:
    """Calculate actual nutrition for a given quantity."""
    factor = quantity_g / 100.0
    return {
        "calories": round(food.calories_per_100g * factor, 1),
        "protein_g": round(food.protein_per_100g * factor, 1),
        "carbs_g": round(food.carbs_per_100g * factor, 1),
        "fat_g": round(food.fat_per_100g * factor, 1),
        "fiber_g": round(food.fiber_per_100g * factor, 1),
    }
