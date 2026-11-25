"""
backend/routing/router.py - A* and Dijkstra Safe Evacuation Route Engine.

Optimizes evacuation paths by weighting road distances with real-time flood risk scores.
Computes both:
1. Standard shortest distance path (ignoring flood risk)
2. Safe evacuation path (penalizing and bypassing flooded zones)

Cost Function:
  Cost_safe = Length_m * (1.0 + alpha * (Risk / 100)^beta)
  If Risk >= 75 (Critical), Cost_safe = Length_m * 1000.0 (impassable road barrier)
"""

from typing import Dict, Any, List, Tuple, Optional
import networkx as nx
import numpy as np

from backend.routing.graph_service import graph_service, haversine_distance
from backend import model_service


DEFAULT_ALPHA_PENALTY = 15.0  # Weight penalty multiplier for flood risk
DEFAULT_BETA_EXPONENT = 2.0   # Non-linear quadratic penalty for severe flood zones


def get_node_zone_risk(node_id: str, zone_scores: Dict[str, float]) -> float:
    """Returns the flood risk score (0-100) for a given graph node."""
    if node_id.startswith("ZONE_"):
        zid = node_id.replace("ZONE_", "")
        return zone_scores.get(zid, 10.0)
    # If arterial node, check mapped zone or default to moderate baseline
    zid = graph_service.zone_lookup.get(node_id)
    if zid:
        return zone_scores.get(zid, 10.0)
    return 15.0


def assign_risk_weights(
    G: nx.Graph,
    zone_scores: Dict[str, float],
    alpha: float = DEFAULT_ALPHA_PENALTY,
    beta: float = DEFAULT_BETA_EXPONENT
):
    """
    Assigns distance and flood-risk-weighted traversal costs to every edge in the graph.
    """
    for u, v, data in G.edges(data=True):
        length_m = data.get("length_m", 1000.0)

        # Edge risk is the maximum risk between connected nodes
        r_u = get_node_zone_risk(u, zone_scores)
        r_v = get_node_zone_risk(v, zone_scores)
        edge_risk = max(r_u, r_v)
        data["risk_score"] = round(edge_risk, 1)

        # Scaled risk factor [0.0, 1.0]
        r_norm = edge_risk / 100.0

        # Non-linear penalty cost function
        if edge_risk >= 75.0:
            # Critical submerged road barrier
            safe_cost = length_m * 1000.0
        else:
            safe_cost = length_m * (1.0 + alpha * (r_norm ** beta))

        data["safe_cost"] = safe_cost

        # Base travel time in minutes based on road speed
        speed_kmh = data.get("speed_kmh", 40.0)
        speed_mps = speed_kmh / 3.6
        data["travel_time_min"] = (length_m / speed_mps) / 60.0


def extract_path_details(G: nx.Graph, node_path: List[str]) -> Dict[str, Any]:
    """Compiles detailed metrics, risk profile, and GeoJSON geometry for a path."""
    total_distance_m = 0.0
    total_time_min = 0.0
    risk_samples = []
    high_risk_distance_m = 0.0
    coordinates = []

    for i in range(len(node_path) - 1):
        u = node_path[i]
        v = node_path[i + 1]
        edge_data = G.get_edge_data(u, v)

        dist = edge_data.get("length_m", 1000.0)
        risk = edge_data.get("risk_score", 10.0)
        time_min = edge_data.get("travel_time_min", 1.5)

        total_distance_m += dist
        total_time_min += time_min
        risk_samples.append(risk)

        if risk >= 50.0:
            high_risk_distance_m += dist

        # Edge coordinates
        geom = edge_data.get("geometry")
        if geom:
            if not coordinates:
                coordinates.extend(geom)
            else:
                # Avoid duplicate adjacent points
                coordinates.extend(geom[1:])
        else:
            lat1, lon1 = graph_service.node_positions[u]
            lat2, lon2 = graph_service.node_positions[v]
            if not coordinates:
                coordinates.append([lon1, lat1])
            coordinates.append([lon2, lat2])

    avg_risk = float(np.mean(risk_samples)) if risk_samples else 0.0
    max_risk = float(np.max(risk_samples)) if risk_samples else 0.0
    flood_exposed_pct = round((high_risk_distance_m / max(total_distance_m, 1.0)) * 100.0, 1)

    if max_risk < 25.0:
        safety_status = "Optimal Safe Route"
    elif max_risk < 50.0:
        safety_status = "Moderate Caution Advised"
    elif max_risk < 75.0:
        safety_status = "Warning: High Water Zone Traversed"
    else:
        safety_status = "Hazard: Critical Submerged Roads Encountered"

    return {
        "nodes_count": len(node_path),
        "total_distance_km": round(total_distance_m / 1000.0, 2),
        "total_distance_m": round(total_distance_m, 1),
        "estimated_time_min": round(total_time_min, 1),
        "average_risk_score": round(avg_risk, 1),
        "max_risk_score": round(max_risk, 1),
        "flood_exposed_km": round(high_risk_distance_m / 1000.0, 2),
        "flood_exposed_pct": flood_exposed_pct,
        "safety_status": safety_status,
        "geojson": {
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coordinates
            },
            "properties": {
                "distance_km": round(total_distance_m / 1000.0, 2),
                "avg_risk": round(avg_risk, 1),
                "max_risk": round(max_risk, 1),
                "safety_status": safety_status
            }
        }
    }


