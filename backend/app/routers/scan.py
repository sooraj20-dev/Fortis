"""
scan.py — Fortis Scan API router.
Flagship movement analysis, blueprint synthesis, scan history, evolution comparisons, and BMI screening.
"""
import os

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from app.database import get_db
from app.config import settings
from app.deps import get_current_user, require_onboarded_user
from app.models.user import User
from app.models.scan import BodyScan, ScanMetric, ScanObservation, ScanComparison
from app.models.intelligence import FitnessState, FortisDecision
from app.models.profile import Goal, Equipment, Schedule, NutritionPreference
from app.vision.scan_service import ScanService, RESPONSIBLE_AI_DISCLAIMER, MODEL_LIMITATIONS
from app.intelligence.decision_engine import FortisDecisionEngine
from app.nutrition.regional_foods import get_foods_for_meal
from app.nutrition.budget_optimizer import MEAL_TEMPLATES

router = APIRouter(prefix="/api/scan", tags=["scan"], dependencies=[Depends(require_onboarded_user)])
scan_service = ScanService()
decision_engine = FortisDecisionEngine()


# --- Pydantic Schemas ---

class BMICalculatorRequest(BaseModel):
    height_cm: float = Field(..., gt=50, lt=280, description="Height in centimeters")
    weight_kg: float = Field(..., gt=20, lt=350, description="Weight in kilograms")


class BMICalculatorResponse(BaseModel):
    bmi: float
    category: str
    height_cm: float
    weight_kg: float
    healthy_weight_range_kg: Dict[str, float]
    healthy_bmi_range: str = "18.5 - 24.9"
    disclaimer: str = (
        "BMI is a basic height-to-weight screening measure and does not directly "
        "measure fitness or body composition. Fortis relies on your functional movement "
        "kinetics and recovery signals for personalized programming."
    )
    note: str


class BlueprintRequest(BaseModel):
    scan_id: Optional[int] = None


# --- Endpoints ---

@router.post("/start")
def start_scan_session(current_user: User = Depends(get_current_user)):
    """
    Initializes a Fortis Scan onboarding session with instructions and guidelines.
    """
    session_id = f"scan_sess_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{current_user.id}"
    return {
        "scan_id": current_user.id,
        "session_id": session_id,
        "user_id": current_user.id,
        "status": "READY",
        "message": "Scan session initialized.",
        "title": "FORTIS SCAN",
        "tagline": "Understand your movement. Build your adaptive plan.",
        "guided_steps": [
            {
                "step": 1,
                "key": "FRONT",
                "title": "Front View",
                "instruction": "Stand face-to-camera with your entire body framed from head to toe.",
                "duration_sec": 5,
                "checks": ["Shoulder level symmetry", "Pelvic tilt", "Athletic base width"],
            },
            {
                "step": 2,
                "key": "SIDE",
                "title": "Side View",
                "instruction": "Turn 90 degrees to the side. Maintain your natural resting posture.",
                "duration_sec": 5,
                "checks": ["Cervical / head alignment", "Thoracic pitch", "Lumbar curve"],
            },
            {
                "step": 3,
                "key": "SQUAT",
                "title": "Squat Test",
                "instruction": "Perform 3 smooth bodyweight squats at a controlled, natural cadence.",
                "duration_sec": 15,
                "checks": ["Depth & hip flexion", "Knee tracking stability", "Torso position during descent"],
            },
        ],
        "requirements": {
            "framing": "Place phone or webcam at waist-to-chest height, 6-8 feet away",
            "lighting": "Well-lit room; avoid standing directly in front of bright windows",
            "clothing": "Form-fitting athletic wear allows highest landmark tracking accuracy",
            "privacy": "Raw video is processed temporarily in memory and discarded by default. No facial recognition is performed.",
            "estimated_time_sec": 60,
        },
        "disclaimer": RESPONSIBLE_AI_DISCLAIMER,
    }


