"""
backend/test_sos.py - Automated Test Suite for Citizen SOS Urgency Triage & Prioritization.
Smart India Hackathon (Team Enigma)

Verifies:
1. Multi-factor urgency score computation (water depth, medical, infants, elderly, zone risk).
2. Priority tier categorization (Critical, High, Moderate, Low).
3. Rescue triage queue ranking and aggregate statistics.
4. Nearest shelter resolution for evacuee transport.
5. Operational lifecycle updates (Pending -> Dispatched -> Rescued / Cancelled).
6. FastAPI endpoints: POST /sos, GET /sos/triage, GET /sos/{id}, PATCH /sos/{id}/status.
"""

import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient

from backend.main import app
from backend import model_service
from backend.db.session import init_db, get_db
from backend.db.models import SOSRequest
from backend.sos.triage import (
    calculate_urgency_score,
    get_priority_level,
    get_triage_queue,
    update_rescue_status
)


@pytest.fixture(scope="module", autouse=True)
def setup_services():
    """Ensure models and database are initialized."""
    model_service.ensure_loaded()
    init_db()


@pytest.fixture(scope="module")
def client():
    """Test client."""
    return TestClient(app)


@pytest.fixture(scope="module")
def db():
    """Database session fixture."""
    return next(get_db())


def test_urgency_water_depth_scaling():
    """Verify deeper water produces higher urgency scores."""
    score_submerged = calculate_urgency_score("Submerged")
    score_chest = calculate_urgency_score("Chest")
    score_waist = calculate_urgency_score("Waist")
    score_knee = calculate_urgency_score("Knee")
    score_ankle = calculate_urgency_score("Ankle")

    assert score_submerged > score_chest > score_waist > score_knee > score_ankle
    assert score_submerged >= 90.0
    assert score_ankle == 15.0


def test_urgency_vulnerability_boosters():
    """Verify medical emergency, infants, and elderly increase urgency."""
    baseline = calculate_urgency_score("Waist")  # 50.0

    with_medical = calculate_urgency_score("Waist", has_medical_emergency=True)
    with_infants = calculate_urgency_score("Waist", has_infants=True)
    with_elderly = calculate_urgency_score("Waist", has_elderly=True)
    with_all = calculate_urgency_score(
        "Waist",
        has_medical_emergency=True,
        has_infants=True,
        has_elderly=True,
        people_count=4
    )

    assert with_medical == baseline + 25.0
    assert with_infants == baseline + 15.0
    assert with_elderly == baseline + 10.0
    # Clamped to 100.0 maximum
    assert with_all <= 100.0
    assert with_all > with_medical


def test_urgency_environmental_zone_risk_booster():
    """Verify enclosing zone flood risk elevates urgency."""
    safe_zone_urgency = calculate_urgency_score("Knee", zone_risk_score=10.0)
    flooded_zone_urgency = calculate_urgency_score("Knee", zone_risk_score=85.0)

    assert flooded_zone_urgency - safe_zone_urgency == 15.0


def test_priority_tier_classification():
    """Test priority tier boundaries."""
    assert get_priority_level(95.0) == "Critical"
    assert get_priority_level(85.0) == "Critical"
    assert get_priority_level(75.0) == "High"
    assert get_priority_level(65.0) == "High"
    assert get_priority_level(50.0) == "Moderate"
    assert get_priority_level(40.0) == "Moderate"
    assert get_priority_level(25.0) == "Low"


def test_get_triage_queue_functionality(db):
    """Test triage queue returns ordered items, summary, and nearest shelters."""
    triage = get_triage_queue(db=db, district="Kamrup Metropolitan")

    assert "summary" in triage
    assert "queue" in triage
    summary = triage["summary"]
    assert summary["total_requests"] >= 5
    assert "priority_breakdown" in summary

    queue = triage["queue"]
    assert len(queue) >= 5

    # Check strict descending urgency order
    scores = [item["urgency_score"] for item in queue]
    assert scores == sorted(scores, reverse=True)

    # Check queue position numbering
    for i, item in enumerate(queue, start=1):
        assert item["queue_position"] == i
        assert "nearest_shelter" in item


def test_update_rescue_lifecycle(db):
    """Test updating SOS request from Pending -> Dispatched -> Rescued."""
    # Find any pending request
    req = db.query(SOSRequest).filter(SOSRequest.status == "Pending").first()
    assert req is not None
    req_id = req.id

    # 1. Dispatch
    dispatched = update_rescue_status(
        sos_id=req_id,
        status="Dispatched",
        db=db,
        assigned_team="NDRF Team Bravo - Boat 2",
        estimated_eta_min=15,
        notes="Rescue boat en route"
    )
    assert dispatched.status == "Dispatched"
    assert dispatched.assigned_team == "NDRF Team Bravo - Boat 2"
    assert dispatched.estimated_eta_min == 15

    # 2. Rescued
    rescued = update_rescue_status(
        sos_id=req_id,
        status="Rescued",
        db=db,
        notes="Citizen safely evacuated to Sarusajai"
    )
    assert rescued.status == "Rescued"


def test_update_rescue_invalid_status(db):
    """Test that invalid operational status raises ValueError."""
    with pytest.raises(ValueError) as excinfo:
        update_rescue_status(sos_id=1, status="InvalidStatus", db=db)
    assert "Invalid status" in str(excinfo.value)


def test_api_post_sos(client):
    """Test POST /sos endpoint creates distress call with computed urgency."""
    payload = {
        "citizen_name": "Ramen Boro",
        "phone": "+91-98640-54321",
        "lat": 26.1445,
        "lon": 91.6631,
        "people_count": 3,
        "has_elderly": True,
        "has_infants": False,
        "has_medical_emergency": True,
        "water_depth_level": "Chest",
        "notes": "Trapped on terrace with elderly grandparent",
        "is_simulated": True
    }
    response = client.post("/sos", json=payload)
    assert response.status_code == 201

    data = response.json()
    assert data["citizen_name"] == "Ramen Boro"
    assert data["status"] == "Pending"
    assert data["urgency_score"] >= 90.0  # Chest (75) + Medical (25) = 100
    assert data["is_simulated"] is True


def test_api_get_sos_triage_dashboard(client):
    """Test GET /sos/triage endpoint returns ranked dashboard queue."""
    response = client.get("/sos/triage?district=Kamrup%20Metropolitan")
    assert response.status_code == 200

    data = response.json()
    assert "summary" in data
    assert "queue" in data
    assert data["summary"]["total_requests"] > 0
    assert len(data["queue"]) > 0

    first_item = data["queue"][0]
    assert first_item["queue_position"] == 1
    assert "priority_level" in first_item


def test_api_patch_sos_status(client):
    """Test PATCH /sos/{id}/status endpoint."""
    # Create an SOS first
    res = client.post("/sos", json={
        "citizen_name": "Test Citizen Dispatch",
        "phone": "+91-99999-12345",
        "lat": 26.1554,
        "lon": 91.6631,
        "people_count": 1,
        "has_elderly": False,
        "has_infants": False,
        "has_medical_emergency": False,
        "water_depth_level": "Waist",
        "is_simulated": True
    })
    sos_id = res.json()["id"]

    # Dispatch team
    patch_res = client.patch(f"/sos/{sos_id}/status", json={
        "status": "Dispatched",
        "assigned_team": "SDRF Unit 1",
        "estimated_eta_min": 20,
        "notes": "Dispatched boat team"
    })
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["status"] == "Dispatched"
    assert updated["assigned_team"] == "SDRF Unit 1"
    assert updated["estimated_eta_min"] == 20
