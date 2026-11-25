"""
backend/test_simulation.py - Automated Test Suite for What-If Flood Scenario Simulation.
Smart India Hackathon (Team Enigma)

Verifies:
1. Scenario presets initialization and validity.
2. Dynamic what-if flood risk re-calculation across 1 km grid zones.
3. Cascade impact analysis: newly critical zones, severed road corridors, compromised shelters.
4. Compliance with Rule 3: strictly labeling all simulation outputs as 'simulated': True.
5. FastAPI endpoints: GET /simulate/presets and POST /simulate.
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend import model_service
from backend.db.session import init_db, get_db
from backend.routing.graph_service import graph_service
from backend.simulation.simulator import run_flood_simulation, SIMULATION_PRESETS


@pytest.fixture(scope="module", autouse=True)
def setup_services():
    """Ensure models, database, and road routing graph are pre-loaded."""
    model_service.ensure_loaded()
    init_db()
    if graph_service.graph is None:
        graph_service.build_graph(
            model_service._STATIC_FEATURES_DF,
            model_service._GRID_GEOJSON
        )


@pytest.fixture(scope="module")
def client():
    """Test client."""
    return TestClient(app)


@pytest.fixture(scope="module")
def db():
    """Database session fixture."""
    return next(get_db())


def test_simulation_presets_structure():
    """Verify that all predefined disaster drill scenarios exist and are properly configured."""
    assert len(SIMULATION_PRESETS) >= 4

    preset_ids = [p["id"] for p in SIMULATION_PRESETS]
    assert "monsoon_baseline" in preset_ids
    assert "heavy_monsoon_surge" in preset_ids
    assert "extreme_cloudburst" in preset_ids
    assert "catastrophic_century_flood" in preset_ids

    for p in SIMULATION_PRESETS:
        assert p["rain_7d_mm"] >= 0
        assert p["rain_15d_mm"] >= p["rain_7d_mm"]
        assert p["rain_30d_mm"] >= p["rain_15d_mm"]
        assert p["severity"] in ["Normal", "Elevated", "Severe", "Catastrophic"]


def test_run_flood_simulation_heavy_surge(db):
    """
    Test running heavy rainfall surge simulation.
    Verifies risk increase, road network severance detection, and shelter impacts.
    """
    result = run_flood_simulation(
        rain_7d_mm=250.0,
        rain_15d_mm=420.0,
        rain_30d_mm=680.0,
        scenario_name="Automated Test Surge",
        district="Kamrup Metropolitan",
        db=db
    )

    assert result["status"] == "success"
    assert result["simulated"] is True  # Rule 3 compliance

    # Zone impact checks
    zone_impact = result["zone_impact"]
    assert zone_impact["total_zones_evaluated"] == 904
    assert zone_impact["mean_risk_increase"] > 0.0
    assert "baseline_summary" in zone_impact
    assert "simulated_summary" in zone_impact

    # Road network impact checks
    road_impact = result["road_network_impact"]
    assert road_impact["total_network_edges"] > 0
    assert len(road_impact["monitored_corridors"]) == 5

    # Shelter impact checks
    shelter_impact = result["shelter_impact"]
    assert shelter_impact["total_shelters_evaluated"] >= 8
    assert "compromised_shelters" in shelter_impact

    # SOS impact checks
    sos_impact = result["sos_impact"]
    assert "pending_sos_count" in sos_impact


def test_run_flood_simulation_extreme_cloudburst(db):
    """
    Test severe cloudburst scenario where rainfall surge triggers
    significant critical zones and severed road corridors.
    """
    result = run_flood_simulation(
        rain_7d_mm=450.0,
        rain_15d_mm=700.0,
        rain_30d_mm=1000.0,
        scenario_name="Test Cloudburst Extremum",
        district="Kamrup Metropolitan",
        db=db
    )

    zone_impact = result["zone_impact"]
    road_impact = result["road_network_impact"]

    # In extreme cloudburst, more zones shift to High or Critical
    assert zone_impact["newly_critical_zones_count"] > 0 or zone_impact["newly_high_risk_zones_count"] > 0
    assert result["simulated"] is True


def test_api_get_simulation_presets(client):
    """Test GET /simulate/presets endpoint."""
    response = client.get("/simulate/presets")
    assert response.status_code == 200
    presets = response.json()
    assert len(presets) >= 4
    assert presets[0]["id"] == "monsoon_baseline"


def test_api_post_simulate(client):
    """Test POST /simulate endpoint with payload."""
    payload = {
        "scenario_name": "Test API Simulation Drill",
        "district": "Kamrup Metropolitan",
        "rain_7d_mm": 200.0,
        "rain_15d_mm": 350.0,
        "rain_30d_mm": 550.0
    }
    response = client.post("/simulate", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "success"
    assert data["simulated"] is True
    assert "zone_impact" in data
    assert "road_network_impact" in data
    assert "shelter_impact" in data


def test_api_post_simulate_invalid_district(client):
    """Test POST /simulate with non-existent district returns 400 error."""
    payload = {
        "scenario_name": "Invalid District Test",
        "district": "NonExistentDistrictXYZ",
        "rain_7d_mm": 100.0,
        "rain_15d_mm": 200.0,
        "rain_30d_mm": 300.0
    }
    response = client.post("/simulate", json=payload)
    assert response.status_code == 400
