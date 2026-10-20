"""Vision router — exercise form and food-image analysis with Gemini Flash."""
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
import os
import uuid
import json
import logging
import math
from app.database import get_db
from app.deps import get_current_user, require_onboarded_user
from app.models.user import User
from app.models.workout import Exercise, ExerciseFormResult
from app.config import settings
from app.ai.provider import AIProviderError
from app.ai.vision import analyze_images_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/vision", tags=["vision"], dependencies=[Depends(require_onboarded_user)])

UPLOAD_DIR = settings.UPLOAD_DIR
os.makedirs(UPLOAD_DIR, exist_ok=True)

SUPPORTED_EXERCISES = ["squat", "push-up", "pushup", "push up", "bicep curl", "curl", "lunge", "plank", "shoulder press"]


def _bounded_number(value, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        number = default
    if not math.isfinite(number):
        number = default
    return max(minimum, min(maximum, number))


def _analyze_exercise_video(filepath: str, exercise_type: str) -> dict:
    """Real kinematic biomechanics analysis using OpenCV and MediaPipe landmark tracking."""
    import cv2
    import numpy as np
    from app.vision.scan_service import scan_service

    time_series = []

    # Attempt landmark extraction via MediaPipe extractor
    if scan_service.extractor is not None:
        try:
            extraction = scan_service.extractor.extract_from_video(filepath)
            time_series = extraction.get("time_series", [])
        except Exception as e:
            logger.warning(f"MediaPipe extraction note: {e}")

    # Fallback to OpenCV frame kinematics if time series is empty
    cap = cv2.VideoCapture(filepath)
    cap.release()

    valid_frames = [f for f in time_series if f.get("has_pose") and f.get("angles")]

    if valid_frames:
        knee_angles = [f["angles"].get("avg_knee_flexion", 180.0) for f in valid_frames]
        torso_leans = [f["angles"].get("torso_inclination", 0.0) for f in valid_frames]
        min_knee = min(knee_angles)
        max_knee = max(knee_angles)
        rom = max_knee - min_knee
        avg_torso = float(np.mean(torso_leans))
        torso_var = float(np.std(torso_leans))

        return {
            "form_score": None,
            "landmark_frames": len(valid_frames),
            "kinematic_measurements": {
                "minimum_knee_flexion_degrees": round(float(min_knee), 1),
                "maximum_knee_flexion_degrees": round(float(max_knee), 1),
                "knee_range_degrees": round(float(rom), 1),
                "mean_torso_inclination_degrees": round(avg_torso, 1),
                "torso_inclination_variation_degrees": round(torso_var, 1),
            },
            "breakdown": {},
            "feedback": [],
            "primary_improvement": "",
        }

    # Do not derive a form score from video length when no pose landmarks were found.
    return {
        "form_score": None,
        "breakdown": {},
        "feedback": [],
        "primary_improvement": "",
        "landmark_frames": 0,
    }


async def _analyze_exercise_with_gemini(filepath: str, exercise_type: str, kinematics: dict, user_id: Optional[int] = None) -> dict:
    """Assess sampled video frames with Gemini Flash and pose measurements when available."""
    import cv2

    cap = cv2.VideoCapture(filepath)
    if not cap.isOpened():
        raise ValueError("Unable to read the uploaded video")
    total_frames = max(1, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))
    sample_count = min(5, total_frames)
    indices = sorted({round(i * (total_frames - 1) / max(1, sample_count - 1)) for i in range(sample_count)})
    images = []
    for index in indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = cap.read()
        if not ok:
            continue
        height, width = frame.shape[:2]
        scale = min(1.0, 1024 / max(height, width))
        if scale < 1:
            frame = cv2.resize(frame, (int(width * scale), int(height * scale)))
        ok, encoded = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 82])
        if ok:
            images.append((encoded.tobytes(), "image/jpeg"))
    cap.release()
    if not images:
        raise ValueError("No readable frames were found in the uploaded video")

    prompt = f"""Assess this {exercise_type} exercise form from {len(images)} ordered frames sampled from one video.
Use visible evidence only. Acknowledge that a few sampled frames cannot verify every repetition or diagnose injury.
Pose-estimation measurements from the same video, if present: {json.dumps(kinematics, default=str)}
Treat these as approximate measurements, not precomputed scores. If landmark_frames is zero, assess only what is visible.
Return JSON only with keys: form_score (0-100 number or null if not assessable), confidence (0-1),
breakdown (depth, knee_alignment, torso_stability, movement_control each 0-100 or null),
feedback (3 concise evidence-based observations), primary_improvement (one actionable cue),
visual_evidence (brief description of what is actually visible).
Do not claim angles, repetition counts, pain, or movement defects that are not visible. If the body or exercise is unclear,
set form_score to null, confidence below 0.4, and explain what needs to be reframed."""
    return await analyze_images_json(
        prompt,
        images,
        max_tokens=1500,
        max_output_token_cap=2048,
        thinking_level="low",
        feature="fortis_vision",
        user_id=user_id,
    )


from pydantic import BaseModel, Field


