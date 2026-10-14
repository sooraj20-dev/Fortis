import pytest
import os
import cv2
import numpy as np
import tempfile
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.vision.scan_service import ScanService

client = TestClient(app)


def test_scan_service_initialization_failure_does_not_crash_api(monkeypatch):
    def fail_to_initialize():
        raise OSError("MediaPipe was blocked by application control")

    monkeypatch.setattr("app.vision.scan_service.BodyScanExtractor", fail_to_initialize)
    service = ScanService()

    result = service.process_video_file("unused.mp4", user_id=1, db=None)

    assert result["success"] is False
    assert result["status"] == "INSUFFICIENT_DATA"
    assert "MediaPipe was blocked by application control" in result["quality_reasons"][0]


def get_auth_token():
    # Login as demo user or register if doesn't exist
    res = client.post("/api/auth/login", json={"email": "demo@fortis.ai", "password": "Demo@123"})
    if res.status_code != 200:
        reg_res = client.post("/api/auth/register", json={
            "name": "Demo User",
            "email": "demo@fortis.ai",
            "password": "Demo@123"
        })
        if reg_res.status_code == 200:
            token = reg_res.json()["access_token"]
            return {"Authorization": f"Bearer {token}"}
        # Retry login if register indicated email already registered
        res = client.post("/api/auth/login", json={"email": "demo@fortis.ai", "password": "Demo@123"})
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def create_blank_video(path: str, num_frames=15, width=320, height=240):
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(path, fourcc, 15.0, (width, height))
    for _ in range(num_frames):
        frame = np.zeros((height, width, 3), dtype=np.uint8)  # Black frame
        out.write(frame)
    out.release()


def test_scan_start_and_bmi():
    headers = get_auth_token()

    # 1. Test /api/scan/start
    res_start = client.post("/api/scan/start", headers=headers)
    assert res_start.status_code == 200
    data_start = res_start.json()
    assert "guided_steps" in data_start
    assert len(data_start["guided_steps"]) == 3
    assert data_start["guided_steps"][0]["key"] == "FRONT"
    assert data_start["guided_steps"][1]["key"] == "SIDE"
    assert data_start["guided_steps"][2]["key"] == "SQUAT"

    # 2. Test /api/scan/bmi
    res_bmi = client.post("/api/scan/bmi", json={"height_cm": 178, "weight_kg": 75}, headers=headers)
    assert res_bmi.status_code == 200
    bmi_data = res_bmi.json()
    assert bmi_data["bmi"] == 23.7
    assert bmi_data["category"] == "Normal Weight"
    assert "screening measure" in bmi_data["note"]


def test_scan_insufficient_data_validation():
    headers = get_auth_token()

    # Test that black/empty video returns INSUFFICIENT_DATA (never fabricates results)
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        blank_video = tf.name

    try:
        create_blank_video(blank_video)
        with open(blank_video, "rb") as f:
            res = client.post(
                "/api/scan/analyze",
                files={"file": ("blank.mp4", f, "video/mp4")},
                data={"discard_video": "true", "allow_demo_fallback": "false"},
                headers=headers
            )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is False
        assert data["status"] == "INSUFFICIENT_DATA"
        assert "INSUFFICIENT DATA" in data["message"]
    finally:
        if os.path.exists(blank_video):
            os.remove(blank_video)


