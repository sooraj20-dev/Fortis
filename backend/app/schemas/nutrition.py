from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class FoodItemResponse(BaseModel):
    id: int
    name: str
    region: str
    sub_region: Optional[str] = None
    category: str
    meal_type: str
    calories_per_100g: float
    protein_per_100g: float
    carbs_per_100g: float
    fat_per_100g: float
    fiber_per_100g: float
    typical_serving_g: float
    estimated_cost_inr: float
    dietary_tags: List[str]
    model_config = {"from_attributes": True}


class FoodLogCreate(BaseModel):
    date: Optional[str] = None
    meal_type: str
    food_item_id: Optional[int] = None
    custom_food_name: Optional[str] = None
    quantity_g: float
    calories: Optional[float] = None
    protein_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None


class FoodLogResponse(BaseModel):
    id: int
    date: datetime
    meal_type: str
    food_item_id: Optional[int] = None
    custom_food_name: Optional[str] = None
    quantity_g: float
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    logged_at: datetime
    food_item: Optional[FoodItemResponse] = None
    model_config = {"from_attributes": True}


class NutritionSummary(BaseModel):
    date: str
    total_calories: float
    total_protein_g: float
    total_carbs_g: float
    total_fat_g: float
    target_calories: float
    target_protein_g: float
    budget_spent_inr: float
    budget_total_inr: float
    logs: List[FoodLogResponse]
    adherence_pct: float


class MealPlanRequest(BaseModel):
    daily_budget_inr: Optional[float] = None
    goal: Optional[str] = None
    regional_preference: Optional[str] = None
    diet_type: Optional[str] = None
    allergies: Optional[List[str]] = None
    available_ingredients: Optional[List[str]] = None


class MealPlanResponse(BaseModel):
    id: Optional[int] = None
    date: str
    daily_budget_inr: float
    meals: Dict[str, List[Dict[str, Any]]]
    total_calories: float
    total_protein_g: float
    total_cost_inr: float
    model_config = {"from_attributes": True}


class GroceryListResponse(BaseModel):
    id: Optional[int] = None
    week_start_date: str
    items: List[Dict[str, Any]]
    total_estimated_cost: float
    model_config = {"from_attributes": True}
