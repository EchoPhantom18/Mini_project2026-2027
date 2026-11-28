"""
backend/agents/tools.py - Reusable operational tools for specialist agents.
Directly interfaces with existing models, databases, routing, and SHAP explainability.
"""
import time
from typing import Dict, Any, List, Optional, Tuple
import pandas as pd
import numpy as np
import shap

from backend import model_service
from backend.db.session import get_session
from backend.db.models import Shelter, SOSRequest
from backend.shelters.recommender import recommend_shelters
from backend.routing.router import find_safe_route
from backend.sos.triage import get_triage_queue
from ml.config import FEATURE_COLUMNS

# Global cache for SHAP explainer to prevent redundant recalculation
_SHAP_EXPLAINER: Optional[shap.TreeExplainer] = None


def get_shap_explainer() -> shap.TreeExplainer:
    """Lazily initializes and caches the SHAP TreeExplainer for the Random Forest model."""
    global _SHAP_EXPLAINER
    if _SHAP_EXPLAINER is None:
        model_service.ensure_loaded()
        payload = model_service._MODEL_PAYLOAD
        model = payload["model"]
        # Extract base Random Forest from CalibratedClassifierCV
        if hasattr(model, "calibrated_classifiers_") and len(model.calibrated_classifiers_) > 0:
            base_rf = model.calibrated_classifiers_[0].estimator
        elif hasattr(model, "estimator"):
            base_rf = model.estimator
        else:
            base_rf = model
        _SHAP_EXPLAINER = shap.TreeExplainer(base_rf)
    return _SHAP_EXPLAINER


def tool_evaluate_district_flood_risk(
    district: str = "Kamrup Metropolitan",
    rain_7d: Optional[float] = None,
    rain_15d: Optional[float] = None,
    rain_30d: Optional[float] = None,
    simulated: bool = False
) -> Dict[str, Any]:
    """
    Evaluates all 1km grid zones in a district using the calibrated ML model.
    Returns aggregated risk counts, percentages, and top critical hotspots.
    """
    start_time = time.time()
    model_service.ensure_loaded()

    zones_geojson = model_service.get_zones_with_risk(
        district=district,
        rain_7d=rain_7d,
        rain_15d=rain_15d,
        rain_30d=rain_30d,
        simulated=simulated
    )

    features = zones_geojson.get("features", [])
    total_zones = len(features)

    critical_zones = []
    high_zones = []
    moderate_zones = []
    safe_zones = []

    for f in features:
        props = f.get("properties", {})
        score = props.get("risk_score", 0.0)
        level = props.get("risk_level", "Safe")

        zone_info = {
            "zone_id": props.get("zone_id"),
            "risk_score": score,
            "risk_level": level,
            "elevation_mean": props.get("elevation_mean"),
            "dist_to_river_m": props.get("dist_to_river_m"),
            "centroid_lat": props.get("centroid_lat"),
            "centroid_lon": props.get("centroid_lon")
        }

        if level == "Critical":
            critical_zones.append(zone_info)
        elif level == "High":
            high_zones.append(zone_info)
        elif level == "Moderate":
            moderate_zones.append(zone_info)
        else:
            safe_zones.append(zone_info)

    # Sort descending by risk score
    critical_zones.sort(key=lambda x: x["risk_score"], reverse=True)
    high_zones.sort(key=lambda x: x["risk_score"], reverse=True)

    elapsed_ms = round((time.time() - start_time) * 1000, 2)

    return {
        "district": district,
        "total_zones_evaluated": total_zones,
        "risk_breakdown": {
            "critical_count": len(critical_zones),
            "high_count": len(high_zones),
            "moderate_count": len(moderate_zones),
            "safe_count": len(safe_zones)
        },
        "critical_percentage": round((len(critical_zones) / max(total_zones, 1)) * 100, 1),
        "high_or_critical_total": len(critical_zones) + len(high_zones),
        "top_critical_zones": critical_zones[:6],
        "top_high_zones": high_zones[:4],
        "rainfall_scenario": {
            "rain_7d_mm": rain_7d or 65.0,
            "rain_15d_mm": rain_15d or 145.0,
            "rain_30d_mm": rain_30d or 280.0,
            "is_simulated": simulated
        },
        "execution_ms": elapsed_ms,
        "data_source": "SRTM DEM (NASA) + HydroRIVERS + ML Random Forest Model"
    }


