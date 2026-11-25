"""
backend/model_service.py - In-memory ML Model Loader & Inference Engine for JALDHRISHTI.

Loads the calibrated Random Forest flood risk model once on startup,
serves single and batch predictions, and pairs 1km grid zones with dynamic risk scores.
"""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import joblib
import numpy as np
import pandas as pd

from ml.config import (
    MODEL_SAVE_PATH,
    MODEL_METRICS_PATH,
    ZONES_GRID_PATH,
    STATIC_FEATURES_PATH,
    FEATURE_COLUMNS
)

# Global in-memory cache
_MODEL_PAYLOAD: Optional[Dict[str, Any]] = None
_GRID_GEOJSON: Optional[Dict[str, Any]] = None
_STATIC_FEATURES_DF: Optional[pd.DataFrame] = None
_METRICS_REPORT: Optional[Dict[str, Any]] = None


def load_model_and_data():
    """Initializes and caches model, static features, and grid GeoJSON in memory."""
    global _MODEL_PAYLOAD, _GRID_GEOJSON, _STATIC_FEATURES_DF, _METRICS_REPORT

    # 1. Load calibrated ML model
    if not MODEL_SAVE_PATH.exists():
        raise FileNotFoundError(f"Trained model not found at {MODEL_SAVE_PATH}. Run 'python -m ml.train' first.")
    _MODEL_PAYLOAD = joblib.load(MODEL_SAVE_PATH)
    print(f"[ModelService] Loaded {_MODEL_PAYLOAD.get('base_model_name', 'model')} from {MODEL_SAVE_PATH}")

    # 2. Load metrics report if present
    if MODEL_METRICS_PATH.exists():
        with open(MODEL_METRICS_PATH, "r") as f:
            _METRICS_REPORT = json.load(f)

    # 3. Load static features
    if not STATIC_FEATURES_PATH.exists():
        raise FileNotFoundError(f"Static features not found at {STATIC_FEATURES_PATH}. Run 'python -m ml.build_features' first.")
    _STATIC_FEATURES_DF = pd.read_csv(STATIC_FEATURES_PATH)
    print(f"[ModelService] Cached static features for {len(_STATIC_FEATURES_DF)} zones")

    # 4. Load 1 km grid GeoJSON
    if not ZONES_GRID_PATH.exists():
        raise FileNotFoundError(f"Grid GeoJSON not found at {ZONES_GRID_PATH}.")
    with open(ZONES_GRID_PATH, "r", encoding="utf-8") as f:
        _GRID_GEOJSON = json.load(f)
    print(f"[ModelService] Cached {len(_GRID_GEOJSON.get('features', []))} GeoJSON grid zones")


def ensure_loaded():
    """Ensures model and static features are loaded into memory."""
    if _MODEL_PAYLOAD is None or _STATIC_FEATURES_DF is None or _GRID_GEOJSON is None:
        load_model_and_data()


def classify_risk(risk_score: float) -> str:
    """
    Classifies a 0-100 risk score into standard operational categories:
    - Safe: < 25
    - Moderate: 25 - 50
    - High: 50 - 75
    - Critical: 75+
    """
    if risk_score < 25.0:
        return "Safe"
    elif risk_score < 50.0:
        return "Moderate"
    elif risk_score < 75.0:
        return "High"
    else:
        return "Critical"


def predict_single(features: Dict[str, float]) -> Tuple[float, str, float]:
    """
    Computes flood risk score for a single set of physical features.
    Returns: (risk_score_0_100, risk_level, confidence)
    """
    ensure_loaded()
    model = _MODEL_PAYLOAD["model"]

    # Wrap in DataFrame with matching feature names to avoid sklearn UserWarning
    input_df = pd.DataFrame([{col: features[col] for col in FEATURE_COLUMNS}])

    # Predict calibrated probability of flood
    prob = float(model.predict_proba(input_df)[0, 1])
    risk_score = round(prob * 100.0, 1)
    risk_level = classify_risk(risk_score)

    # Confidence: distance from decision threshold (0.5) scaled to [0.5, 1.0]
    confidence = round(float(0.5 + abs(prob - 0.5)), 3)

    return risk_score, risk_level, confidence


