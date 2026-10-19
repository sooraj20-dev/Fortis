"""Demo user seed — 4 weeks of realistic fitness data for the demo flow"""
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import bcrypt
if not hasattr(bcrypt, "__about__"):
    class _BcryptAbout:
        __version__ = getattr(bcrypt, "__version__", "4.0.1")
    bcrypt.__about__ = _BcryptAbout()

from passlib.context import CryptContext
import random

from app.models.user import User
from app.models.profile import Profile, Goal, Equipment, Schedule, NutritionPreference
from app.models.workout import Workout, WorkoutExercise, ExerciseLog, PostWorkoutFeedback, Exercise, ExerciseFormResult
from app.models.recovery import SleepLog, RecoveryLog
from app.models.nutrition import FoodLog, FoodItem
from app.models.intelligence import FitnessState, FortisDecision, UserBaseline, WeeklyReview

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def seed_demo_user(db: Session):
    print("Seeding demo user...")

    # Create user
    user = User(
        email="demo@fortis.ai",
        name="Arjun Demo",
        hashed_password=pwd_context.hash("Demo@123"),
        is_active=True,
        is_admin=False,
    )
    db.add(user)
    db.flush()

    # Profile
    profile = Profile(
        user_id=user.id, age=22, height_cm=175.0, weight_kg=70.0,
        gender="male", activity_level="MODERATELY_ACTIVE",
    )
    db.add(profile)

    goal = Goal(user_id=user.id, primary_goal="STRENGTH", experience_level="INTERMEDIATE")
    db.add(goal)

    equipment = Equipment(user_id=user.id, equipment_list=["dumbbells", "resistance bands", "pull-up bar", "bodyweight"])
    db.add(equipment)

    schedule = Schedule(user_id=user.id, days_per_week=4, workout_duration_min=45, preferred_time="morning")
    db.add(schedule)

    nutr_pref = NutritionPreference(
        user_id=user.id, diet_type="non_vegetarian", allergies=[],
        regional_preference="Kerala", daily_budget_inr=150.0, cooking_available=True,
    )
    db.add(nutr_pref)
    db.flush()

    # Get some exercises
    exercises = db.query(Exercise).limit(20).all()
    if not exercises:
        db.commit()
        return

    foods = db.query(FoodItem).limit(15).all()

    today = datetime.utcnow().date()

    # Generate 4 weeks of data
    # Week 1: Building up (lower scores)
    # Week 2: Consistent (moderate scores)
    # Week 3: Strong week (high scores)
    # Week 4: Slight fatigue (recovery needed)

    week_patterns = [
        # Week 1 (4 weeks ago): Starting out
        {"pulse_base": 58, "consistency": 0.75, "sleep_base": 6.8, "rpe_base": 7.2, "completed": 3},
        # Week 2: Getting consistent
        {"pulse_base": 65, "consistency": 0.88, "sleep_base": 7.1, "rpe_base": 6.8, "completed": 4},
        # Week 3: Strong week
        {"pulse_base": 73, "consistency": 1.0, "sleep_base": 7.4, "rpe_base": 6.5, "completed": 4},
        # Week 4 (current): Slight fatigue
        {"pulse_base": 68, "consistency": 0.75, "sleep_base": 6.2, "rpe_base": 7.5, "completed": 3},
    ]

    workout_types = ["UPPER BODY", "LOWER BODY", "FULL BODY", "UPPER BODY", "LOWER BODY"]
    day_counter = 0

    for week_idx, week_data in enumerate(week_patterns):
        week_start = today - timedelta(weeks=4 - week_idx)

        for day_offset in range(7):
            current_date = week_start + timedelta(days=day_offset)
            if current_date >= today:
                continue

            # Create sleep log for every day
            sleep_variation = random.uniform(-0.8, 0.8)
            sleep_hours = max(5.0, min(9.0, week_data["sleep_base"] + sleep_variation))
            sleep_quality = max(4, min(10, int(7 + sleep_variation)))

            sleep_log = SleepLog(
                user_id=user.id,
                date=datetime.combine(current_date, datetime.min.time()),
                duration_hours=round(sleep_hours, 1),
                quality=sleep_quality,
                bedtime="22:30",
                wake_time="06:30",
                logged_at=datetime.combine(current_date, datetime.min.time()),
            )
            db.add(sleep_log)

            # Recovery log
            energy = max(4, min(10, int(7 - (10 - sleep_hours) * 0.5 + random.uniform(-1, 1))))
            soreness = max(2, min(9, int(4 + random.uniform(-1.5, 1.5))))
            stress = max(3, min(9, int(5 + random.uniform(-1, 1))))
            recovery_score = round(
                (energy * 12 + (10 - soreness) * 10 + (10 - stress) * 8 + 7 * 10) / 4, 1
            )

            recovery_log = RecoveryLog(
                user_id=user.id,
                date=datetime.combine(current_date, datetime.min.time()),
                energy_level=energy,
                soreness_level=soreness,
                stress_level=stress,
                mood=max(5, min(10, int(7 + random.uniform(-1, 1)))),
                recovery_score=min(100, recovery_score),
                logged_at=datetime.combine(current_date, datetime.min.time()),
            )
            db.add(recovery_log)

            # Workout (on training days)
            is_training_day = (day_offset % 2 == 0) and day_counter < week_data["completed"] * (week_idx + 1)
            should_workout = (day_offset in [0, 1, 3, 5]) and (day_counter < 20)

            if should_workout:
                day_counter += 1
                workout_type = workout_types[day_counter % len(workout_types)]
                rpe_variation = random.uniform(-0.8, 0.8)
                session_rpe = round(max(4, min(10, week_data["rpe_base"] + rpe_variation)), 1)

                workout = Workout(
                    user_id=user.id,
                    date=datetime.combine(current_date, datetime.min.time()),
                    status="COMPLETED",
                    workout_type=workout_type,
                    started_at=datetime.combine(current_date, datetime.min.time()),
                    completed_at=datetime.combine(current_date, datetime.min.time()) + timedelta(minutes=40),
                    total_duration_min=40,
                )
                db.add(workout)
                db.flush()

                # Add 4-5 exercises
                selected_exercises = random.sample(exercises, min(4, len(exercises)))
                for ex_idx, ex in enumerate(selected_exercises):
                    we = WorkoutExercise(
                        workout_id=workout.id,
                        exercise_id=ex.id,
                        planned_sets=3,
                        planned_reps=12,
                        planned_weight_kg=20.0 + (week_idx * 2.5),
                        order_index=ex_idx,
                    )
                    db.add(we)
                    db.flush()

                    # Log 3 sets
                    for set_num in range(1, 4):
                        log = ExerciseLog(
                            workout_exercise_id=we.id,
                            set_number=set_num,
                            reps_completed=random.randint(10, 13),
                            weight_kg=20.0 + (week_idx * 2.5),
                            rpe=round(session_rpe + random.uniform(-0.5, 0.5), 1),
                            completed_at=datetime.combine(current_date, datetime.min.time()),
                        )
                        db.add(log)

                # Post-workout feedback
                feedback = PostWorkoutFeedback(
                    workout_id=workout.id,
                    overall_rpe=session_rpe,
                    energy_level=energy,
                    soreness_level=max(3, soreness - 1),
                    pain_flag=False,
                    difficulty_notes="Good session" if session_rpe < 7 else "Tough but manageable",
                    logged_at=datetime.combine(current_date, datetime.min.time()),
                )
                db.add(feedback)

            # Food logs
            if foods:
                for meal_type in ["BREAKFAST", "LUNCH", "DINNER"]:
                    food = random.choice(foods)
                    factor = food.typical_serving_g / 100.0
                    food_log = FoodLog(
                        user_id=user.id,
                        date=datetime.combine(current_date, datetime.min.time()),
                        meal_type=meal_type,
                        food_item_id=food.id,
                        quantity_g=food.typical_serving_g,
                        calories=round(food.calories_per_100g * factor, 1),
                        protein_g=round(food.protein_per_100g * factor, 1),
                        carbs_g=round(food.carbs_per_100g * factor, 1),
                        fat_g=round(food.fat_per_100g * factor, 1),
                        logged_at=datetime.combine(current_date, datetime.min.time()),
                    )
                    db.add(food_log)

    # Fitness states for each day
    for days_ago in range(28, 0, -1):
        state_date = today - timedelta(days=days_ago)
        week_idx = min(3, (28 - days_ago) // 7)
        pattern = week_patterns[week_idx]

        pulse = round(pattern["pulse_base"] + random.uniform(-4, 4), 1)
        recovery = round(pattern["pulse_base"] * 0.95 + random.uniform(-5, 5), 1)
        fatigue = round(max(10, min(80, 100 - pulse + random.uniform(-5, 5))), 1)

        state = FitnessState(
            user_id=user.id,
            date=datetime.combine(state_date, datetime.min.time()),
            strength_score=round(pulse + 5 + random.uniform(-3, 3), 1),
            endurance_score=round(pulse - 8 + random.uniform(-3, 3), 1),
            recovery_score=round(recovery, 1),
            consistency_score=round(pattern["consistency"] * 100 + random.uniform(-5, 5), 1),
            nutrition_score=round(65 + random.uniform(-8, 8), 1),
            mobility_score=round(60 + random.uniform(-5, 5), 1),
            readiness_score=round(pulse * 0.9 + random.uniform(-3, 3), 1),
            fatigue_risk=fatigue,
            fortis_pulse=min(100, max(20, pulse)),
            computed_at=datetime.combine(state_date, datetime.min.time()),
        )
        db.add(state)

        # Fortis decisions
        if days_ago in [28, 21, 14, 10, 7, 5, 3, 2, 1]:
            if pulse >= 73:
                dtype = "PROGRESSIVE"
                adj = 1.15
                reasons = ["Strong recovery metrics", "Low RPE in recent sessions", "Consistency is high"]
            elif pulse >= 63:
                dtype = "NORMAL"
                adj = 1.0
                reasons = ["All metrics within your normal range", "Recovery is adequate"]
            elif pulse >= 52:
                dtype = "REDUCED"
                adj = 0.80
                reasons = ["Sleep slightly below your baseline", "Elevated soreness reported", "Recovery needs attention"]
            else:
                dtype = "RECOVERY"
                adj = 0.60
                reasons = ["Low energy levels", "High accumulated fatigue", "Recovery is the priority"]

            decision = FortisDecision(
                user_id=user.id,
                date=datetime.combine(state_date, datetime.min.time()),
                decision_type=dtype,
                readiness_score=round(pulse * 0.9, 1),
                fatigue_risk=fatigue,
                confidence=round(0.75 + random.uniform(0, 0.18), 2),
                adjustment_factor=adj,
                reasons=reasons,
                recommendations=["Follow your planned workout" if dtype == "NORMAL" else "Adapt intensity accordingly"],
                baseline_deltas={"sleep_hours": round(random.uniform(-1.5, 1.0), 2), "rpe": round(random.uniform(-1, 1.5), 2)},
                created_at=datetime.combine(state_date, datetime.min.time()),
            )
            db.add(decision)

    # Personal baselines
    for metric, value in [("sleep_hours", 7.1), ("rpe", 6.8), ("soreness", 4.5), ("energy", 6.9)]:
        baseline = UserBaseline(
            user_id=user.id,
            metric_name=metric,
            rolling_average=value,
            sample_count=20,
            last_updated=datetime.utcnow(),
        )
        db.add(baseline)

    # Form result (squat)
    squat = db.query(Exercise).filter(Exercise.name.ilike("%squat%")).first()
    if squat:
        form = ExerciseFormResult(
            user_id=user.id,
            exercise_id=squat.id,
            video_path="demo/squat_demo.mp4",
            form_score=78.0,
            breakdown={"depth": 82, "knee_alignment": 74, "torso_stability": 76, "movement_control": 85},
            feedback=["✓ Good depth", "⚠ Improve knee tracking", "⚠ More core bracing"],
            analyzed_at=datetime.utcnow() - timedelta(days=5),
        )
        db.add(form)

    # Weekly review
    review = WeeklyReview(
        user_id=user.id,
        week_start=datetime.utcnow() - timedelta(days=7),
        workouts_completed=3,
        workouts_planned=4,
        avg_rpe=7.2,
        avg_recovery=65.0,
        consistency_pct=75.0,
        nutrition_adherence_pct=70.0,
        ai_insights=[
            "Solid week overall — 3 of 4 workouts completed.",
            "Sleep averaged below baseline (6.2h vs 7.1h typical). This is impacting your Fortis Pulse.",
            "RPE trending higher this week, which combined with lower sleep suggests accumulated fatigue.",
        ],
        next_week_recommendations=[
            "Prioritize sleep — aim for 7+ hours daily.",
            "Consider one deload session to manage fatigue.",
            "Maintain nutrition consistency — you're doing well there.",
        ],
        generated_at=datetime.utcnow() - timedelta(days=1),
    )
    db.add(review)

    db.commit()
    print(f"Demo user created: demo@fortis.ai / Demo@123")
    print("4 weeks of workout, sleep, recovery, nutrition, and fitness state data seeded.")
