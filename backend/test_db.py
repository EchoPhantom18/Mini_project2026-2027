"""
backend/test_db.py - Test suite for JALDHRISHTI Database (Step 3).

Verifies:
1. Zones table structure and data integrity (20,464 zones across 7 districts)
2. Shelters table (capacity, real DEM elevation, status, zone foreign keys)
3. SOS requests table (vulnerability fields, urgency score, Rule 3 SIMULATED flag)
4. Relational integrity between zones, shelters, and SOS requests
"""

import pytest
from backend.db.session import get_session
from backend.db.models import Zone, Shelter, SOSRequest


@pytest.fixture(scope="module")
def db_session():
    """Provides a database session for testing."""
    session = get_session()
    yield session
    session.close()


def test_zones_table_counts(db_session):
    """Verify zones table contains all 20,464 zones across 7 study districts."""
    total_zones = db_session.query(Zone).count()
    assert total_zones == 20464

    # Verify Kamrup Metropolitan demo district
    km_zones = db_session.query(Zone).filter(Zone.district == "Kamrup Metropolitan").count()
    assert km_zones == 904


def test_zones_feature_integrity(db_session):
    """Verify physical features are non-null and within physically realistic bounds."""
    sample_zone = db_session.query(Zone).filter(Zone.district == "Kamrup Metropolitan").first()
    assert sample_zone is not None
    assert sample_zone.elevation_mean > 0
    assert sample_zone.elevation_min > 0
    assert sample_zone.slope_mean >= 0
    assert sample_zone.dist_to_river_m >= 0
    assert sample_zone.drainage_density >= 0
    assert len(sample_zone.geojson_geometry) > 10


def test_shelters_table_integrity(db_session):
    """Verify emergency shelters have positive capacity, status, and physical elevations."""
    shelters = db_session.query(Shelter).all()
    assert len(shelters) >= 8

    for s in shelters:
        assert s.capacity > 0
        assert s.current_occupancy >= 0
        assert s.current_occupancy <= s.capacity
        assert s.elevation_m > 0
        assert s.status in ["Active", "Full", "Inactive"]
        assert s.district == "Kamrup Metropolitan"
        # Foreign key check
        assert s.zone_id is not None
        assert s.zone_id.startswith("KAMP_")


def test_shelters_sarusajai(db_session):
    """Verify Sarusajai Sports Complex record specifics."""
    sarusajai = db_session.query(Shelter).filter(Shelter.name.like("%Sarusajai%")).first()
    assert sarusajai is not None
    assert sarusajai.capacity == 2500
    assert sarusajai.status == "Active"
    assert sarusajai.elevation_m >= 45.0  # Measured from SRTM DEM (~50m)


def test_sos_requests_table_integrity(db_session):
    """Verify citizen distress requests have urgency scores, status, and SIMULATED flags."""
    sos_list = db_session.query(SOSRequest).all()
    assert len(sos_list) >= 5

    for req in sos_list:
        assert req.people_count >= 1
        assert req.water_depth_level in ["Ankle", "Knee", "Waist", "Chest", "Submerged"]
        assert 0.0 <= req.urgency_score <= 100.0
        assert req.status in ["Pending", "Dispatched", "Rescued", "Cancelled"]
        # Rule 3 requirement: All demo/test SOS requests must be labeled SIMULATED
        assert req.is_simulated is True
        assert req.zone_id is not None
        assert req.zone_id.startswith("KAMP_")


def test_sos_vulnerability_ranking(db_session):
    """Verify that requests with medical emergency or chest-deep water have higher urgency."""
    chest_sos = db_session.query(SOSRequest).filter(SOSRequest.water_depth_level == "Chest").first()
    ankle_sos = db_session.query(SOSRequest).filter(SOSRequest.water_depth_level == "Ankle").first()

    assert chest_sos is not None
    assert ankle_sos is not None
    assert chest_sos.urgency_score > ankle_sos.urgency_score


def test_zone_relationships(db_session):
    """Verify SQLAlchemy ORM relationships from Zone to Shelters and SOSRequests."""
    # Find a zone that hosts a shelter
    shelter = db_session.query(Shelter).first()
    parent_zone = db_session.query(Zone).filter(Zone.zone_id == shelter.zone_id).first()
    assert parent_zone is not None
    assert len(parent_zone.shelters) >= 1
    assert parent_zone.shelters[0].name == shelter.name


if __name__ == "__main__":
    pytest.main(["-v", "backend/test_db.py"])
