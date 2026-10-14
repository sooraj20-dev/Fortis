"""Nutrition router"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, date
from typing import Optional, List
from app.database import get_db
from app.deps import get_current_user
from app.models.user import User
from app.models.nutrition import FoodItem, FoodLog, MealPlan, GroceryList
from app.models.profile import Goal, NutritionPreference
from app.schemas.nutrition import FoodLogCreate, FoodLogResponse, NutritionSummary, MealPlanRequest, MealPlanResponse
from app.nutrition.budget_optimizer import generate_meal_plan

router = APIRouter(prefix="/api", tags=["nutrition"])


@router.get("/nutrition/today")
def get_today_nutrition(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = datetime.utcnow().date()
    logs = db.query(FoodLog).filter(
        FoodLog.user_id == current_user.id,
        func.date(FoodLog.date) == today
    ).all()

    nutr_pref = db.query(NutritionPreference).filter(NutritionPreference.user_id == current_user.id).first()
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).first()

    target_cal = {"STRENGTH": 2400, "MUSCLE": 2600, "WEIGHT_MANAGEMENT": 1800,
                  "ENDURANCE": 2500, "GENERAL_FITNESS": 2200}.get(
        goal.primary_goal if goal else "GENERAL_FITNESS", 2200)
    target_protein = target_cal * 0.25 / 4  # 25% protein

    total_cal = sum(l.calories for l in logs)
    total_protein = sum(l.protein_g for l in logs)
    total_carbs = sum(l.carbs_g for l in logs)
    total_fat = sum(l.fat_g for l in logs)

    log_data = []
    for l in logs:
        food = db.query(FoodItem).filter(FoodItem.id == l.food_item_id).first() if l.food_item_id else None
        log_data.append({
            "id": l.id,
            "meal_type": l.meal_type,
            "food_name": food.name if food else l.custom_food_name,
            "quantity_g": l.quantity_g,
            "calories": l.calories,
            "protein_g": l.protein_g,
            "carbs_g": l.carbs_g,
            "fat_g": l.fat_g,
            "logged_at": l.logged_at.isoformat(),
        })

    return {
        "date": today.isoformat(),
        "total_calories": round(total_cal, 1),
        "total_protein_g": round(total_protein, 1),
        "total_carbs_g": round(total_carbs, 1),
        "total_fat_g": round(total_fat, 1),
        "target_calories": target_cal,
        "target_protein_g": round(target_protein, 1),
        "calories_pct": round(min(100, total_cal / target_cal * 100), 1),
        "protein_pct": round(min(100, total_protein / max(target_protein, 1) * 100), 1),
        "budget_inr": nutr_pref.daily_budget_inr if nutr_pref else 150.0,
        "logs": log_data,
        # Adherence: penalize both under- and over-eating relative to target
        # Calories contribute 60% weight; protein contributes 40% weight.
        # Over-consumption beyond target yields no credit — clamped at target.
        "adherence_pct": round(
            min(100, (min(total_cal, target_cal) / target_cal) * 60) +
            min(40, (min(total_protein, target_protein) / max(target_protein, 1)) * 40),
            1
        ),
    }


@router.post("/nutrition/log")
def log_food(data: FoodLogCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.quantity_g is not None and data.quantity_g <= 0:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="quantity_g must be positive")

    calories = data.calories
    protein_g = data.protein_g or 0
    carbs_g = data.carbs_g or 0
    fat_g = data.fat_g or 0

    food = None
    if data.food_item_id:
        food = db.query(FoodItem).filter(FoodItem.id == data.food_item_id).first()
        if not food:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Food item not found")
        if not calories:
            factor = data.quantity_g / 100.0
            calories = food.calories_per_100g * factor
            protein_g = food.protein_per_100g * factor
            carbs_g = food.carbs_per_100g * factor
            fat_g = food.fat_per_100g * factor
    elif not data.custom_food_name:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="Either food_item_id or custom_food_name must be provided")

    log_date = datetime.strptime(data.date, "%Y-%m-%d") if data.date else datetime.utcnow()
    log = FoodLog(
        user_id=current_user.id,
        date=log_date,
        meal_type=data.meal_type,
        food_item_id=food.id if food else None,
        custom_food_name=data.custom_food_name,
        quantity_g=data.quantity_g,
        calories=round(calories or 0, 1),
        protein_g=round(protein_g, 1),
        carbs_g=round(carbs_g, 1),
        fat_g=round(fat_g, 1),
        logged_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    return {"message": "Food logged", "log_id": log.id, "calories": log.calories}


@router.get("/nutrition/foods/search")
def search_foods(
    q: str = Query(default="", description="Food name search"),
    region: Optional[str] = None,
    meal_type: Optional[str] = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(FoodItem).filter(FoodItem.is_active == True)
    if q:
        query = query.filter(FoodItem.name.ilike(f"%{q}%"))
    if region:
        query = query.filter(FoodItem.region == region)
    if meal_type:
        query = query.filter(FoodItem.meal_type.in_([meal_type, "any"]))
    foods = query.limit(limit).all()
    return [{
        "id": f.id, "name": f.name, "region": f.region, "category": f.category,
        "meal_type": f.meal_type, "calories_per_100g": f.calories_per_100g,
        "protein_per_100g": f.protein_per_100g, "carbs_per_100g": f.carbs_per_100g,
        "fat_per_100g": f.fat_per_100g, "typical_serving_g": f.typical_serving_g,
        "estimated_cost_inr": f.estimated_cost_inr, "dietary_tags": f.dietary_tags,
    } for f in foods]


@router.post("/diet/generate")
def generate_diet(data: MealPlanRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).first()
    nutr_pref = db.query(NutritionPreference).filter(NutritionPreference.user_id == current_user.id).first()

    result = generate_meal_plan(
        db=db,
        goal=goal.primary_goal if goal else data.goal,
        daily_budget_inr=data.daily_budget_inr or (nutr_pref.daily_budget_inr if nutr_pref else 150),
        regional_preference=data.regional_preference,
        diet_type=data.diet_type,
        allergies=data.allergies,
        available_ingredients=data.available_ingredients,
    )
    result["date"] = datetime.utcnow().date().isoformat()
    return result


@router.post("/diet/from-ingredients")
def plan_from_ingredients(
    available_ingredients: List[str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).first()
    nutr_pref = db.query(NutritionPreference).filter(NutritionPreference.user_id == current_user.id).first()

    result = generate_meal_plan(
        db=db,
        goal=goal.primary_goal if goal else "GENERAL_FITNESS",
        daily_budget_inr=nutr_pref.daily_budget_inr if nutr_pref else 150,
        regional_preference=nutr_pref.regional_preference if nutr_pref else "Kerala",
        diet_type=nutr_pref.diet_type if nutr_pref else "non_vegetarian",
        allergies=nutr_pref.allergies if nutr_pref else [],
        available_ingredients=available_ingredients,
    )
    result["date"] = datetime.utcnow().date().isoformat()
    result["from_available_ingredients"] = True
    return result


@router.post("/grocery-list/generate")
def generate_grocery_list(
    days: int = 7,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    nutr_pref = db.query(NutritionPreference).filter(NutritionPreference.user_id == current_user.id).first()
    budget = nutr_pref.daily_budget_inr if nutr_pref else 150

    # Simple grocery list based on typical Kerala weekly staples
    items = [
        {"name": "Rice (Kerala red)", "quantity": 2.5, "unit": "kg", "estimated_cost_inr": 120},
        {"name": "Eggs", "quantity": 18, "unit": "pieces", "estimated_cost_inr": 108},
        {"name": "Banana (Robusta)", "quantity": 12, "unit": "pieces", "estimated_cost_inr": 60},
        {"name": "Mixed vegetables", "quantity": 1.5, "unit": "kg", "estimated_cost_inr": 90},
        {"name": "Fish (sardines/anchovy)", "quantity": 0.75, "unit": "kg", "estimated_cost_inr": 150},
        {"name": "Chicken", "quantity": 0.5, "unit": "kg", "estimated_cost_inr": 120},
        {"name": "Dal (toor)", "quantity": 0.5, "unit": "kg", "estimated_cost_inr": 60},
        {"name": "Chapati flour (atta)", "quantity": 1, "unit": "kg", "estimated_cost_inr": 50},
        {"name": "Coconut oil", "quantity": 0.25, "unit": "litre", "estimated_cost_inr": 75},
        {"name": "Tomatoes", "quantity": 0.5, "unit": "kg", "estimated_cost_inr": 30},
        {"name": "Onions", "quantity": 0.5, "unit": "kg", "estimated_cost_inr": 25},
        {"name": "Curd", "quantity": 0.5, "unit": "litre", "estimated_cost_inr": 40},
    ]
    total = sum(item["estimated_cost_inr"] for item in items)

    from datetime import timedelta
    week_start = datetime.utcnow().date()
    grocery = GroceryList(
        user_id=current_user.id,
        week_start_date=datetime.combine(week_start, datetime.min.time()),
        items=items,
        total_estimated_cost=round(total, 2),
        created_at=datetime.utcnow(),
    )
    db.add(grocery)
    db.commit()

    return {
        "week_start_date": week_start.isoformat(),
        "items": items,
        "total_estimated_cost": round(total, 2),
        "budget_inr": round(budget * 7, 2),
        "disclaimer": "Prices are estimates and may vary by location and season.",
    }


@router.get("/grocery-list")
def get_grocery_list(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    grocery = db.query(GroceryList).filter(
        GroceryList.user_id == current_user.id
    ).order_by(desc(GroceryList.created_at)).first()

    if not grocery:
        return {"items": [], "total_estimated_cost": 0, "message": "No grocery list yet. Generate one!"}

    return {
        "id": grocery.id,
        "week_start_date": grocery.week_start_date.date().isoformat(),
        "items": grocery.items,
        "total_estimated_cost": grocery.total_estimated_cost,
    }