def find_safe_route(
    start_lat: float,
    start_lon: float,
    end_lat: float,
    end_lon: float,
    alpha_penalty: float = DEFAULT_ALPHA_PENALTY,
    district: str = "Kamrup Metropolitan",
    rain_7d: Optional[float] = None,
    rain_15d: Optional[float] = None,
    rain_30d: Optional[float] = None,
    simulated: bool = False
) -> Dict[str, Any]:
    """
    Computes both shortest path and flood-safe evacuation path between two GPS points.
    Returns comparison metrics and GeoJSON features.
    """
    # 1. Ensure graph is built
    if graph_service.graph is None:
        model_service.ensure_loaded()
        graph_service.build_graph(
            model_service._STATIC_FEATURES_DF,
            model_service._GRID_GEOJSON
        )

    G = graph_service.graph

    # 2. Get current real-time flood risk scores for zones
    zones_geojson = model_service.get_zones_with_risk(
        district=district,
        rain_7d=rain_7d,
        rain_15d=rain_15d,
        rain_30d=rain_30d,
        simulated=simulated
    )
    zone_scores = {
        f["properties"]["zone_id"]: f["properties"]["risk_score"]
        for f in zones_geojson.get("features", [])
    }

    # 3. Update edge weights with current flood risks
    assign_risk_weights(G, zone_scores, alpha=alpha_penalty)

    # 4. Find nearest start and end nodes
    start_node, start_snap_m = graph_service.find_nearest_node(start_lat, start_lon)
    end_node, end_snap_m = graph_service.find_nearest_node(end_lat, end_lon)

    if start_node == end_node:
        raise ValueError("Start and end locations snap to the same graph node. Choose farther points.")

    # 5. Compute Shortest Path (distance only)
    try:
        shortest_nodes = nx.dijkstra_path(G, start_node, end_node, weight="length_m")
        shortest_route = extract_path_details(G, shortest_nodes)
    except nx.NetworkXNoPath:
        raise ValueError(f"No traversable road path found between ({start_lat}, {start_lon}) and ({end_lat}, {end_lon}).")

    # 6. Compute Safe Evacuation Path (risk-penalized edge costs)
    try:
        safe_nodes = nx.dijkstra_path(G, start_node, end_node, weight="safe_cost")
        safe_route = extract_path_details(G, safe_nodes)
    except nx.NetworkXNoPath:
        safe_route = shortest_route  # fallback if all alternative paths are severed

    # 7. Safety Improvement Analysis
    risk_reduction_pct = round(
        max(0.0, (shortest_route["average_risk_score"] - safe_route["average_risk_score"]) / max(shortest_route["average_risk_score"], 0.1) * 100.0),
        1
    )
    distance_overhead_km = round(safe_route["total_distance_km"] - shortest_route["total_distance_km"], 2)

    return {
        "status": "success",
        "start": {"lat": start_lat, "lon": start_lon, "snapped_node": start_node, "snap_distance_m": round(start_snap_m, 1)},
        "destination": {"lat": end_lat, "lon": end_lon, "snapped_node": end_node, "snap_distance_m": round(end_snap_m, 1)},
        "safety_comparison": {
            "risk_reduction_pct": risk_reduction_pct,
            "distance_overhead_km": distance_overhead_km,
            "shortest_path_max_risk": shortest_route["max_risk_score"],
            "safe_path_max_risk": safe_route["max_risk_score"],
            "recommendation": (
                "Take Safe Evacuation Route (Detours around flood hazard areas)"
                if safe_route["max_risk_score"] < shortest_route["max_risk_score"]
                else "Shortest route is currently flood-safe"
            )
        },
        "routes": {
            "shortest": shortest_route,
            "safe": safe_route
        },
        "simulated": simulated
    }