class FoodAlternative(BaseModel):
    name: str
    confidence: float = Field(ge=0.0, le=1.0)


class FoodAnalysisSchema(BaseModel):
    food_name: str
    region: str = "General"
    confidence: float = Field(ge=0.0, le=1.0)
    serving_description: str
    serving_g: int = Field(ge=1, le=5000)
    calories: float = Field(ge=0.0)
    protein_g: float = Field(ge=0.0)
    carbs_g: float = Field(ge=0.0)
    fat_g: float = Field(ge=0.0)
    fiber_g: float = Field(ge=0.0)
    sugar_g: float = Field(ge=0.0)
    alternatives: List[FoodAlternative] = Field(default_factory=list)
    is_healthy: Optional[bool] = None
    brief_note: str = ""


async def _analyze_food_with_gemini(image_bytes: bytes, mime_type: str, user_id: Optional[int] = None) -> dict:
    prompt = """Identify the visible food and estimate nutrition for the entire visible serving. Specialize in Indian and Kerala cuisine.
Return a validated JSON object with: food_name, region, confidence (0-1), serving_description, serving_g (integer),
calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, alternatives (array of name/confidence), is_healthy (boolean), brief_note.
Respond with one concise JSON object only, without markdown; keep brief_note short.
Estimate portions conservatively from visible size; these are estimates, not laboratory measurements. If food is unclear,
use food_name 'Unidentified Food Item' and confidence below 0.5. Do not invent ingredients that cannot be seen."""
    return await analyze_images_json(
        prompt,
        [(image_bytes, mime_type)],
        response_schema=FoodAnalysisSchema,
        max_tokens=1500,
        max_output_token_cap=2048,
        thinking_level="low",
        feature="fortis_vision",
        user_id=user_id,
    )


