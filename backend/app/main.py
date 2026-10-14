"""
Fortis AI Fitness — FastAPI Backend
Production-quality adaptive fitness intelligence platform.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import logging

from app.database import engine, Base, SessionLocal
from app.config import settings

# Import all models to ensure they're registered with Base
from app.models import user, profile, workout, nutrition, recovery, intelligence, scan  # noqa

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")

    # Verify MongoDB Atlas connection and initialize unique indexes
    try:
        from app.database import get_mongo_db
        mongo_db = get_mongo_db()
        mongo_db.command("ping")
        logger.info("Successfully connected to MongoDB Atlas database: %s", settings.MONGODB_DB_NAME)
        mongo_db["users"].create_index("email", unique=True, sparse=True)
        mongo_db["profiles"].create_index("user_id")
        mongo_db["workouts"].create_index("user_id")
        mongo_db["fitness_states"].create_index("user_id")
        mongo_db["recovery_logs"].create_index("user_id")
        mongo_db["sleep_logs"].create_index("user_id")
        mongo_db["food_logs"].create_index("user_id")
        mongo_db["body_scans"].create_index("user_id")
    except Exception as e:
        logger.error(f"MongoDB Atlas startup check/index error: {e}")

    # Seed exercise and food reference data if DB is empty
    try:
        from app.seed_data.exercises import seed_exercises
        from app.seed_data.foods import seed_foods

        db = SessionLocal()
        try:
            from app.models.workout import Exercise
            from app.models.nutrition import FoodItem

            if db.query(Exercise).count() == 0:
                seed_exercises(db)
                logger.info("Exercises reference catalog seeded into MongoDB")

            if db.query(FoodItem).count() == 0:
                seed_foods(db)
                logger.info("Foods reference catalog seeded into MongoDB")
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Reference database seeding note: {e}")

    yield
    logger.info("Fortis shutting down")


app = FastAPI(
    title="Fortis AI Fitness",
    description="""
    ## Fortis AI Fitness Platform

    An adaptive fitness intelligence system that continuously observes, understands,
    predicts, decides, adapts, and learns from user fitness data.

    ### Core Architecture
    - **FortisDecisionEngine** — Central intelligence that produces structured decisions
    - **FitnessStateCalculator** — Computes daily Personal Fitness State from real data
    - **Personal Baseline** — Compares you against your own history (not population norms)
    - **FORTIS PULSE** — Single composite score representing your fitness readiness
    - **AI Coach** — Context-aware conversational interface over real Fortis data
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploads are temporary on Vercel; durable app data belongs in MongoDB or object storage.
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Include all routers
from app.routers import auth, profile, dashboard, workouts, nutrition, recovery, fitness_state, coach, progress, vision, scan  # noqa

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(dashboard.router)
app.include_router(workouts.router)
app.include_router(nutrition.router)
app.include_router(recovery.router)
app.include_router(fitness_state.router)
app.include_router(coach.router)
app.include_router(progress.router)
app.include_router(vision.router)
app.include_router(scan.router)


@app.get("/health", tags=["system"])
def health_check():
    db_status = "connected"
    try:
        from app.database import get_mongo_db
        get_mongo_db().command("ping")
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "app": "Fortis AI Fitness",
        "version": "1.0.0",
        "database": "MongoDB Atlas",
        "database_status": db_status,
        "ai_provider": settings.AI_PROVIDER,
    }


@app.get("/", tags=["system"])
def root():
    return {
        "message": "Welcome to Fortis AI Fitness API",
        "docs": "/docs",
        "health": "/health",
    }