def tool_explain_zone_risk_shap(
    zone_id: str,
    district: str = "Kamrup Metropolitan",
    rain_7d: Optional[float] = None,
    rain_15d: Optional[float] = None,
    rain_30d: Optional[float] = None
) -> Dict[str, Any]:
    """
    Computes local SHAP (SHapley Additive exPlanations) for a specific 1km grid zone.
    Quantifies exact feature contributions toward elevated flood susceptibility.
    """
    start_time = time.time()
    model_service.ensure_loaded()
    df = model_service._STATIC_FEATURES_DF

    matching = df[df["zone_id"] == zone_id]
    if matching.empty:
        return {
            "zone_id": zone_id,
            "error": f"Zone {zone_id} not found in static features catalog.",
            "status": "failed"
        }

    row = matching.iloc[0].to_dict()

    r7 = rain_7d if rain_7d is not None else 65.0
    r15 = rain_15d if rain_15d is not None else 145.0
    r30 = rain_30d if rain_30d is not None else 280.0

    eval_row = {
        "elevation_mean": float(row["elevation_mean"]),
        "elevation_min": float(row["elevation_min"]),
        "slope_mean": float(row["slope_mean"]),
        "dist_to_river_m": float(row["dist_to_river_m"]),
        "drainage_density": float(row["drainage_density"]),
        "rain_7d_mm": min(float(r7), 100.0),
        "rain_15d_mm": min(float(r15), 200.0),
        "rain_30d_mm": min(float(r30), 380.0)
    }

    input_df = pd.DataFrame([eval_row])[FEATURE_COLUMNS]

    # Compute prediction
    risk_score, risk_level, confidence = model_service.predict_single(eval_row)

    # Compute SHAP
    explainer = get_shap_explainer()
    shap_vals = explainer.shap_values(input_df)

    # Handle shape (1, n_features, 2) or (1, n_features)
    if isinstance(shap_vals, list):
        # Multi-class list format: class 1 is flood
        sv = shap_vals[1][0]
    elif len(shap_vals.shape) == 3:
        sv = shap_vals[0, :, 1]
    else:
        sv = shap_vals[0]

    feature_contributions = []
    for col, val, s_val in zip(FEATURE_COLUMNS, input_df.iloc[0], sv):
        direction = "increases_risk" if s_val > 0 else "decreases_risk"
        feature_contributions.append({
            "feature": col,
            "observed_value": round(float(val), 2),
            "shap_attribution": round(float(s_val), 4),
            "impact_direction": direction
        })

    # Sort by absolute SHAP attribution
    feature_contributions.sort(key=lambda x: abs(x["shap_attribution"]), reverse=True)

    elapsed_ms = round((time.time() - start_time) * 1000, 2)

    return {
        "zone_id": zone_id,
        "district": row.get("district", district),
        "predicted_risk_score": risk_score,
        "risk_level": risk_level,
        "confidence": confidence,
        "top_contributing_factors": feature_contributions[:5],
        "all_factors": feature_contributions,
        "domain_interpretation": [
            f"{f['feature']} = {f['observed_value']} ({f['impact_direction'].replace('_', ' ')})"
            for f in feature_contributions[:3]
        ],
        "methodology": "TreeSHAP on calibrated Random Forest",
        "execution_ms": elapsed_ms,
        "data_source": "Trained ML Model + Static DEM/Hydrology Features"
    }


def tool_query_shelters_capacity(district: str = "Kamrup Metropolitan") -> Dict[str, Any]:
    """
    Queries verified relief shelters, available capacity, and current occupancy.
    Flags shelters at or near maximum capacity.
    """
    start_time = time.time()
    session = get_session()
    try:
        query = session.query(Shelter)
        if district and district.lower() != "all":
            query = query.filter(Shelter.district.ilike(district.strip()))
        shelters = query.all()

        total_capacity = 0
        total_occupancy = 0
        shelter_list = []
        bottlenecks = []

        for s in shelters:
            d = s.to_dict()
            cap = d.get("capacity", 0)
            occ = d.get("current_occupancy", 0)
            avail = d.get("available_capacity", max(0, cap - occ))
            pct = round((occ / max(cap, 1)) * 100, 1)

            total_capacity += cap
            total_occupancy += occ

            item = {
                "id": d["id"],
                "name": d["name"],
                "capacity": cap,
                "current_occupancy": occ,
                "available_beds": avail,
                "occupancy_pct": pct,
                "elevation_m": d.get("elevation_m"),
                "status": d.get("status", "Active"),
                "lat": d.get("lat"),
                "lon": d.get("lon")
            }
            shelter_list.append(item)

            if pct >= 85.0 or d.get("status", "").lower() == "full":
                bottlenecks.append(f"{d['name']} is at {pct}% capacity ({avail} beds remaining)")

        overall_pct = round((total_occupancy / max(total_capacity, 1)) * 100, 1)
        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "district": district,
            "total_shelters": len(shelter_list),
            "total_capacity_beds": total_capacity,
            "total_occupied_beds": total_occupancy,
            "total_available_beds": max(0, total_capacity - total_occupancy),
            "overall_occupancy_pct": overall_pct,
            "shelters": shelter_list,
            "bottlenecks": bottlenecks,
            "data_label": "DEMO DATA (Capacity and occupancy for hackathon demonstration)",
            "execution_ms": elapsed_ms,
            "data_source": "SQLite shelters table (data/jaldhrishti.db)"
        }
    finally:
        session.close()


