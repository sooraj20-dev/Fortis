from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, JSON, Boolean
from sqlalchemy.sql import func
from app.database import Base

class FoodItem(Base):
    __tablename__ = "food_items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    region = Column(String)
    sub_region = Column(String, nullable=True)
    category = Column(String)
    meal_type = Column(String)
    calories_per_100g = Column(Float)
    protein_per_100g = Column(Float)
    carbs_per_100g = Column(Float)
    fat_per_100g = Column(Float)
    fiber_per_100g = Column(Float)
    typical_serving_g = Column(Float)
    estimated_cost_inr = Column(Float)
    dietary_tags = Column(JSON)
    is_active = Column(Boolean, default=True)

class FoodLog(Base):
    __tablename__ = "food_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime(timezone=True))
    meal_type = Column(String)
    food_item_id = Column(Integer, ForeignKey("food_items.id"), nullable=True)
    custom_food_name = Column(String, nullable=True)
    quantity_g = Column(Float)
    calories = Column(Float)
    protein_g = Column(Float)
    carbs_g = Column(Float)
    fat_g = Column(Float)
    logged_at = Column(DateTime(timezone=True), server_default=func.now())
    image_path = Column(String, nullable=True)

class MealPlan(Base):
    __tablename__ = "meal_plans"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(DateTime(timezone=True))
    daily_budget_inr = Column(Float)
    goal = Column(String)
    meals = Column(JSON)
    total_calories = Column(Float)
    total_protein_g = Column(Float)
    total_cost_inr = Column(Float)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

class GroceryList(Base):
    __tablename__ = "grocery_lists"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    week_start_date = Column(DateTime(timezone=True))
    items = Column(JSON)
    total_estimated_cost = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