@router.post("/analyze")
async def analyze_scan(
    file: Optional[UploadFile] = File(None),
    video: Optional[UploadFile] = File(None),
    discard_video: bool = Form(default=True),
    allow_demo_fallback: bool = Form(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Process video upload or camera recording through the MediaPipe/OpenCV vision pipeline.
    Discards raw video temporarily and computes real functional movement metrics.
    """
    upload_file = file or video
    if upload_file:
        max_upload_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        content = await upload_file.read(max_upload_size + 1)
        if len(content) == 0:
            raise HTTPException(status_code=400, detail="Uploaded video file is empty.")
        if len(content) > max_upload_size:
            raise HTTPException(
                status_code=413,
                detail=f"Video too large (max {settings.MAX_UPLOAD_SIZE_MB}MB).",
            )

        res = scan_service.process_video_bytes(
            video_bytes=content,
            filename=upload_file.filename or "scan.mp4",
            user_id=current_user.id,
            db=db,
            discard_video=discard_video or bool(os.getenv("VERCEL")),
            allow_demo_fallback=allow_demo_fallback,
        )

        if not res.get("success", False):
            return {
                "success": False,
                "status": "INSUFFICIENT_DATA",
                "message": res.get("message", "INSUFFICIENT DATA: Please improve lighting/position and retry."),
                "quality_reasons": res.get("quality_reasons", []),
                "confidence": res.get("confidence", 0.0),
                "disclaimer": RESPONSIBLE_AI_DISCLAIMER,
            }

        return res

    raise HTTPException(
        status_code=400,
        detail="No video payload received. Please record real video from camera or upload an MP4/WebM video."
    )


@router.get("/latest")
def get_latest_scan(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Returns the user's latest completed Fortis Scan with full metrics and recommendations.
    """
    scan = db.query(BodyScan).filter(
        BodyScan.user_id == current_user.id,
        BodyScan.status == "COMPLETED"
    ).order_by(desc(BodyScan.scan_date)).first()

    if not scan or not scan.metrics:
        return {"has_scan": False, "message": "No scans recorded yet."}

    m = scan.metrics
    obs = db.query(ScanObservation).filter(ScanObservation.scan_id == scan.id).all()

    # Get today's decision
    decision = db.query(FortisDecision).filter(
        FortisDecision.user_id == current_user.id
    ).order_by(desc(FortisDecision.date)).first()

    # Get fitness state
    state = db.query(FitnessState).filter(
        FitnessState.user_id == current_user.id
    ).order_by(desc(FitnessState.date)).first()

    posture_val = None
    if m.functional_metrics and isinstance(m.functional_metrics, dict) and "posture_score" in m.functional_metrics:
        posture_val = m.functional_metrics["posture_score"]
    elif m.joint_angles and isinstance(m.joint_angles, dict):
        posture_val = m.joint_angles.get("posture", {}).get("posture_score", None)

    return {
        "has_scan": True,
        "scan_id": scan.id,
        "user_id": current_user.id,
        "scan_date": scan.scan_date.isoformat(),
        "status": scan.status,
        "model_version": scan.model_version,
        "confidence": scan.confidence,
        "scan_confidence": scan.confidence,
        "data_available": True,
        "movement_quality": m.movement_quality,
        "mobility": m.mobility,
        "mobility_score": m.mobility,
        "stability": m.stability,
        "stability_score": m.stability,
        "movement_consistency": m.movement_consistency,
        "symmetry_indicator": m.symmetry_indicator,
        "squat_movement_score": m.squat_movement_score,
        "squat_score": m.squat_movement_score,
        "posture_score": posture_val,
        "primary_movement_pattern": "squat_kinetic_chain",
        "joint_angles": m.joint_angles,
        "functional_metrics": m.functional_metrics,
        "observations": [
            {
                "category": o.category,
                "status": o.status,
                "finding": o.text,
                "text": o.text,
                "joint_affected": o.joint_affected,
                "severity": o.severity,
                "recommendation": "Maintain controlled tempo and focus on joint alignment.",
            }
            for o in obs
        ],
        "metrics": [
            {"metric_name": "movement_quality", "value": m.movement_quality, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "KINETICS"},
            {"metric_name": "mobility", "value": m.mobility, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "ROM"},
            {"metric_name": "stability", "value": m.stability, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "CONTROL"},
            {"metric_name": "consistency", "value": m.movement_consistency, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "TEMPO"},
            {"metric_name": "symmetry", "value": m.symmetry_indicator, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "POSTURE"},
        ],
        "fortis_pulse_updated": state.fortis_pulse if state else None,
        "decision_updated": True,
        "limitations": scan.limitations or MODEL_LIMITATIONS,
        "disclaimer": RESPONSIBLE_AI_DISCLAIMER,
        "pulse": state.fortis_pulse if state else None,
        "recommendations": decision.recommendations if decision else [],
        "decision_type": decision.decision_type if decision else "NORMAL",
    }


@router.get("/history")
def get_scan_history(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns list of all completed scans with functional scores.
    """
    scans = db.query(BodyScan).filter(
        BodyScan.user_id == current_user.id,
        BodyScan.status == "COMPLETED"
    ).order_by(desc(BodyScan.scan_date)).limit(limit).all()

    result = []
    for s in scans:
        if s.metrics:
            result.append({
                "id": s.id,
                "scan_id": s.id,
                "user_id": s.user_id,
                "scan_date": s.scan_date.isoformat(),
                "movement_quality": s.metrics.movement_quality,
                "mobility": s.metrics.mobility,
                "mobility_score": s.metrics.mobility,
                "stability": s.metrics.stability,
                "stability_score": s.metrics.stability,
                "movement_consistency": s.metrics.movement_consistency,
                "squat_movement_score": s.metrics.squat_movement_score,
                "squat_score": s.metrics.squat_movement_score,
                "confidence": s.confidence,
                "scan_confidence": s.confidence,
                "status": s.status,
            })
    return result


@router.get("/{scan_id}")
def get_scan_detail(
    scan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieve full result details for a specific scan.
    """
    scan = db.query(BodyScan).filter(
        BodyScan.id == scan_id,
        BodyScan.user_id == current_user.id
    ).first()

    if not scan:
        raise HTTPException(status_code=404, detail="Scan record not found.")

    m = scan.metrics
    obs = db.query(ScanObservation).filter(ScanObservation.scan_id == scan.id).all()
    posture_val = None
    if m and m.functional_metrics and isinstance(m.functional_metrics, dict) and "posture_score" in m.functional_metrics:
        posture_val = m.functional_metrics["posture_score"]
    elif m and m.joint_angles and isinstance(m.joint_angles, dict):
        posture_val = m.joint_angles.get("posture", {}).get("posture_score", None)

    # Get today's decision & fitness state
    decision = db.query(FortisDecision).filter(
        FortisDecision.user_id == current_user.id
    ).order_by(desc(FortisDecision.date)).first()

    state = db.query(FitnessState).filter(
        FitnessState.user_id == current_user.id
    ).order_by(desc(FitnessState.date)).first()

    return {
        "has_scan": True,
        "scan_id": scan.id,
        "user_id": current_user.id,
        "scan_date": scan.scan_date.isoformat(),
        "status": scan.status,
        "model_version": scan.model_version,
        "confidence": scan.confidence,
        "scan_confidence": scan.confidence,
        "data_available": m is not None,
        "movement_quality": m.movement_quality if m else None,
        "mobility": m.mobility if m else None,
        "mobility_score": m.mobility if m else None,
        "stability": m.stability if m else None,
        "stability_score": m.stability if m else None,
        "movement_consistency": m.movement_consistency if m else None,
        "symmetry_indicator": m.symmetry_indicator if m else None,
        "squat_movement_score": m.squat_movement_score if m else None,
        "squat_score": m.squat_movement_score if m else None,
        "posture_score": posture_val if m else None,
        "primary_movement_pattern": "squat_kinetic_chain",
        "joint_angles": m.joint_angles if m else {},
        "functional_metrics": m.functional_metrics if m else {},
        "observations": [
            {
                "category": o.category,
                "status": o.status,
                "finding": o.text,
                "text": o.text,
                "joint_affected": o.joint_affected,
                "severity": o.severity,
                "recommendation": "Maintain controlled tempo and focus on joint alignment.",
            }
            for o in obs
        ],
        "metrics": [
            {"metric_name": "movement_quality", "value": m.movement_quality if m else None, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "KINETICS"},
            {"metric_name": "mobility", "value": m.mobility if m else None, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "ROM"},
            {"metric_name": "stability", "value": m.stability if m else None, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "CONTROL"},
            {"metric_name": "consistency", "value": m.movement_consistency if m else None, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "TEMPO"},
            {"metric_name": "symmetry", "value": m.symmetry_indicator if m else None, "unit": "%", "confidence": round(scan.confidence / 100.0, 2), "category": "POSTURE"},
        ],
        "fortis_pulse_updated": state.fortis_pulse if state else None,
        "decision_updated": True,
        "limitations": scan.limitations or MODEL_LIMITATIONS,
        "disclaimer": RESPONSIBLE_AI_DISCLAIMER,
        "pulse": state.fortis_pulse if state else None,
        "recommendations": decision.recommendations if decision else [],
        "decision_type": decision.decision_type if decision else "NORMAL",
    }


@router.get("/{scan_id}/comparison")
def get_scan_comparison(
    scan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Compare scan {scan_id} with its immediate predecessor or return stored comparison.
    """
    current_scan = db.query(BodyScan).filter(
        BodyScan.id == scan_id,
        BodyScan.user_id == current_user.id
    ).first()

    if not current_scan or not current_scan.metrics:
        raise HTTPException(status_code=404, detail="Scan not found.")

    # Check if existing comparison recorded
    existing_comp = db.query(ScanComparison).filter(
        ScanComparison.current_scan_id == scan_id
    ).first()

    if existing_comp:
        prev = db.query(BodyScan).filter(BodyScan.id == existing_comp.previous_scan_id).first()
        deltas = existing_comp.metrics_delta or {}
        what_changed = existing_comp.what_changed or []
        improvements = [w for w in what_changed if "improved" in w.lower() or "elevated" in w.lower() or "increased" in w.lower()]
        regressions = [w for w in what_changed if "reduced" in w.lower() or "decreased" in w.lower() or "shifted" in w.lower()]
        stable = [w for w in what_changed if "steady" in w.lower() or "remain" in w.lower() or "consistent" in w.lower()]
        if not improvements and not regressions and not stable:
            stable = what_changed

        return {
            "has_comparison": True,
            "current_scan_id": current_scan.id,
            "previous_scan_id": prev.id if prev else None,
            "current_date": current_scan.scan_date.isoformat(),
            "previous_date": prev.scan_date.isoformat() if prev else None,
            "deltas": deltas,
            "metrics_delta": deltas,
            "improvements": improvements,
            "regressions": regressions,
            "stable": stable,
            "summary": " · ".join(what_changed) if what_changed else "Kinematic metrics remain steady relative to your baseline.",
            "disclaimer": RESPONSIBLE_AI_DISCLAIMER,
            "current_scan": {
                "id": current_scan.id,
                "date": current_scan.scan_date.isoformat(),
                "movement_quality": current_scan.metrics.movement_quality,
                "mobility": current_scan.metrics.mobility,
                "stability": current_scan.metrics.stability,
                "consistency": current_scan.metrics.movement_consistency,
            },
            "previous_scan": {
                "id": prev.id if prev else None,
                "date": prev.scan_date.isoformat() if prev else None,
                "movement_quality": prev.metrics.movement_quality if prev and prev.metrics else None,
                "mobility": prev.metrics.mobility if prev and prev.metrics else None,
                "stability": prev.metrics.stability if prev and prev.metrics else None,
                "consistency": prev.metrics.movement_consistency if prev and prev.metrics else None,
            },
            "what_changed": what_changed,
        }

    # Find previous scan if not explicitly stored
    prev_scan = db.query(BodyScan).filter(
        BodyScan.user_id == current_user.id,
        BodyScan.scan_date < current_scan.scan_date,
        BodyScan.status == "COMPLETED"
    ).order_by(desc(BodyScan.scan_date)).first()

    if not prev_scan or not prev_scan.metrics:
        return {
            "has_comparison": False,
            "current_scan_id": current_scan.id,
            "previous_scan_id": 0,
            "current_date": current_scan.scan_date.isoformat(),
            "previous_date": current_scan.scan_date.isoformat(),
            "deltas": {},
            "improvements": [],
            "regressions": [],
            "stable": [],
            "summary": "This is your baseline scan. Complete a future scan to see your movement evolution.",
            "disclaimer": RESPONSIBLE_AI_DISCLAIMER,
            "message": "This is your baseline scan. Complete a future scan to see your movement evolution.",
            "current_scan": {
                "id": current_scan.id,
                "date": current_scan.scan_date.isoformat(),
                "movement_quality": current_scan.metrics.movement_quality,
                "mobility": current_scan.metrics.mobility,
                "stability": current_scan.metrics.stability,
                "consistency": current_scan.metrics.movement_consistency,
            }
        }

    # Compute comparison
    cm = current_scan.metrics
    pm = prev_scan.metrics
    deltas = {
        "movement_quality": round(cm.movement_quality - pm.movement_quality, 1),
        "mobility": round(cm.mobility - pm.mobility, 1),
        "stability": round(cm.stability - pm.stability, 1),
        "movement_consistency": round(cm.movement_consistency - pm.movement_consistency, 1),
    }

    what_changed = []
    if deltas["movement_quality"] > 0:
        what_changed.append(f"Movement Quality improved {pm.movement_quality:.0f} → {cm.movement_quality:.0f} (+{deltas['movement_quality']})")
    elif deltas["movement_quality"] < 0:
        what_changed.append(f"Movement Quality shifted {pm.movement_quality:.0f} → {cm.movement_quality:.0f} ({deltas['movement_quality']})")

    if deltas["mobility"] > 0:
        what_changed.append(f"Mobility progressed {pm.mobility:.0f} → {cm.mobility:.0f} (+{deltas['mobility']}) with deeper squat inflection")
    elif deltas["mobility"] < 0:
        what_changed.append(f"Mobility reduced {pm.mobility:.0f} → {cm.mobility:.0f} ({deltas['mobility']})")

    if deltas["stability"] > 0:
        what_changed.append(f"Stability elevated {pm.stability:.0f} → {cm.stability:.0f} (+{deltas['stability']}) with reduced torso sway")
    elif deltas["stability"] < 0:
        what_changed.append(f"Stability decreased {pm.stability:.0f} → {cm.stability:.0f} ({deltas['stability']})")

    if not what_changed:
        what_changed.append("Kinematic metrics remain steady with your personal baseline.")

    improvements = [w for w in what_changed if "improved" in w.lower() or "elevated" in w.lower() or "increased" in w.lower()]
    regressions = [w for w in what_changed if "reduced" in w.lower() or "decreased" in w.lower() or "shifted" in w.lower()]
    stable = [w for w in what_changed if "steady" in w.lower() or "remain" in w.lower() or "consistent" in w.lower()]
    if not improvements and not regressions and not stable:
        stable = what_changed

    return {
        "has_comparison": True,
        "current_scan_id": current_scan.id,
        "previous_scan_id": prev_scan.id,
        "current_date": current_scan.scan_date.isoformat(),
        "previous_date": prev_scan.scan_date.isoformat(),
        "deltas": deltas,
        "metrics_delta": deltas,
        "improvements": improvements,
        "regressions": regressions,
        "stable": stable,
        "summary": " · ".join(what_changed) if what_changed else "Kinematic metrics remain steady with your personal baseline.",
        "disclaimer": RESPONSIBLE_AI_DISCLAIMER,
        "current_scan": {
            "id": current_scan.id,
            "date": current_scan.scan_date.isoformat(),
            "movement_quality": cm.movement_quality,
            "mobility": cm.mobility,
            "stability": cm.stability,
            "consistency": cm.movement_consistency,
        },
        "previous_scan": {
            "id": prev_scan.id,
            "date": prev_scan.scan_date.isoformat(),
            "movement_quality": pm.movement_quality,
            "mobility": pm.mobility,
            "stability": pm.stability,
            "consistency": pm.movement_consistency,
        },
        "what_changed": what_changed,
    }


@router.post("/generate-blueprint")
def generate_fortis_blueprint(
    body: BlueprintRequest = BlueprintRequest(),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Synthesizes the flagship YOUR FORTIS BLUEPRINT using real backend data:
    - Current State (Movement Quality, Recovery, Pulse)
    - Training Focus (Strength, Mobility, Movement Control)
    - Weekly Plan (Mon-Sun split adapted to movement findings)
    - Nutrition Approach (Regional foods, budget-optimized, goal-aligned)
    """
    # 1. Fetch scan
    if body.scan_id:
        scan = db.query(BodyScan).filter(BodyScan.id == body.scan_id, BodyScan.user_id == current_user.id).first()
    else:
        scan = db.query(BodyScan).filter(
            BodyScan.user_id == current_user.id,
            BodyScan.status == "COMPLETED"
        ).order_by(desc(BodyScan.scan_date)).first()

    # 2. Fetch fitness state
    today = datetime.utcnow().date()
    state = db.query(FitnessState).filter(
        FitnessState.user_id == current_user.id
    ).order_by(desc(FitnessState.date)).first()

    if not state:
        from app.intelligence.fitness_state import FitnessStateCalculator
        state = FitnessStateCalculator().compute(current_user.id, datetime.utcnow(), db)

    # 3. Fetch profile
    goal = db.query(Goal).filter(Goal.user_id == current_user.id).first()
    nutr_pref = db.query(NutritionPreference).filter(NutritionPreference.user_id == current_user.id).first()
    schedule = db.query(Schedule).filter(Schedule.user_id == current_user.id).first()

    primary_goal = goal.primary_goal if goal else "GENERAL_FITNESS"
    mq = scan.metrics.movement_quality if (scan and scan.metrics and scan.metrics.movement_quality is not None) else (state.movement_quality if state else None)
    mobility = scan.metrics.mobility if (scan and scan.metrics and scan.metrics.mobility is not None) else (state.mobility_score if state else None)
    stability = scan.metrics.stability if (scan and scan.metrics and scan.metrics.stability is not None) else (getattr(state, "stability", None) if state else None)
    recovery_score = round(state.recovery_score, 1) if (state and state.recovery_score is not None) else None
    fortis_pulse = round(state.fortis_pulse, 1) if (state and state.fortis_pulse is not None) else None

    # 4. Determine Training Focus priorities dynamically based on scan
    focus_items = []
    if mq is None:
        focus_items.append({
            "area": "Movement Assessment Pending",
            "name": "Movement Assessment Pending",
            "priority": "medium",
            "level": "Pending",
            "reason": "Complete a Fortis Scan to calibrate personalized movement quality and load capacity.",
            "desc": "Complete a Fortis Scan to calibrate personalized movement quality and load capacity."
        })
    elif mq >= 75:
        focus_items.append({
            "area": "Strength Progression",
            "name": "Strength Progression",
            "priority": "high",
            "level": "High",
            "reason": "Solid movement pattern allows progressive loading.",
            "desc": "Solid movement pattern allows progressive loading."
        })
    else:
        focus_items.append({
            "area": "Strength Foundation",
            "name": "Strength Foundation",
            "priority": "medium",
            "level": "Moderate",
            "reason": "Load cautiously while reinforcing kinetic path.",
            "desc": "Load cautiously while reinforcing kinetic path."
        })

    if mobility is None:
        focus_items.append({
            "area": "Mobility Assessment Pending",
            "name": "Mobility Assessment Pending",
            "priority": "low",
            "level": "Pending",
            "reason": "Baseline range of motion will calibrate from your first movement scan.",
            "desc": "Baseline range of motion will calibrate from your first movement scan."
        })
    elif mobility < 70:
        focus_items.append({
            "area": "Mobility & Range",
            "name": "Mobility & Range",
            "priority": "high",
            "level": "Priority",
            "reason": "Targeting hip and ankle depth to expand safe squat range.",
            "desc": "Targeting hip and ankle depth to expand safe squat range."
        })
    else:
        focus_items.append({
            "area": "Mobility Maintenance",
            "name": "Mobility Maintenance",
            "priority": "low",
            "level": "Standard",
            "reason": "Maintain full joint range of motion.",
            "desc": "Maintain full joint range of motion."
        })

    if stability is None:
        focus_items.append({
            "area": "Stability Assessment Pending",
            "name": "Stability Assessment Pending",
            "priority": "low",
            "level": "Pending",
            "reason": "Torso sway and balance metrics will calibrate from your movement scan.",
            "desc": "Torso sway and balance metrics will calibrate from your movement scan."
        })
    elif stability < 72:
        focus_items.append({
            "area": "Movement Control",
            "name": "Movement Control",
            "priority": "high",
            "level": "Priority",
            "reason": "3s eccentric tempo and anti-sway motor control drills.",
            "desc": "3s eccentric tempo and anti-sway motor control drills."
        })
    else:
        focus_items.append({
            "area": "Movement Control",
            "name": "Movement Control",
            "priority": "low",
            "level": "Standard",
            "reason": "Clean bilateral balance and torso stability.",
            "desc": "Clean bilateral balance and torso stability."
        })

    # 5. Build Weekly Plan
    # Mon Strength, Tue Mobility, Wed Strength, Thu Recovery, Fri Strength, Sat Core/Active, Sun Rest
    weekly_plan = [
        {
            "day": "Mon",
            "focus": "Strength Compound",
            "exercises": ["Goblet Squat (3s tempo)", "Dumbbell Bench Press", "Romanian Deadlift", "Plank"],
            "emphasis": "Controlled descent" if (stability is not None and stability < 72) else "Progressive load",
        },
        {
            "day": "Tue",
            "focus": "Mobility & Kinetic Flow",
            "exercises": ["Hip 90/90 Stretch", "Ankle Dorsiflexion Wall Drive", "Cat-Cow", "World's Greatest Stretch"],
            "emphasis": "Deep hip/ankle range",
        },
        {
            "day": "Wed",
            "focus": "Strength Upper & Pull",
            "exercises": ["Bent-Over Row", "Overhead Press", "Lat Pulldown / Pull-ups", "Face Pulls"],
            "emphasis": "Scapular retraction & posture",
        },
        {
            "day": "Thu",
            "focus": "Active Recovery",
            "exercises": ["25-min Zone 2 Walk", "Thoracic Spine Foam Rolling", "Light Stretching"],
            "emphasis": "Parasympathetic reset & blood flow",
        },
        {
            "day": "Fri",
            "focus": "Strength Lower & Power",
            "exercises": ["Front Squat / Leg Press", "Bulgarian Split Squat", "Calf Raises", "Hanging Knee Raises"],
            "emphasis": "Bilateral balance & unilateral stability",
        },
        {
            "day": "Sat",
            "focus": "Movement Control & Conditioning",
            "exercises": ["Kettlebell Swings", "Farmer's Walk", "Bodyweight Tempo Squats", "Side Plank"],
            "emphasis": "Core brace under load",
        },
        {
            "day": "Sun",
            "focus": "Rest & Regeneration",
            "exercises": ["Complete rest", "Hydration focus", "8h Sleep target"],
            "emphasis": "Systemic adaptation & tissue repair",
        },
    ]

    # 6. Build Nutrition Approach from real nutrition engine data
    region = nutr_pref.regional_preference if nutr_pref else "Kerala"
    budget = nutr_pref.daily_budget_inr if nutr_pref else 150.0
    diet = nutr_pref.diet_type if nutr_pref else "non_vegetarian"
    cal_target = MEAL_TEMPLATES.get(primary_goal, {}).get("target_calories", 2200)

    # Sample actual regional dishes
    breakfast_foods = get_foods_for_meal(db, "BREAKFAST", region, diet)
    lunch_foods = get_foods_for_meal(db, "LUNCH", region, diet)
    dinner_foods = get_foods_for_meal(db, "DINNER", region, diet)

    b_names = ", ".join(f.name for f in breakfast_foods[:2]) if breakfast_foods else "Puttu & Kadala"
    l_names = ", ".join(f.name for f in lunch_foods[:2]) if lunch_foods else "Rice & Fish Curry"
    d_names = ", ".join(f.name for f in dinner_foods[:2]) if dinner_foods else "Chapati & Egg Curry"

    nutrition_approach = {
        "region": region,
        "daily_budget_inr": budget,
        "diet_type": diet.replace("_", " ").title(),
        "target_calories": cal_target,
        "highlights": [
            f"Regional staples: {b_names} for breakfast; {l_names} for lunch.",
            f"Budget optimized: Calibrated to stay under ₹{budget:.0f}/day without sacrificing protein.",
            f"Goal aligned: High protein synthesis support for {primary_goal.replace('_', ' ').lower()}.",
        ],
        "meals_preview": [
            {"meal": "Breakfast", "recommendation": b_names},
            {"meal": "Lunch", "recommendation": l_names},
            {"meal": "Dinner", "recommendation": d_names},
        ]
    }

    return {
        "blueprint_title": "YOUR FORTIS BLUEPRINT",
        "generated_at": datetime.utcnow().isoformat(),
        "current_state": {
            "movement_quality": round(mq, 1) if mq is not None else None,
            "mobility": round(mobility, 1) if mobility is not None else None,
            "stability": round(stability, 1) if stability is not None else None,
            "recovery_score": recovery_score,
            "fortis_pulse": fortis_pulse,
            "data_available": any(v is not None for v in (mq, mobility, stability, recovery_score, fortis_pulse)),
        },
        "training_focus": focus_items,
        "weekly_plan": weekly_plan,
        "nutrition_approach": nutrition_approach,
        "disclaimer": RESPONSIBLE_AI_DISCLAIMER,
    }


@router.post("/bmi", response_model=BMICalculatorResponse)
def calculate_bmi(data: BMICalculatorRequest):
    """
    Separate BMI calculator tool using user-entered height & weight.
    Formula: BMI = weight_kg / (height_m ** 2)
    Note: BMI does NOT calculate from camera imagery and is a basic screening measure.
    """
    height_m = data.height_cm / 100.0
    bmi = round(data.weight_kg / (height_m ** 2), 1)

    if bmi < 18.5:
        category = "Underweight"
    elif bmi < 25.0:
        category = "Normal Weight"
    elif bmi < 30.0:
        category = "Overweight"
    else:
        category = "Obese"

    # Healthy weight range (BMI 18.5 to 24.9)
    min_healthy = round(18.5 * (height_m ** 2), 1)
    max_healthy = round(24.9 * (height_m ** 2), 1)

    return {
        "bmi": bmi,
        "category": category,
        "height_cm": data.height_cm,
        "weight_kg": data.weight_kg,
        "healthy_weight_range_kg": {
            "min": min_healthy,
            "max": max_healthy,
        },
        "healthy_bmi_range": "18.5 - 24.9",
        "disclaimer": RESPONSIBLE_AI_DISCLAIMER,
        "note": (
            "BMI is a basic height-to-weight screening measure and does not directly "
            "measure fitness or body composition. Fortis relies on your functional movement "
            "kinetics and recovery signals for personalized programming."
        ),
    }
