"""
backend/test_shelters.py - Automated Test Suite for Shelter Recommendation Engine.
Smart India Hackathon (Team Enigma)

Verifies:
1. Multi-criteria suitability scoring (proximity, zone flood risk, elevation, capacity).
2. Penalty mechanisms: critical flood zones, full capacity, inactive shelters.
3. Geographic ranking from different locations in Kamrup Metropolitan.
4. Safe evacuation route generation to the top recommended shelter.
5. FastAPI endpoint verification (GET and POST /shelters/recommend).
"""

import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend import model_service
from backend.db.session import init_db, get_db
from backend.db.models import Shelter
from backend.routing.graph_service import graph_service
from backend.shelters.recommender import (
    calculate_shelter_suitability,
    recommend_shelters
)


@pytest.fixture(scope="module", autouse=True)
def setup_services():
    """Ensure models, database, and routing graph are initialized."""
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


def test_suitability_distance_weighting():
    """Test that closer shelters score higher when all other factors are equal."""
    score_close, _ = calculate_shelter_suitability(
        distance_km=2.0,
        zone_risk=15.0,
        elevation_m=55.0,
        available_capacity=300,
        status="Active"
    )

    score_far, _ = calculate_shelter_suitability(
        distance_km=18.0,
        zone_risk=15.0,
        elevation_m=55.0,
        available_capacity=300,
        status="Active"
    )

    assert score_close > score_far
    assert score_close - score_far >= 15.0  # Significant difference due to distance


def test_suitability_flood_risk_penalty():
    """Test that shelters in high flood risk zones are heavily penalized."""
    score_safe_zone, warning_safe = calculate_shelter_suitability(
        distance_km=5.0,
        zone_risk=10.0,
        elevation_m=55.0,
        available_capacity=200,
        status="Active"
    )

    score_flooded_zone, warning_flooded = calculate_shelter_suitability(
        distance_km=5.0,
        zone_risk=80.0,  # Critical flood zone
        elevation_m=55.0,
        available_capacity=200,
        status="Active"
    )

    assert score_flooded_zone < score_safe_zone
    assert score_flooded_zone <= 25.0  # Critical penalty applied
    assert warning_flooded is not None
    assert "flood" in warning_flooded.lower()
    assert warning_safe is None


def test_suitability_capacity_and_status():
    """Test full or inactive shelters receive penalties."""
    # Active with space
    score_active, _ = calculate_shelter_suitability(
        distance_km=5.0, zone_risk=15.0, elevation_m=55.0,
        available_capacity=400, status="Active"
    )

    # Full shelter
    score_full, warn_full = calculate_shelter_suitability(
        distance_km=5.0, zone_risk=15.0, elevation_m=55.0,
        available_capacity=0, status="Full"
    )

    # Inactive shelter
    score_inactive, warn_inactive = calculate_shelter_suitability(
        distance_km=5.0, zone_risk=15.0, elevation_m=55.0,
        available_capacity=400, status="Inactive"
    )

    assert score_active > score_full
    assert warn_full is not None
    assert score_inactive == 0.0
    assert warn_inactive is not None


def test_recommend_shelters_jalukbari(db):
    """
    Test shelter recommendation for citizen at Jalukbari (West Guwahati).
    Should prioritize Gauhati University or Assam Engineering College.
    """
    jalukbari_lat = 26.1445
    jalukbari_lon = 91.6631

    result = recommend_shelters(
        lat=jalukbari_lat,
        lon=jalukbari_lon,
        db=db,
        district="Kamrup Metropolitan",
        limit=3,
        include_route=True
    )

    assert result["total_shelters_evaluated"] >= 8
    recommendations = result["recommended_shelters"]
    assert len(recommendations) == 3

    top = recommendations[0]
    assert top["suitability_rank"] == 1
    assert top["distance_km"] < 5.0  # Nearby West Guwahati shelter
    # Check that top shelter has safe route attached
    assert top["route_to_shelter"] is not None
    assert "distance_km" in top["route_to_shelter"]
    assert "geojson" in top["route_to_shelter"]


def test_recommend_shelters_paltan_bazaar(db):
    """
    Test shelter recommendation for citizen at Paltan Bazaar (Central Guwahati).
    Should prioritize central shelters (Nehru Stadium, Cotton University).
    """
    paltan_lat = 26.1812
    paltan_lon = 91.7510

    result = recommend_shelters(
        lat=paltan_lat,
        lon=paltan_lon,
        db=db,
        district="Kamrup Metropolitan",
        limit=3,
        include_route=False
    )

    recommendations = result["recommended_shelters"]
    top_names = [r["name"] for r in recommendations]

    # At least one central landmark should be in top recommendations
    central_found = any("Nehru" in n or "Cotton" in n for n in top_names)
    assert central_found


def test_api_get_shelter_recommendation(client):
    """Test GET /shelters/recommend endpoint."""
    url = "/shelters/recommend?lat=26.1158&lon=91.8210&limit=3&include_route=true"
    response = client.get(url)
    assert response.status_code == 200

    data = response.json()
    assert "citizen_location" in data
    assert "recommended_shelters" in data
    assert len(data["recommended_shelters"]) <= 3
    for s in data["recommended_shelters"]:
        assert "suitability_score" in s
        assert "elevation_m" in s
        assert "zone_risk_score" in s


def test_api_post_shelter_recommendation(client):
    """Test POST /shelters/recommend endpoint."""
    payload = {
        "lat": 26.1445,
        "lon": 91.7362,
        "district": "Kamrup Metropolitan",
        "limit": 2,
        "include_route": False,
        "simulated": True
    }
    response = client.post("/shelters/recommend", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["simulated"] is True
    assert len(data["recommended_shelters"]) == 2


def test_api_shelters_invalid_coordinates(client):
    """Test out-of-range latitude returns 422 validation error."""
    response = client.get("/shelters/recommend?lat=99.0&lon=91.73")
    assert response.status_code == 422
