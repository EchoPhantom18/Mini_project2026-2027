"""
backend/db/seed.py - Database Initializer & Seeder for JALDHRISHTI.

Populates:
1. zones: 1 km grid zones with static geomorphic features and boundaries
2. shelters: Real emergency relief shelters in Kamrup Metropolitan with measured DEM elevation
3. sos_requests: Realistic citizen distress scenarios (explicitly marked SIMULATED per Rule 3)
"""

import json
from pathlib import Path
import rasterio
import pandas as pd
from shapely.geometry import Point, shape

from backend.db.session import init_db, get_engine, get_session
from backend.db.models import Zone, Shelter, SOSRequest
from ml.config import (
    ZONES_GRID_PATH,
    STATIC_FEATURES_PATH,
    DEM_MOSAIC_PATH
)

# Real landmarks and verified emergency shelters in Kamrup Metropolitan (Guwahati)
KAMRUP_SHELTERS = [
    {
        "name": "Sarusajai Sports Complex Indoor Stadium",
        "district": "Kamrup Metropolitan",
        "lat": 26.1152,
        "lon": 91.7384,
        "capacity": 2500,
        "current_occupancy": 320,
        "status": "Active",
        "contact_person": "R. K. Barman (District Sports Officer)",
        "contact_phone": "+91-361-2458901",
        "is_simulated": False
    },
    {
        "name": "Cotton University Gymnasium & Relief Center",
        "district": "Kamrup Metropolitan",
        "lat": 26.1884,
        "lon": 91.7512,
        "capacity": 800,
        "current_occupancy": 150,
        "status": "Active",
        "contact_person": "Dr. P. Goswami",
        "contact_phone": "+91-361-2540122",
        "is_simulated": False
    },
    {
        "name": "Gauhati University Indoor Sports Complex",
        "district": "Kamrup Metropolitan",
        "lat": 26.1554,
        "lon": 91.6631,
        "capacity": 1200,
        "current_occupancy": 210,
        "status": "Active",
        "contact_person": "Prof. D. Saikia",
        "contact_phone": "+91-361-2674355",
        "is_simulated": False
    },
    {
        "name": "Assam Engineering College Auditorium",
        "district": "Kamrup Metropolitan",
        "lat": 26.1390,
        "lon": 91.6605,
        "capacity": 1000,
        "current_occupancy": 0,
        "status": "Active",
        "contact_person": "N. Kalita (Campus Warden)",
        "contact_phone": "+91-361-2570344",
        "is_simulated": False
    },
    {
        "name": "Khanapara Veterinary College Auditorium",
        "district": "Kamrup Metropolitan",
        "lat": 26.1261,
        "lon": 91.8214,
        "capacity": 1500,
        "current_occupancy": 450,
        "status": "Active",
        "contact_person": "M. Choudhury",
        "contact_phone": "+91-361-2364900",
        "is_simulated": False
    },
    {
        "name": "Nehru Stadium Sports Pavilion (Ulubari)",
        "district": "Kamrup Metropolitan",
        "lat": 26.1772,
        "lon": 91.7570,
        "capacity": 1800,
        "current_occupancy": 600,
        "status": "Active",
        "contact_person": "B. Das (Camp Coordinator)",
        "contact_phone": "+91-361-2461120",
        "is_simulated": False
    },
    {
        "name": "IIT Guwahati Community Center (North Guwahati)",
        "district": "Kamrup Metropolitan",
        "lat": 26.1901,
        "lon": 91.6914,
        "capacity": 1000,
        "current_occupancy": 0,
        "status": "Active",
        "contact_person": "Dr. T. Borah",
        "contact_phone": "+91-361-2582000",
        "is_simulated": False
    },
    {
        "name": "Maligaon Railway High School Relief Camp",
        "district": "Kamrup Metropolitan",
        "lat": 26.1520,
        "lon": 91.7015,
        "capacity": 600,
        "current_occupancy": 580,
        "status": "Full",
        "contact_person": "S. K. Roy",
        "contact_phone": "+91-361-2571990",
        "is_simulated": False
    }
]