@router.post("/exercise")
async def analyze_exercise_form(
    file: UploadFile = File(...),
    exercise_name: str = Form(default="squat"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Validate exercise and file
    if exercise_name.strip().lower() not in SUPPORTED_EXERCISES:
        raise HTTPException(status_code=422, detail="Select a supported exercise before uploading a video.")
    if file.size and file.size > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")

    allowed_types = ["video/mp4", "video/mov", "video/avi", "video/quicktime", "video/x-msvideo", "video/webm"]
    allowed_extensions = {".mp4", ".mov", ".avi", ".webm", ".mkv"}
    ext = os.path.splitext(file.filename or "")[1].lower() or ".mp4"
    if file.content_type not in allowed_types and ext not in allowed_extensions:
        raise HTTPException(status_code=415, detail=f"Unsupported file type: {file.content_type or ext}")

    # Save the upload only while it is being analyzed.
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read(settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024 + 1)
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")
    with open(filepath, "wb") as f:
        f.write(content)

    # Combine landmark measurements with the configured GPT vision model.
    try:
        kinematics = _analyze_exercise_video(filepath, exercise_name)
        if exercise_name.lower() not in {"squat", "squats"}:
            # The current deterministic angle scoring is squat-specific.
            kinematics = {"landmark_frames": 0}
        import inspect
        sig = inspect.signature(_analyze_exercise_with_gemini)
        if "user_id" in sig.parameters or any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
            analysis = await _analyze_exercise_with_gemini(filepath, exercise_name, kinematics, user_id=current_user.id)
        else:
            analysis = await _analyze_exercise_with_gemini(filepath, exercise_name, kinematics)
    except AIProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    finally:
        if os.getenv("VERCEL") and os.path.exists(filepath):
            os.remove(filepath)

    score = analysis.get("form_score")
    if not isinstance(score, (int, float)):
        detail_msg = analysis.get("primary_improvement") or "The exercise could not be assessed clearly. Re-record with your full body visible and the camera steady."
        raise HTTPException(status_code=422, detail=detail_msg)
    score = round(max(0.0, min(100.0, float(score))), 1)
    raw_breakdown = analysis.get("breakdown") if isinstance(analysis.get("breakdown"), dict) else {}
    breakdown = {
        key: round(max(0.0, min(100.0, float(value))), 1)
        for key, value in raw_breakdown.items()
        if key in {"depth", "knee_alignment", "torso_stability", "movement_control"}
        and isinstance(value, (int, float))
    }
    feedback = analysis.get("feedback") if isinstance(analysis.get("feedback"), list) else []

    # Find exercise in DB
    exercise = db.query(Exercise).filter(
        Exercise.name.ilike(f"%{exercise_name}%")
    ).first()

    # Save result
    result = ExerciseFormResult(
        user_id=current_user.id,
        exercise_id=exercise.id if exercise else None,
        video_path="" if os.getenv("VERCEL") else filepath,
        form_score=score,
        breakdown=breakdown,
        feedback=[str(item)[:300] for item in feedback[:5]],
        analyzed_at=datetime.utcnow(),
    )
    db.add(result)
    db.commit()
    db.refresh(result)

    return {
        "analysis_id": result.id,
        "exercise": exercise_name,
        "form_score": score,
        "breakdown": breakdown,
        "feedback": [str(item)[:300] for item in feedback[:5]],
        "confidence": round(_bounded_number(analysis.get("confidence"), 0.0, 0.0, 1.0), 2),
        "visual_evidence": analysis.get("visual_evidence", ""),
        "primary_improvement": analysis.get("primary_improvement", ""),
        "analyzed_at": result.analyzed_at.isoformat(),
        "note": "Gemini Flash reviewed sampled video frames and pose measurements when available. Results are indicative, not medical advice.",
    }


@router.post("/food")
async def analyze_food_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=415, detail="Please upload a JPEG, PNG, or WebP image")

    content = await file.read()
    max_image_size = min(settings.MAX_UPLOAD_SIZE_MB, 10) * 1024 * 1024
    if len(content) > max_image_size:
        raise HTTPException(status_code=413, detail=f"Image too large (max {max_image_size // (1024 * 1024)}MB)")

    # ── Gemini Flash Vision Analysis ──────────────────────────────────────
    try:
        mime = "image/jpeg" if file.content_type == "image/jpg" else (file.content_type or "image/jpeg")
        import inspect
        sig = inspect.signature(_analyze_food_with_gemini)
        if "user_id" in sig.parameters or any(p.kind == inspect.Parameter.VAR_KEYWORD for p in sig.parameters.values()):
            parsed = await _analyze_food_with_gemini(content, mime, user_id=current_user.id)
        else:
            parsed = await _analyze_food_with_gemini(content, mime)
    except AIProviderError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except Exception as e:
        logger.exception("Food vision analysis failed")
        raise HTTPException(status_code=422, detail="Food image could not be analyzed. Please try another clear image.") from e

    food_name = str(parsed.get("food_name") or "Unidentified Food Item")[:120]
    region = str(parsed.get("region") or "General")[:60]
    confidence = _bounded_number(parsed.get("confidence"), 0.0, 0.0, 1.0)
    serving_g = int(_bounded_number(parsed.get("serving_g"), 150, 1, 5000))
    calories = _bounded_number(parsed.get("calories"), 0, 0, 10000)
    protein_g = _bounded_number(parsed.get("protein_g"), 0, 0, 1000)
    carbs_g = _bounded_number(parsed.get("carbs_g"), 0, 0, 1000)
    fat_g = _bounded_number(parsed.get("fat_g"), 0, 0, 1000)
    fiber_g = _bounded_number(parsed.get("fiber_g"), 0, 0, 1000)
    sugar_g = _bounded_number(parsed.get("sugar_g"), 0, 0, 1000)
    brief_note = parsed.get("brief_note", "")
    alternatives = parsed.get("alternatives", [])
    if not isinstance(alternatives, list):
        alternatives = []

    # ── Optional: Cross-reference with MongoDB food catalog ──────────────
    # If a known food matches in our DB, use verified nutritional data instead
    from app.models.nutrition import FoodItem
    search_term = food_name.split("(")[0].split(" with ")[0].strip()
    db_food = db.query(FoodItem).filter(
        FoodItem.name.ilike(f"%{search_term}%")
    ).first()

    if db_food:
        factor = serving_g / 100.0
        calories = round(db_food.calories_per_100g * factor, 1)
        protein_g = round(db_food.protein_per_100g * factor, 1)
        carbs_g = round(db_food.carbs_per_100g * factor, 1)
        fat_g = round(db_food.fat_per_100g * factor, 1)
        data_source = "Fortis nutrition database"
    else:
        data_source = "Gemini Flash estimate"

    nutrition_estimate = {
        "food_name": food_name,
        "serving_g": serving_g,
        "serving_description": parsed.get("serving_description", f"~{serving_g}g"),
        "calories": round(calories, 1),
        "protein_g": round(protein_g, 1),
        "carbs_g": round(carbs_g, 1),
        "fat_g": round(fat_g, 1),
        "fiber_g": round(fiber_g, 1),
        "sugar_g": round(sugar_g, 1),
        "source": data_source,
    }

    return {
        "top_prediction": {
            "name": food_name,
            "confidence": round(confidence, 2),
            "region": region,
            "is_healthy": parsed.get("is_healthy", None),
            "note": brief_note,
        },
        "alternatives": alternatives[:3],
        "nutrition_estimate": nutrition_estimate,
        "disclaimer": "Nutritional values are estimates for the visible serving. Actual values may vary by preparation method and portion size.",
        "confirm_prompt": f"Is this {food_name}? Confirm to log it to your nutrition diary.",
    }


@router.get("/form-history")
def get_form_history(
    exercise_id: int = None,
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(ExerciseFormResult).filter(
        ExerciseFormResult.user_id == current_user.id
    )
    if exercise_id:
        query = query.filter(ExerciseFormResult.exercise_id == exercise_id)

    results = query.order_by(ExerciseFormResult.analyzed_at).limit(limit).all()

    return [{
        "id": r.id,
        "date": r.analyzed_at.date().isoformat(),
        "exercise_id": r.exercise_id,
        "form_score": r.form_score,
        "breakdown": r.breakdown,
        "feedback": r.feedback,
    } for r in results]
