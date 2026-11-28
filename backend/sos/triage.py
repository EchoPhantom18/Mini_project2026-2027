"""
backend/sos/triage.py - Citizen Distress Urgency Triage & Rescue Prioritization Engine.
Smart India Hackathon (Team Enigma)

Calculates live multi-factor urgency scores for citizen distress calls:
1. Water Depth Base: Submerged (90), Chest (75), Waist (50), Knee (30), Ankle (15)
2. Vulnerability Boosters: Medical Emergency (+25), Infants (+15), Elderly (+10), Group Size (+1/person up to +10)
3. Environmental Risk Booster: Enclosing 1km zone flood risk (Critical >=75: +15, High >=50: +8)
4. Temporal Escalation: +2 points per elapsed hour waiting without dispatch (up to +15)

Provides:
- Triage priority classification (Critical, High, Moderate, Low)
- Rescue triage priority queue for emergency command center (SDRF / NDRF)
- Nearest active shelter association for each distress call
- Operational state management: Pending -> Dispatched -> Rescued / Cancelled
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple
from sqlalchemy.orm import Session

from backend.db.models import SOSRequest, Shelter
from backend.routing.graph_service import haversine_distance
from backend import model_service


# Base score per water depth level
WATER_DEPTH_BASE = {
    "Submerged": 90.0,
    "Chest": 75.0,
    "Waist": 50.0,
    "Knee": 30.0,
    "Ankle": 15.0
}


def get_priority_level(urgency_score: float) -> str:
    """Categorizes numerical urgency score into operational priority tier."""
    if urgency_score >= 85.0:
        return "Critical"
    elif urgency_score >= 60.0:
        return "High"
    elif urgency_score >= 30.0:
        return "Moderate"
    else:
        return "Low"


def calculate_urgency_score(
    water_depth_level: str,
    has_medical_emergency: bool = False,
    has_infants: bool = False,
    has_elderly: bool = False,
    people_count: int = 1,
    zone_risk_score: float = 0.0,
    created_at: Optional[datetime] = None
) -> float:
    """
    Computes calibrated 0 - 100 urgency score considering physical hazard,
    human vulnerability, surrounding flood risk, and wait time.
    """
    # 1. Base score from water depth
    base = WATER_DEPTH_BASE.get(water_depth_level, 20.0)

    # 2. Human vulnerability boosters
    vuln_bonus = 0.0
    if has_medical_emergency:
        vuln_bonus += 25.0
    if has_infants:
        vuln_bonus += 15.0
    if has_elderly:
        vuln_bonus += 10.0

    # Group size scaling (1 bonus point per person after the first, capped at 10)
    if people_count > 1:
        vuln_bonus += min(10.0, float(people_count - 1))

    # 3. Surrounding zone flood risk booster
    env_bonus = 0.0
    if zone_risk_score >= 75.0:
        env_bonus = 15.0  # Zone is actively inundated with critical flood exposure
    elif zone_risk_score >= 50.0:
        env_bonus = 8.0   # Zone has high flood potential

    # 4. Temporal wait escalation (if request is still pending)
    time_bonus = 0.0
    if created_at is not None:
        now = datetime.now(timezone.utc)
        if created_at.tzinfo is None:
            created_utc = created_at.replace(tzinfo=timezone.utc)
        else:
            created_utc = created_at
        hours_elapsed = max(0.0, (now - created_utc).total_seconds() / 3600.0)
        if hours_elapsed > 1.0:
            time_bonus = min(15.0, (hours_elapsed - 1.0) * 2.0)

    total_score = base + vuln_bonus + env_bonus + time_bonus
    return round(max(0.0, min(100.0, total_score)), 1)


def find_nearest_shelter(
    lat: float,
    lon: float,
    shelters: List[Shelter]
) -> Optional[Dict[str, Any]]:
    """Finds the closest active relief shelter for rescue evacuee transport."""
    if not shelters:
        return None

    best_shelter = None
    min_dist_m = float("inf")

    for s in shelters:
        if s.status.lower() != "active":
            continue
        dist_m = haversine_distance(lat, lon, s.lat, s.lon)
        if dist_m < min_dist_m:
            min_dist_m = dist_m
            best_shelter = s

    if best_shelter is None:
        return None

    return {
        "id": best_shelter.id,
        "name": best_shelter.name,
        "distance_km": round(min_dist_m / 1000.0, 2),
        "available_capacity": max(0, best_shelter.capacity - best_shelter.current_occupancy),
        "contact_phone": best_shelter.contact_phone
    }


def get_triage_queue(
    db: Session,
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    district: str = "Kamrup Metropolitan"
) -> Dict[str, Any]:
    """
    Returns the comprehensive emergency rescue triage queue sorted by urgency score.
    Includes aggregate statistics and nearest evacuation shelter for each distress call.
    """
    # 1. Fetch live zone risk map for the district
    zones_geojson = model_service.get_zones_with_risk(district=district)
    zone_risk_map = {
        feat["properties"]["zone_id"]: feat["properties"]["risk_score"]
        for feat in zones_geojson.get("features", [])
    }

    # 2. Query active shelters for evacuee destination routing
    active_shelters = db.query(Shelter).filter(
        Shelter.district.ilike(district.strip()),
        Shelter.status == "Active"
    ).all()

    # 3. Query SOS requests
    query = db.query(SOSRequest)
    if status_filter and status_filter.lower() != "all":
        query = query.filter(SOSRequest.status.ilike(status_filter.strip()))

    records = query.all()

    # 4. Evaluate each request and compile triage items
    triage_items = []
    total_people_at_risk = 0
    medical_emergencies = 0
    priority_counts = {"Critical": 0, "High": 0, "Moderate": 0, "Low": 0}
    status_counts = {"Pending": 0, "Dispatched": 0, "Rescued": 0, "Cancelled": 0}

    for req in records:
        # Update status counters
        status_counts[req.status] = status_counts.get(req.status, 0) + 1

        # Enclosing zone risk
        z_risk = zone_risk_map.get(req.zone_id, 15.0)

        # Recalculate live urgency score (for simulated demo requests, avoid temporal wait escalation accumulation)
        live_urgency = calculate_urgency_score(
            water_depth_level=req.water_depth_level,
            has_medical_emergency=req.has_medical_emergency,
            has_infants=req.has_infants,
            has_elderly=req.has_elderly,
            people_count=req.people_count,
            zone_risk_score=z_risk if not req.is_simulated else 0.0,
            created_at=req.created_at if not req.is_simulated else None
        )

        p_level = get_priority_level(live_urgency)

        if req.status.lower() == "pending":
            total_people_at_risk += req.people_count
            priority_counts[p_level] = priority_counts.get(p_level, 0) + 1
            if req.has_medical_emergency:
                medical_emergencies += 1

        nearest_s = find_nearest_shelter(req.lat, req.lon, active_shelters)

        item = {
            "id": req.id,
            "citizen_name": req.citizen_name,
            "phone": req.phone,
            "lat": req.lat,
            "lon": req.lon,
            "zone_id": req.zone_id,
            "zone_flood_risk": z_risk,
            "people_count": req.people_count,
            "has_elderly": req.has_elderly,
            "has_infants": req.has_infants,
            "has_medical_emergency": req.has_medical_emergency,
            "water_depth_level": req.water_depth_level,
            "urgency_score": live_urgency,
            "priority_level": p_level,
            "status": req.status,
            "assigned_team": req.assigned_team,
            "estimated_eta_min": req.estimated_eta_min,
            "nearest_shelter": nearest_s,
            "notes": req.notes,
            "is_simulated": req.is_simulated,
            "created_at": req.created_at.isoformat() if req.created_at else None,
            "updated_at": req.updated_at.isoformat() if req.updated_at else None
        }

        # Apply priority filter if requested
        if priority_filter and priority_filter.lower() != "all":
            if p_level.lower() != priority_filter.lower():
                continue

        triage_items.append(item)

    # 5. Sort triage queue: most urgent calls first
    triage_items.sort(key=lambda x: x["urgency_score"], reverse=True)

    # Assign queue positions (1, 2, 3...)
    for queue_pos, it in enumerate(triage_items, start=1):
        it["queue_position"] = queue_pos

    return {
        "district": district,
        "summary": {
            "total_requests": len(records),
            "pending_requests": status_counts.get("Pending", 0),
            "dispatched_requests": status_counts.get("Dispatched", 0),
            "rescued_requests": status_counts.get("Rescued", 0),
            "cancelled_requests": status_counts.get("Cancelled", 0),
            "total_people_at_risk": total_people_at_risk,
            "medical_emergencies_pending": medical_emergencies,
            "priority_breakdown": priority_counts
        },
        "queue": triage_items
    }


def update_rescue_status(
    sos_id: int,
    status: str,
    db: Session,
    assigned_team: Optional[str] = None,
    estimated_eta_min: Optional[int] = None,
    notes: Optional[str] = None
) -> SOSRequest:
    """
    Updates the operational lifecycle status and dispatch team details of an SOS request.
    Allowed statuses: Pending, Dispatched, Rescued, Cancelled.
    """
    valid_statuses = ["Pending", "Dispatched", "Rescued", "Cancelled"]
    matched_status = next((s for s in valid_statuses if s.lower() == status.strip().lower()), None)
    if not matched_status:
        raise ValueError(f"Invalid status '{status}'. Must be one of: {valid_statuses}")

    req = db.query(SOSRequest).filter(SOSRequest.id == sos_id).first()
    if not req:
        raise KeyError(f"SOS distress request ID {sos_id} not found.")

    req.status = matched_status
    if assigned_team is not None:
        req.assigned_team = assigned_team
    if estimated_eta_min is not None:
        req.estimated_eta_min = estimated_eta_min
    if notes is not None:
        req.notes = notes
    req.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(req)
    return req