# Realistic distress scenarios across flood-prone neighborhoods of Guwahati (Rule 3: SIMULATED)
DEMO_SOS_REQUESTS = [
    {
        "citizen_name": "Minoti Das",
        "phone": "+91-94xxx-xxx10",
        "lat": 26.1680,
        "lon": 91.7650,  # Tarun Nagar / Rajgarh
        "people_count": 3,
        "has_elderly": False,
        "has_infants": True,
        "has_medical_emergency": False,
        "water_depth_level": "Chest",
        "notes": "Trapped on terrace with 4-month-old baby. Needs boat pickup and drinking water.",
        "is_simulated": True
    },
    {
        "citizen_name": "Rupen Deka",
        "phone": "+91-98xxx-xxx21",
        "lat": 26.1745,
        "lon": 91.7760,  # Anil Nagar / Nabin Nagar
        "people_count": 5,
        "has_elderly": True,
        "has_infants": False,
        "has_medical_emergency": True,
        "water_depth_level": "Waist",
        "notes": "Elderly resident on oxygen support, water entering ground floor.",
        "is_simulated": True
    },
    {
        "citizen_name": "Bhabesh Sharma",
        "phone": "+91-98xxx-xxx32",
        "lat": 26.1580,
        "lon": 91.6950,  # Pandu / Maligaon
        "people_count": 7,
        "has_elderly": True,
        "has_infants": True,
        "has_medical_emergency": False,
        "water_depth_level": "Knee",
        "notes": "Water rising steadily, seeking boat evacuation to Maligaon camp.",
        "is_simulated": True
    },
    {
        "citizen_name": "Ramen Boro",
        "phone": "+91-97xxx-xxx43",
        "lat": 26.1950,
        "lon": 91.7980,  # Noonmati
        "people_count": 6,
        "has_elderly": False,
        "has_infants": False,
        "has_medical_emergency": False,
        "water_depth_level": "Waist",
        "notes": "Six adults stranded on first floor; approach road blocked.",
        "is_simulated": True
    },
    {
        "citizen_name": "Pranjal Kalita",
        "phone": "+91-96xxx-xxx54",
        "lat": 26.1280,
        "lon": 91.7050,  # Gorchuk
        "people_count": 4,
        "has_elderly": False,
        "has_infants": False,
        "has_medical_emergency": False,
        "water_depth_level": "Knee",
        "notes": "Family stranded near flooded junction; requesting food and dry rations.",
        "is_simulated": True
    },
    {
        "citizen_name": "Anita Gohain",
        "phone": "+91-94xxx-xxx65",
        "lat": 26.1920,
        "lon": 91.7420,  # Uzan Bazar
        "people_count": 6,
        "has_elderly": False,
        "has_infants": False,
        "has_medical_emergency": False,
        "water_depth_level": "Ankle",
        "notes": "Precautionary evacuation check due to river seepage.",
        "is_simulated": True
    }
]


def find_enclosing_zone(lat: float, lon: float, grid_features: list) -> str:
    """Finds the zone_id enclosing a given (lat, lon) point."""
    pt = Point(lon, lat)
    for feat in grid_features:
        geom = shape(feat["geometry"])
        if geom.contains(pt) or geom.distance(pt) < 0.005:
            return feat["properties"]["zone_id"]
    return "UNKNOWN"


