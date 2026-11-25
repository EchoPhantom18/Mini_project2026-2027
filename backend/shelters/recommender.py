"""
backend/shelters/recommender.py - Multi-Criteria Emergency Shelter Recommendation Engine.
Smart India Hackathon (Team Enigma)

Recommends optimal relief centers for citizens and authorities by dynamically scoring:
1. Proximity / Haversine distance from citizen GPS location (40% weight)
2. Live flood risk of the shelter's enclosing 1 km zone (30% weight)
3. Physical terrain elevation from SRTM DEM (15% weight - higher ground resilience)
4. Available bed capacity and operational status (15% weight)

Penalizes shelters located in flooded/critical zones or those at full capacity.
Optionally computes the safe evacuation route to the top recommended shelter.
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session

from backend.db.models import Shelter
from backend.routing.graph_service import haversine_distance
from backend import model_service
from backend.routing.router import find_safe_route


# Default multi-criteria weights
WEIGHT_DISTANCE = 0.40
WEIGHT_FLOOD_RISK = 0.30
WEIGHT_ELEVATION = 0.15
WEIGHT_CAPACITY = 0.15

# Physical thresholds for normalization
MIN_ELEVATION_M = 40.0   # Baseline floodplain elevation in Guwahati
MAX_ELEVATION_M = 120.0  # Safe elevated ridge/hilltop in Kamrup
MAX_DISTANCE_KM = 30.0   # Maximum practical evacuation radius
CAPACITY_SATURATION = 500 # Shelters with >= 500 free beds get maximum capacity score


def calculate_shelter_suitability(
    distance_km: float,
    zone_risk: float,
    elevation_m: float,
    available_capacity: int,
    status: str,
    max_search_radius_km: float = MAX_DISTANCE_KM
) -> tuple[float, Optional[str]]:
    """
    Computes a composite suitability score (0 - 100) and safety warning for a shelter.
    Higher score indicates a safer, closer, and more capable shelter.
    """
    # 1. Proximity component (Closer = Higher score)
    norm_dist = max(0.0, 1.0 - (distance_km / max(max_search_radius_km, 1.0)))

    # 2. Zone Safety component (Lower flood risk = Higher safety)
    norm_risk = max(0.0, 1.0 - (zone_risk / 100.0))

    # 3. Terrain Elevation component (Higher ground = More resilient against rising water)
    elev_clamped = max(MIN_ELEVATION_M, min(elevation_m, MAX_ELEVATION_M))
    norm_elev = (elev_clamped - MIN_ELEVATION_M) / (MAX_ELEVATION_M - MIN_ELEVATION_M)

    # 4. Available Capacity component
    if status.lower() == "active" and available_capacity > 0:
        norm_cap = min(1.0, available_capacity / float(CAPACITY_SATURATION))
    else:
        norm_cap = 0.0

    # Base weighted multi-criteria score (0.0 to 100.0)
    composite = 100.0 * (
        WEIGHT_DISTANCE * norm_dist +
        WEIGHT_FLOOD_RISK * norm_risk +
        WEIGHT_ELEVATION * norm_elev +
        WEIGHT_CAPACITY * norm_cap
    )

    # Warnings and penalty adjustments
    warning = None

    if status.lower() == "inactive":
        composite = 0.0
        warning = "Inactive: Shelter is currently closed."
    elif available_capacity <= 0 or status.lower() == "full":
        composite *= 0.40  # 60% penalty if full
        warning = "Full: Shelter has reached maximum capacity."
    elif zone_risk >= 75.0:
        composite *= 0.25  # 75% penalty if situated in critical flood zone
        warning = "Critical Hazard: Enclosing zone is severely flood-inundated."
    elif zone_risk >= 50.0:
        composite *= 0.70  # 30% penalty if in high flood zone
        warning = "Warning: Surrounding zone has high flood exposure."

    score = round(max(0.0, min(100.0, composite)), 1)
    return score, warning


def recommend_shelters(
    lat: float,
    lon: float,
    db: Session,
    district: str = "Kamrup Metropolitan",
    limit: int = 3,
    max_distance_km: float = MAX_DISTANCE_KM,
    include_route: bool = True,
    rain_7d: Optional[float] = None,
    rain_15d: Optional[float] = None,
    rain_30d: Optional[float] = None,
    simulated: bool = False
) -> Dict[str, Any]:
    """
    Evaluates all registered shelters in the district and returns ranked recommendations.
    """
    # 1. Fetch live zone risk scores for the district
    zones_geojson = model_service.get_zones_with_risk(
        district=district,
        rain_7d=rain_7d,
        rain_15d=rain_15d,
        rain_30d=rain_30d,
        simulated=simulated
    )
    zone_risk_map = {
        feat["properties"]["zone_id"]: {
            "risk_score": feat["properties"]["risk_score"],
            "risk_level": feat["properties"]["risk_level"]
        }
        for feat in zones_geojson.get("features", [])
    }

    # 2. Query shelters from database
    query = db.query(Shelter)
    if district and district.lower() != "all":
        query = query.filter(Shelter.district.ilike(district.strip()))
    all_shelters = query.all()

    if not all_shelters:
        return {
            "citizen_location": {"lat": lat, "lon": lon},
            "total_shelters_evaluated": 0,
            "recommended_shelters": [],
            "simulated": simulated
        }

    # 3. Evaluate each shelter against multi-criteria function
    scored_shelters = []
    for s in all_shelters:
        dist_m = haversine_distance(lat, lon, s.lat, s.lon)
        dist_km = round(dist_m / 1000.0, 2)

        # Lookup zone risk
        z_info = zone_risk_map.get(s.zone_id, {"risk_score": 15.0, "risk_level": "Safe"})
        z_risk = z_info["risk_score"]
        z_level = z_info["risk_level"]

        avail_cap = max(0, s.capacity - s.current_occupancy)

        suitability, warning = calculate_shelter_suitability(
            distance_km=dist_km,
            zone_risk=z_risk,
            elevation_m=s.elevation_m,
            available_capacity=avail_cap,
            status=s.status,
            max_search_radius_km=max_distance_km
        )

        scored_shelters.append({
            "id": s.id,
            "name": s.name,
            "district": s.district,
            "lat": s.lat,
            "lon": s.lon,
            "capacity": s.capacity,
            "current_occupancy": s.current_occupancy,
            "available_capacity": avail_cap,
            "elevation_m": round(s.elevation_m, 1),
            "status": s.status,
            "contact_person": s.contact_person,
            "contact_phone": s.contact_phone,
            "zone_id": s.zone_id,
            "zone_risk_score": z_risk,
            "zone_risk_level": z_level,
            "distance_km": dist_km,
            "suitability_score": suitability,
            "safety_warning": warning,
            "is_simulated": s.is_simulated or simulated,
            "route_to_shelter": None
        })

    # 4. Sort shelters by suitability score descending
    scored_shelters.sort(key=lambda x: x["suitability_score"], reverse=True)

    # Filter to radius and top limit
    ranked_shelters = []
    for rank_idx, item in enumerate(scored_shelters[:limit], start=1):
        item["suitability_rank"] = rank_idx
        ranked_shelters.append(item)

    # 5. Optionally compute safe route to the top recommended shelter
    if include_route and ranked_shelters:
        top_shelter = ranked_shelters[0]
        try:
            route_res = find_safe_route(
                start_lat=lat,
                start_lon=lon,
                end_lat=top_shelter["lat"],
                end_lon=top_shelter["lon"],
                district=district,
                rain_7d=rain_7d,
                rain_15d=rain_15d,
                rain_30d=rain_30d,
                simulated=simulated
            )
            top_shelter["route_to_shelter"] = {
                "distance_km": route_res["routes"]["safe"]["total_distance_km"],
                "estimated_time_min": route_res["routes"]["safe"]["estimated_time_min"],
                "safety_status": route_res["routes"]["safe"]["safety_status"],
                "geojson": route_res["routes"]["safe"]["geojson"]
            }
        except Exception as e:
            # If routing snaps to same node or path fails, provide direct line notice
            top_shelter["route_to_shelter"] = {
                "notice": f"Safe path calculation bypassed: {str(e)}"
            }

    return {
        "citizen_location": {"lat": lat, "lon": lon},
        "total_shelters_evaluated": len(all_shelters),
        "recommended_shelters": ranked_shelters,
        "simulated": simulated
    }