def get_zones_with_risk(
    district: Optional[str] = "Kamrup Metropolitan",
    rain_7d: Optional[float] = None,
    rain_15d: Optional[float] = None,
    rain_30d: Optional[float] = None,
    simulated: bool = False
) -> Dict[str, Any]:
    """
    Returns a GeoJSON FeatureCollection of 1 km grid zones scored with the ML model.
    If rainfall parameters are not provided, realistic Assam monsoon baselines (CHIRPS mean) are applied.
    """
    ensure_loaded()

    # Default monsoon baseline rainfall (Assam mid-monsoon averages from real CHIRPS data)
    r7 = rain_7d if rain_7d is not None else 65.0
    r15 = rain_15d if rain_15d is not None else 145.0
    r30 = rain_30d if rain_30d is not None else 280.0

    # Filter static features by district
    if district and district.lower() != "all":
        matching_mask = _STATIC_FEATURES_DF["district"].str.lower() == district.strip().lower()
        if not matching_mask.any():
            available = sorted(_STATIC_FEATURES_DF["district"].unique().tolist())
            raise ValueError(f"District '{district}' not found. Available districts: {available}")
        active_df = _STATIC_FEATURES_DF[matching_mask].copy()
    else:
        active_df = _STATIC_FEATURES_DF.copy()

    # Add rainfall features to feature matrix
    active_df["rain_7d_mm"] = r7
    active_df["rain_15d_mm"] = r15
    active_df["rain_30d_mm"] = r30

    # Batch prediction on physical features
    model = _MODEL_PAYLOAD["model"]
    X = active_df[FEATURE_COLUMNS]
    probs = model.predict_proba(X)[:, 1]
    active_df["risk_score"] = np.round(probs * 100.0, 1)
    active_df["risk_level"] = [classify_risk(s) for s in active_df["risk_score"]]

    # Build lookup dictionary: zone_id -> scored attributes
    score_lookup = active_df.set_index("zone_id").to_dict(orient="index")

    # Filter GeoJSON features to matching zones
    filtered_features = []
    for feat in _GRID_GEOJSON.get("features", []):
        zid = feat["properties"]["zone_id"]
        if zid in score_lookup:
            z_data = score_lookup[zid]
            updated_properties = {
                "zone_id": zid,
                "district": z_data["district"],
                "elevation_mean": z_data["elevation_mean"],
                "elevation_min": z_data["elevation_min"],
                "slope_mean": z_data["slope_mean"],
                "dist_to_river_m": z_data["dist_to_river_m"],
                "drainage_density": z_data["drainage_density"],
                "rain_7d_mm": r7,
                "rain_15d_mm": r15,
                "rain_30d_mm": r30,
                "risk_score": z_data["risk_score"],
                "risk_level": z_data["risk_level"],
                "centroid_lat": z_data["centroid_lat"],
                "centroid_lon": z_data["centroid_lon"],
                "simulated": simulated
            }
            filtered_features.append({
                "type": "Feature",
                "geometry": feat["geometry"],
                "properties": updated_properties
            })

    # Summary statistics for the response envelope
    scores = active_df["risk_score"].values
    summary = {
        "total_zones": len(filtered_features),
        "district": district if district else "All",
        "rain_inputs_mm": {"7d": r7, "15d": r15, "30d": r30},
        "risk_breakdown": {
            "Safe": int((active_df["risk_level"] == "Safe").sum()),
            "Moderate": int((active_df["risk_level"] == "Moderate").sum()),
            "High": int((active_df["risk_level"] == "High").sum()),
            "Critical": int((active_df["risk_level"] == "Critical").sum()),
        },
        "mean_risk_score": round(float(scores.mean()), 1) if len(scores) else 0.0,
        "max_risk_score": round(float(scores.max()), 1) if len(scores) else 0.0,
        "simulated": simulated
    }

    return {
        "type": "FeatureCollection",
        "summary": summary,
        "features": filtered_features
    }


def get_single_zone_info(
    zone_id: str,
    rain_7d: Optional[float] = None,
    rain_15d: Optional[float] = None,
    rain_30d: Optional[float] = None,
    simulated: bool = False
) -> Dict[str, Any]:
    """Returns detailed flood risk evaluation for a specific zone_id."""
    ensure_loaded()

    match = _STATIC_FEATURES_DF[_STATIC_FEATURES_DF["zone_id"] == zone_id]
    if match.empty:
        raise ValueError(f"Zone ID '{zone_id}' not found.")

    row = match.iloc[0].to_dict()

    r7 = rain_7d if rain_7d is not None else 65.0
    r15 = rain_15d if rain_15d is not None else 145.0
    r30 = rain_30d if rain_30d is not None else 280.0

    features = {
        "elevation_mean": row["elevation_mean"],
        "elevation_min": row["elevation_min"],
        "slope_mean": row["slope_mean"],
        "dist_to_river_m": row["dist_to_river_m"],
        "drainage_density": row["drainage_density"],
        "rain_7d_mm": r7,
        "rain_15d_mm": r15,
        "rain_30d_mm": r30,
    }

    score, level, conf = predict_single(features)

    return {
        "zone_id": zone_id,
        "district": row["district"],
        "risk_score": score,
        "risk_level": level,
        "confidence": conf,
        "physical_features": features,
        "centroid": {
            "lat": row["centroid_lat"],
            "lon": row["centroid_lon"]
        },
        "model_name": _MODEL_PAYLOAD.get("base_model_name", "Random Forest"),
        "simulated": simulated
    }


def get_model_metadata() -> Dict[str, Any]:
    """Returns model metadata and performance metrics."""
    ensure_loaded()

    return {
        "base_model": _MODEL_PAYLOAD.get("base_model_name", "Random Forest"),
        "features": _MODEL_PAYLOAD.get("feature_columns", FEATURE_COLUMNS),
        "feature_importances": _MODEL_PAYLOAD.get("feature_importances", {}),
        "validation_strategy": "5-fold District GroupKFold",
        "metrics": _METRICS_REPORT.get("comparison", {}).get("random_forest", {}) if _METRICS_REPORT else {}
    }