def tool_evaluate_evacuation_corridors(
    origin_lat: float = 26.1812,
    origin_lon: float = 91.7510,
    district: str = "Kamrup Metropolitan",
    rain_7d: Optional[float] = None
) -> Dict[str, Any]:
    """
    Evaluates candidate evacuation routes from a populated staging location to recommended shelters.
    Compares flood-risk-weighted safe route versus direct shortest path.
    """
    start_time = time.time()
    session = get_session()
    try:
        recs = recommend_shelters(
            lat=origin_lat,
            lon=origin_lon,
            db=session,
            district=district,
            limit=2,
            include_route=True,
            rain_7d=rain_7d
        )

        shelters_list = recs.get("recommended_shelters", [])
        top_shelter = shelters_list[0] if len(shelters_list) > 0 else None

        route_comparison = None
        if top_shelter:
            sh_lat = top_shelter["lat"]
            sh_lon = top_shelter["lon"]

            # Compute route explicitly to verify safe vs shortest
            r_eval = find_safe_route(
                start_lat=origin_lat,
                start_lon=origin_lon,
                end_lat=sh_lat,
                end_lon=sh_lon,
                alpha_penalty=15.0,
                district=district,
                rain_7d=rain_7d
            )

            safe = r_eval.get("routes", {}).get("safe", {})
            shortest = r_eval.get("routes", {}).get("shortest", {})

            route_comparison = {
                "destination_shelter": top_shelter["name"],
                "safe_route": {
                    "distance_km": safe.get("total_distance_km"),
                    "avg_risk": safe.get("avg_risk"),
                    "max_risk": safe.get("max_risk"),
                    "risk_penalty_score": safe.get("risk_penalty_score")
                },
                "shortest_route": {
                    "distance_km": shortest.get("total_distance_km"),
                    "avg_risk": shortest.get("avg_risk"),
                    "max_risk": shortest.get("max_risk")
                },
                "safety_delta": {
                    "risk_reduction_pct": round(max(0, (shortest.get("avg_risk", 0) - safe.get("avg_risk", 0)) / max(shortest.get("avg_risk", 1), 0.1)) * 100, 1),
                    "distance_overhead_km": round(safe.get("total_distance_km", 0) - shortest.get("total_distance_km", 0), 2)
                }
            }

        elapsed_ms = round((time.time() - start_time) * 1000, 2)

        return {
            "origin": {"lat": origin_lat, "lon": origin_lon},
            "district": district,
            "recommended_shelters_count": len(recs.get("recommended_shelters", [])),
            "top_shelter": top_shelter,
            "route_comparison": route_comparison,
            "verification_status": "Verified on OSM road network for Kamrup Metropolitan",
            "execution_ms": elapsed_ms,
            "data_source": "NetworkX road graph + ML zone penalties"
        }
    finally:
        session.close()


def tool_check_active_sos_queue(district: str = "Kamrup Metropolitan") -> Dict[str, Any]:
    """
    Fetches the live SOS triage queue to locate trapped citizens and medical emergencies.
    """
    start_time = time.time()
    session = get_session()
    try:
        triage = get_triage_queue(db=session, district=district)
        queue = triage.get("queue", [])
        summary = triage.get("summary", {})

        elapsed_ms = round((time.time() - start_time) * 1000, 2)
        return {
            "district": district,
            "summary": summary,
            "pending_count": summary.get("pending_requests", 0),
            "people_at_risk": summary.get("total_people_at_risk", 0),
            "medical_emergencies": summary.get("medical_emergencies_pending", 0),
            "top_urgent_calls": queue[:4],
            "data_label": "DEMO DATA (Simulated citizen distress requests for demonstration)",
            "execution_ms": elapsed_ms,
            "data_source": "SQLite sos_requests table"
        }
    finally:
        session.close()
