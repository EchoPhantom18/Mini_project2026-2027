"""
backend/simulation/simulator.py - What-If Flood Scenario Simulation Engine.
Smart India Hackathon (Team Enigma)

Enables disaster authorities to evaluate hypothetical monsoon rainfall surges and cloudbursts.
Calculates cascading impacts across:
1. 1 km grid zone flood risk transitions (Safe -> Moderate -> High -> Critical)
2. Road network corridors severed or severely compromised (Risk >= 75)
3. Emergency relief shelters endangered or cut off
4. Citizen distress call urgency escalation

Strictly adheres to project Rule 3: all outputs are tagged "simulated": true.
"""

from typing import Dict, Any, List, Optional
import numpy as np
from sqlalchemy.orm import Session

from backend import model_service
from backend.db.models import Shelter, SOSRequest
from backend.routing.graph_service import graph_service
from backend.routing.router import assign_risk_weights
from backend.sos.triage import calculate_urgency_score, get_priority_level


# Predefined simulation presets for authority drills and SIH hackathon evaluation
SIMULATION_PRESETS = [
    {
        "id": "monsoon_baseline",
        "name": "Monsoon Normal Seasonal Baseline",
        "description": "Historical median monsoon rainfall across the Brahmaputra floodplain.",
        "severity": "Normal",
        "rain_7d_mm": 65.0,
        "rain_15d_mm": 145.0,
        "rain_30d_mm": 280.0
    },
    {
        "id": "heavy_monsoon_surge",
        "name": "Continuous Heavy Monsoon Downpour (+150mm)",
        "description": "Prolonged active monsoon depression triggering widespread waterlogging in low-lying urban catchments.",
        "severity": "Elevated",
        "rain_7d_mm": 180.0,
        "rain_15d_mm": 320.0,
        "rain_30d_mm": 520.0
    },
    {
        "id": "extreme_cloudburst",
        "name": "Kamrup Foothills Flash Cloudburst (+300mm)",
        "description": "Intense localized cloudburst over Meghalaya hills causing sudden runoff into Guwahati drainage channels.",
        "severity": "Severe",
        "rain_7d_mm": 320.0,
        "rain_15d_mm": 480.0,
        "rain_30d_mm": 720.0
    },
    {
        "id": "catastrophic_century_flood",
        "name": "100-Year Brahmaputra River Overflow (+500mm)",
        "description": "Unprecedented catchment saturation with river water exceeding extreme danger marks across Assam.",
        "severity": "Catastrophic",
        "rain_7d_mm": 480.0,
        "rain_15d_mm": 750.0,
        "rain_30d_mm": 1100.0
    }
]


# Key arterial corridors in Guwahati to monitor for flood severance
KEY_CORRIDORS = [
    {"name": "NH-27 Khanapara - Jalukbari Bypass", "nodes": ["NODE_JALUKBARI", "NODE_BORAGAON", "NODE_GARCHUK", "NODE_LOKHRA", "NODE_KHANAPARA"]},
    {"name": "GS Road (Paltan Bazaar - Dispur - Khanapara)", "nodes": ["NODE_PALTAN_BAZAAR", "NODE_ULUBARI", "NODE_BHANGAGARH", "NODE_DISPUR", "NODE_KHANAPARA"]},
    {"name": "Assam Trunk Road (West Guwahati - Bharalumukh)", "nodes": ["NODE_JALUKBARI", "NODE_MALIGAON", "NODE_BHARALUMUKH", "NODE_PALTAN_BAZAAR"]},
    {"name": "Zoo Road / RG Baruah Corridor", "nodes": ["NODE_ZOO_ROAD", "NODE_DISPUR", "NODE_BHANGAGARH"]},
    {"name": "Saraighat Bridge & North Guwahati Link", "nodes": ["NODE_JALUKBARI", "NODE_SARAIGHAT_SOUTH", "NODE_AMINGAON", "NODE_NORTH_GUWAHATI"]}
]