def test_scan_analyze_and_full_pipeline():
    headers = get_auth_token()

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        temp_video = tf.name

    try:
        create_blank_video(temp_video)
        with open(temp_video, "rb") as f:
            res = client.post(
                "/api/scan/analyze",
                files={"file": ("test_squat.mp4", f, "video/mp4")},
                data={"discard_video": "true", "allow_demo_fallback": "true"},
                headers=headers
            )

        assert res.status_code == 200
        scan_res = res.json()
        assert scan_res["success"] is True
        assert "movement_quality" in scan_res
        assert "mobility" in scan_res
        assert "stability" in scan_res
        assert "observations" in scan_res
        assert "fitness_state" in scan_res
        assert "decision" in scan_res
        scan_id = scan_res["scan_id"]

        # Test /api/scan/latest
        res_latest = client.get("/api/scan/latest", headers=headers)
        assert res_latest.status_code == 200
        latest_data = res_latest.json()
        assert latest_data["has_scan"] is True
        assert latest_data["scan_id"] == scan_id

        # Test /api/scan/history
        res_hist = client.get("/api/scan/history", headers=headers)
        assert res_hist.status_code == 200
        hist_data = res_hist.json()
        assert len(hist_data) >= 1

        # Test /api/scan/{id}
        res_detail = client.get(f"/api/scan/{scan_id}", headers=headers)
        assert res_detail.status_code == 200

        # Perform a second scan to test comparison
        with open(temp_video, "rb") as f2:
            res2 = client.post(
                "/api/scan/analyze",
                files={"file": ("test_squat_2.mp4", f2, "video/mp4")},
                data={"discard_video": "true", "allow_demo_fallback": "true"},
                headers=headers
            )
        assert res2.status_code == 200
        scan_id_2 = res2.json()["scan_id"]

        # Test /api/scan/{id}/comparison
        res_comp = client.get(f"/api/scan/{scan_id_2}/comparison", headers=headers)
        assert res_comp.status_code == 200
        comp_data = res_comp.json()
        assert comp_data["has_comparison"] is True
        assert "metrics_delta" in comp_data
        assert "what_changed" in comp_data

        # Test /api/scan/generate-blueprint
        res_bp = client.post("/api/scan/generate-blueprint", json={"scan_id": scan_id_2}, headers=headers)
        assert res_bp.status_code == 200
        bp = res_bp.json()
        assert bp["blueprint_title"] == "YOUR FORTIS BLUEPRINT"
        assert "current_state" in bp
        assert "training_focus" in bp
        assert len(bp["weekly_plan"]) == 7
        assert "nutrition_approach" in bp

    finally:
        if os.path.exists(temp_video):
            os.remove(temp_video)


def test_ai_coach_scan_integration():
    headers = get_auth_token()

    # Create chat session
    res_sess = client.post("/api/coach/sessions", headers=headers)
    assert res_sess.status_code == 200
    sess_id = res_sess.json()["id"]

    # Ask "What did my scan detect?"
    res_msg1 = client.post(
        f"/api/coach/sessions/{sess_id}/message",
        json={"content": "What did my scan detect?"},
        headers=headers
    )
    assert res_msg1.status_code == 200
    reply1 = res_msg1.json()["content"]
    assert "Movement Quality" in reply1 or "Joint Mobility" in reply1 or "Fortis Scan" in reply1

    # Ask "Why did you prioritize mobility?"
    res_msg2 = client.post(
        f"/api/coach/sessions/{sess_id}/message",
        json={"content": "Why did you prioritize mobility?"},
        headers=headers
    )
    assert res_msg2.status_code == 200
    reply2 = res_msg2.json()["content"]
    assert "mobility" in reply2.lower()

    # Ask "What changed since my previous scan?"
    res_msg3 = client.post(
        f"/api/coach/sessions/{sess_id}/message",
        json={"content": "What changed since my previous scan?"},
        headers=headers
    )
    assert res_msg3.status_code == 200
    reply3 = res_msg3.json()["content"]
    assert "Fortis Evolution" in reply3 or "Movement Quality" in reply3

    # Ask "Why did my workout change?"
    res_msg4 = client.post(
        f"/api/coach/sessions/{sess_id}/message",
        json={"content": "Why did my workout change?"},
        headers=headers
    )
    assert res_msg4.status_code == 200
    reply4 = res_msg4.json()["content"]
    assert "Fortis Pulse" in reply4 or "training" in reply4.lower()