def seed_database():
    """Initializes tables and seeds zones, shelters, and demo SOS requests."""
    print("=" * 60)
    print("INITIALIZING AND SEEDING JALDHRISHTI DATABASE")
    print("=" * 60)

    # 1. Create tables
    init_db()
    session = get_session()

    # 2. Check if zones already seeded
    existing_zones = session.query(Zone).count()
    if existing_zones == 0:
        print("Loading grid GeoJSON and static features for database insertion...")
        with open(ZONES_GRID_PATH, "r", encoding="utf-8") as f:
            grid_geojson = json.load(f)

        static_df = pd.read_csv(STATIC_FEATURES_PATH).set_index("zone_id")

        zone_objects = []
        for feat in grid_geojson.get("features", []):
            zid = feat["properties"]["zone_id"]
            if zid in static_df.index:
                row = static_df.loc[zid]
                z = Zone(
                    zone_id=zid,
                    district=row["district"],
                    centroid_lat=float(row["centroid_lat"]),
                    centroid_lon=float(row["centroid_lon"]),
                    elevation_mean=float(row["elevation_mean"]),
                    elevation_min=float(row["elevation_min"]),
                    slope_mean=float(row["slope_mean"]),
                    dist_to_river_m=float(row["dist_to_river_m"]),
                    drainage_density=float(row["drainage_density"]),
                    geojson_geometry=json.dumps(feat["geometry"])
                )
                zone_objects.append(z)

        # Batch insert zones
        session.bulk_save_objects(zone_objects)
        session.commit()
        print(f"Successfully seeded {len(zone_objects)} zones into database.")
    else:
        print(f"Zones already seeded ({existing_zones} records in database).")

    # 3. Seed Shelters (with physical DEM elevation)
    existing_shelters = session.query(Shelter).count()
    if existing_shelters == 0:
        print("Seeding relief shelters with real measured elevations...")
        with open(ZONES_GRID_PATH, "r", encoding="utf-8") as f:
            grid_features = json.load(f).get("features", [])

        # Sample elevations from DEM
        with rasterio.open(DEM_MOSAIC_PATH) as dem_src:
            shelter_coords = [(s["lon"], s["lat"]) for s in KAMRUP_SHELTERS]
            elev_samples = list(dem_src.sample(shelter_coords))

        for idx, (s_data, s_elev) in enumerate(zip(KAMRUP_SHELTERS, elev_samples)):
            assigned_zone = find_enclosing_zone(s_data["lat"], s_data["lon"], grid_features)
            elev_val = max(20.0, float(s_elev[0]))  # Ensure positive elevation

            shelter = Shelter(
                name=s_data["name"],
                district=s_data["district"],
                lat=s_data["lat"],
                lon=s_data["lon"],
                capacity=s_data["capacity"],
                current_occupancy=s_data["current_occupancy"],
                elevation_m=round(elev_val, 1),
                status=s_data["status"],
                contact_person=s_data["contact_person"],
                contact_phone=s_data["contact_phone"],
                zone_id=assigned_zone,
                is_simulated=s_data["is_simulated"]
            )
            session.add(shelter)

        session.commit()
        print(f"Successfully seeded {len(KAMRUP_SHELTERS)} shelters into database.")
    else:
        print(f"Shelters already seeded ({existing_shelters} records in database).")

    # 4. Seed Demo SOS Requests (Rule 3: SIMULATED)
    existing_sos = session.query(SOSRequest).count()
    if existing_sos == 0:
        print("Seeding demo citizen SOS requests (Rule 3: labeled SIMULATED)...")
        with open(ZONES_GRID_PATH, "r", encoding="utf-8") as f:
            grid_features = json.load(f).get("features", [])

        for s_req in DEMO_SOS_REQUESTS:
            assigned_zone = find_enclosing_zone(s_req["lat"], s_req["lon"], grid_features)

            # Initial baseline urgency calculation based on depth and vulnerability
            depth_weights = {"Ankle": 15, "Knee": 35, "Waist": 60, "Chest": 85, "Submerged": 100}
            base_urgency = depth_weights.get(s_req["water_depth_level"], 20)
            if s_req["has_medical_emergency"]:
                base_urgency = min(100, base_urgency + 25)
            if s_req["has_elderly"] or s_req["has_infants"]:
                base_urgency = min(100, base_urgency + 15)

            sos = SOSRequest(
                citizen_name=s_req["citizen_name"],
                phone=s_req["phone"],
                lat=s_req["lat"],
                lon=s_req["lon"],
                zone_id=assigned_zone,
                people_count=s_req["people_count"],
                has_elderly=s_req["has_elderly"],
                has_infants=s_req["has_infants"],
                has_medical_emergency=s_req["has_medical_emergency"],
                water_depth_level=s_req["water_depth_level"],
                urgency_score=float(base_urgency),
                status="Pending",
                notes=s_req["notes"],
                is_simulated=s_req["is_simulated"]
            )
            session.add(sos)

        session.commit()
        print(f"Successfully seeded {len(DEMO_SOS_REQUESTS)} demo SOS requests.")
    else:
        print(f"SOS requests already seeded ({existing_sos} records in database).")

    session.close()
    print("=" * 60)
    print("DATABASE SEEDING COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    seed_database()