def run_flood_simulation(
    rain_7d_mm: float,
    rain_15d_mm: float,
    rain_30d_mm: float,
    scenario_name: str,
    district: str,
    db: Session,
    baseline_7d: float = 65.0,
    baseline_15d: float = 145.0,
    baseline_30d: float = 280.0
) -> Dict[str, Any]:
    """
    Executes a complete what-if flood simulation:
    Re-scores all district zones, compares with baseline, and tracks road network,
    shelter, and SOS vulnerability impacts.
    """
    # 1. Ensure models and road graph are ready
    model_service.ensure_loaded()
    if graph_service.graph is None:
        graph_service.build_graph(
            model_service._STATIC_FEATURES_DF,
            model_service._GRID_GEOJSON
        )

    # 2. Compute Baseline zone risk
    baseline_geojson = model_service.get_zones_with_risk(
        district=district,
        rain_7d=baseline_7d,
        rain_15d=baseline_15d,
        rain_30d=baseline_30d,
        simulated=False
    )
    base_scores = {
        f["properties"]["zone_id"]: f["properties"]["risk_score"]
        for f in baseline_geojson.get("features", [])
    }
    base_levels = {
        f["properties"]["zone_id"]: f["properties"]["risk_level"]
        for f in baseline_geojson.get("features", [])
    }

    # 3. Compute Simulated zone risk
    sim_geojson = model_service.get_zones_with_risk(
        district=district,
        rain_7d=rain_7d_mm,
        rain_15d=rain_15d_mm,
        rain_30d=rain_30d_mm,
        simulated=True
    )
    sim_scores = {
        f["properties"]["zone_id"]: f["properties"]["risk_score"]
        for f in sim_geojson.get("features", [])
    }
    sim_levels = {
        f["properties"]["zone_id"]: f["properties"]["risk_level"]
        for f in sim_geojson.get("features", [])
    }

    # 4. Zone Transition and Delta Analysis
    deltas = []
    newly_critical_zones = []
    newly_high_risk_zones = []

    for zid, sim_score in sim_scores.items():
        base_score = base_scores.get(zid, sim_score)
        delta = round(sim_score - base_score, 1)
        deltas.append(delta)

        b_lvl = base_levels.get(zid, "Safe")
        s_lvl = sim_levels.get(zid, "Safe")

        if s_lvl == "Critical" and b_lvl != "Critical":
            newly_critical_zones.append(zid)
        elif s_lvl == "High" and b_lvl in ["Safe", "Moderate"]:
            newly_high_risk_zones.append(zid)

    mean_delta = round(float(np.mean(deltas)), 1) if deltas else 0.0
    max_delta = round(float(np.max(deltas)), 1) if deltas else 0.0

    # 5. Road Network Impact Assessment
    G = graph_service.graph.copy()
    assign_risk_weights(G, sim_scores)

    total_edges = G.number_of_edges()
    severed_edges = 0
    caution_edges = 0

    for u, v, data in G.edges(data=True):
        risk = data.get("risk_score", 0.0)
        if risk >= 75.0:
            severed_edges += 1
        elif risk >= 50.0:
            caution_edges += 1

    severed_edge_pct = round((severed_edges / max(total_edges, 1)) * 100.0, 1)

    # Check key corridors
    corridor_impacts = []
    for corridor in KEY_CORRIDORS:
        nodes = corridor["nodes"]
        max_corridor_risk = 0.0
        compromised = False

        for i in range(len(nodes) - 1):
            n1 = nodes[i]
            n2 = nodes[i + 1]
            if G.has_edge(n1, n2):
                e_risk = G[n1][n2].get("risk_score", 15.0)
                if e_risk > max_corridor_risk:
                    max_corridor_risk = e_risk
                if e_risk >= 75.0:
                    compromised = True

        status = "Severed / Impassable" if max_corridor_risk >= 75.0 else ("High Caution" if max_corridor_risk >= 50.0 else "Operational")
        corridor_impacts.append({
            "corridor_name": corridor["name"],
            "status": status,
            "max_risk_score": max_corridor_risk,
            "is_impassable": compromised
        })

    # 6. Shelter Impact Assessment
    shelters = db.query(Shelter).filter(Shelter.district.ilike(district.strip())).all()
    compromised_shelters = []
    total_shelter_capacity = 0
    endangered_shelter_capacity = 0

    for s in shelters:
        total_shelter_capacity += s.capacity
        base_z_risk = base_scores.get(s.zone_id, 15.0)
        sim_z_risk = sim_scores.get(s.zone_id, 15.0)

        if sim_z_risk >= 50.0:
            endangered_shelter_capacity += s.capacity
            compromised_shelters.append({
                "id": s.id,
                "name": s.name,
                "capacity": s.capacity,
                "baseline_zone_risk": base_z_risk,
                "simulated_zone_risk": sim_z_risk,
                "elevation_m": round(s.elevation_m, 1),
                "threat_level": "Critical Inundation Hazard" if sim_z_risk >= 75.0 else "High Flood Water Proximity"
            })

    # 7. SOS Urgency Impact Assessment
    sos_records = db.query(SOSRequest).filter(SOSRequest.status == "Pending").all()
    sos_urgency_increases = 0
    for req in sos_records:
        sim_z_risk = sim_scores.get(req.zone_id, 15.0)
        if sim_z_risk >= 50.0:
            sos_urgency_increases += 1

    return {
        "status": "success",
        "scenario": {
            "scenario_name": scenario_name,
            "district": district,
            "simulated_rainfall_mm": {
                "rain_7d": rain_7d_mm,
                "rain_15d": rain_15d_mm,
                "rain_30d": rain_30d_mm
            },
            "baseline_rainfall_mm": {
                "rain_7d": baseline_7d,
                "rain_15d": baseline_15d,
                "rain_30d": baseline_30d
            }
        },
        "zone_impact": {
            "total_zones_evaluated": len(sim_scores),
            "baseline_summary": baseline_geojson.get("summary", {}).get("risk_breakdown", {}),
            "simulated_summary": sim_geojson.get("summary", {}).get("risk_breakdown", {}),
            "mean_risk_increase": mean_delta,
            "max_risk_increase": max_delta,
            "newly_critical_zones_count": len(newly_critical_zones),
            "newly_high_risk_zones_count": len(newly_high_risk_zones),
            "newly_critical_zone_ids": newly_critical_zones[:10]  # sample
        },
        "road_network_impact": {
            "total_network_edges": total_edges,
            "severed_impassable_edges": severed_edges,
            "severed_edge_pct": severed_edge_pct,
            "caution_edges": caution_edges,
            "monitored_corridors": corridor_impacts
        },
        "shelter_impact": {
            "total_shelters_evaluated": len(shelters),
            "compromised_shelters_count": len(compromised_shelters),
            "endangered_capacity_beds": endangered_shelter_capacity,
            "endangered_capacity_pct": round((endangered_shelter_capacity / max(total_shelter_capacity, 1)) * 100.0, 1),
            "compromised_shelters": compromised_shelters
        },
        "sos_impact": {
            "pending_sos_count": len(sos_records),
            "sos_in_elevated_risk_zones": sos_urgency_increases
        },
        "simulated": True  # Rule 3 requirement strictly maintained
    }
