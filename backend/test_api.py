"""
backend/test_api.py - Automated Test Suite for JALDHRISHTI FastAPI Endpoints.

Tests:
1. Health and Root endpoints
2. /predict endpoint with physical features
3. /predict/batch endpoint
4. /zones endpoint with GeoJSON structure and Kamrup Metropolitan grid
5. /zones/{zone_id} endpoint
6. /shelters endpoint (capacity, elevation, status)
7. /sos endpoint (GET prioritized list & POST submission)
8. /model/metrics validation endpoint
"""

import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)


def test_root_endpoint():
    """Verify welcome root endpoint returns status 200 and platform details."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "JALDHRISHTI"
    assert "endpoints" in data


def test_health_endpoint():
    """Verify health check reports model loaded and available zones."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["model_loaded"] is True
    assert data["total_grid_zones"] > 0
    assert len(data["feature_columns"]) == 8


def test_districts_endpoint():
    """Verify list of study districts includes Kamrup Metropolitan demo district."""
    response = client.get("/districts")
    assert response.status_code == 200
    data = response.json()
    assert "Kamrup Metropolitan" in data["districts"]
    assert data["demo_district"] == "Kamrup Metropolitan"


def test_predict_single_high_risk():
    """Verify prediction on low-elevation flat terrain with heavy rainfall."""
    payload = {
        "elevation_mean": 42.0,
        "elevation_min": 38.0,
        "slope_mean": 0.25,
        "dist_to_river_m": 120.0,
        "drainage_density": 1.5,
        "rain_7d_mm": 180.0,
        "rain_15d_mm": 350.0,
        "rain_30d_mm": 550.0
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert 0.0 <= data["risk_score"] <= 100.0
    assert data["risk_level"] in ["Safe", "Moderate", "High", "Critical"]
    assert 0.5 <= data["confidence"] <= 1.0


def test_predict_single_low_risk():
    """Verify prediction on high-elevation steep terrain with low rainfall."""
    payload = {
        "elevation_mean": 550.0,
        "elevation_min": 480.0,
        "slope_mean": 22.0,
        "dist_to_river_m": 2500.0,
        "drainage_density": 0.0,
        "rain_7d_mm": 10.0,
        "rain_15d_mm": 20.0,
        "rain_30d_mm": 50.0
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["risk_score"] < 25.0
    assert data["risk_level"] == "Safe"


def test_predict_validation_error():
    """Verify that omitting required physical features returns HTTP 422."""
    incomplete_payload = {
        "elevation_mean": 45.0,
        "slope_mean": 0.5
    }
    response = client.post("/predict", json=incomplete_payload)
    assert response.status_code == 422


def test_predict_batch():
    """Verify batch prediction endpoint."""
    batch_payload = {
        "zones": [
            {
                "elevation_mean": 40.0,
                "elevation_min": 35.0,
                "slope_mean": 0.2,
                "dist_to_river_m": 100.0,
                "drainage_density": 1.2,
                "rain_7d_mm": 150.0,
                "rain_15d_mm": 300.0,
                "rain_30d_mm": 500.0
            },
            {
                "elevation_mean": 400.0,
                "elevation_min": 350.0,
                "slope_mean": 18.0,
                "dist_to_river_m": 1800.0,
                "drainage_density": 0.0,
                "rain_7d_mm": 15.0,
                "rain_15d_mm": 30.0,
                "rain_30d_mm": 60.0
            }
        ]
    }
    response = client.post("/predict/batch", json=batch_payload)
    assert response.status_code == 200
    data = response.json()
    assert data["count"] == 2
    assert len(data["predictions"]) == 2


def test_zones_geojson_endpoint():
    """Verify /zones returns valid GeoJSON FeatureCollection for Kamrup Metropolitan."""
    response = client.get("/zones?district=Kamrup%20Metropolitan")
    assert response.status_code == 200
    data = response.json()
    assert data["type"] == "FeatureCollection"
    assert "summary" in data
    assert data["summary"]["district"] == "Kamrup Metropolitan"
    assert data["summary"]["total_zones"] == 904
    assert len(data["features"]) == 904

    first_feat = data["features"][0]
    assert first_feat["type"] == "Feature"
    assert "geometry" in first_feat
    props = first_feat["properties"]
    assert "zone_id" in props
    assert "risk_score" in props
    assert "risk_level" in props
    assert props["risk_level"] in ["Safe", "Moderate", "High", "Critical"]


def test_zones_with_simulated_rainfall():
    """Verify /zones correctly marks simulated scenarios when what-if rain is provided."""
    response = client.get("/zones?district=Kamrup%20Metropolitan&rain_7d=250.0&rain_15d=450.0&rain_30d=700.0&simulated=true")
    assert response.status_code == 200
    data = response.json()
    assert data["summary"]["simulated"] is True
    assert data["features"][0]["properties"]["simulated"] is True


def test_single_zone_endpoint():
    """Verify /zones/{zone_id} retrieves individual zone details."""
    zones_resp = client.get("/zones?district=Kamrup%20Metropolitan")
    zone_id = zones_resp.json()["features"][0]["properties"]["zone_id"]

    response = client.get(f"/zones/{zone_id}")
    assert response.status_code == 200
    data = response.json()
    assert data["zone_id"] == zone_id
    assert "risk_score" in data
    assert "physical_features" in data


def test_shelters_endpoint():
    """Verify /shelters endpoint returns shelters with capacity and DEM elevation."""
    response = client.get("/shelters?district=Kamrup%20Metropolitan")
    assert response.status_code == 200
    shelters = response.json()
    assert len(shelters) >= 8

    # Verify first shelter has required fields
    s = shelters[0]
    assert "name" in s
    assert "capacity" in s
    assert "elevation_m" in s
    assert s["elevation_m"] > 0
    assert s["capacity"] > 0
    assert s["status"] in ["Active", "Full", "Inactive"]


def test_sos_endpoints():
    """Verify GET /sos prioritized list and POST /sos submission."""
    # 1. GET existing SOS requests
    get_resp = client.get("/sos")
    assert get_resp.status_code == 200
    sos_list = get_resp.json()
    assert len(sos_list) >= 5
    # Verify sorted by urgency descending
    urgencies = [r["urgency_score"] for r in sos_list]
    assert urgencies == sorted(urgencies, reverse=True)
    assert sos_list[0]["is_simulated"] is True

    # 2. POST new SOS request
    new_sos_payload = {
        "citizen_name": "Test Citizen",
        "phone": "+91-98765-43210",
        "lat": 26.1750,
        "lon": 91.7700,
        "people_count": 4,
        "has_elderly": True,
        "has_infants": False,
        "has_medical_emergency": True,
        "water_depth_level": "Waist",
        "notes": "Elderly person needing urgent medicine",
        "is_simulated": True
    }
    post_resp = client.post("/sos", json=new_sos_payload)
    assert post_resp.status_code == 201
    created = post_resp.json()
    assert created["citizen_name"] == "Test Citizen"
    assert created["urgency_score"] >= 80.0
    assert created["status"] == "Pending"
    assert created["is_simulated"] is True


def test_model_metrics_endpoint():
    """Verify /model/metrics returns real measured metrics."""
    response = client.get("/model/metrics")
    assert response.status_code == 200
    data = response.json()
    assert data["base_model"] == "Random Forest"
    assert "metrics" in data
    assert data["metrics"]["roc_auc"] > 0.70


if __name__ == "__main__":
    import pytest
    pytest.main(["-v", "backend/test_api.py"])
