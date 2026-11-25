"""
backend/main.py - FastAPI Application for JALDHRISHTI.
Smart India Hackathon (Team Enigma)

Serves:
- /health: System health and model status
- /predict: Single zone real-time flood risk prediction
- /predict/batch: Batch prediction
- /zones: Scored 1km grid zones in GeoJSON format (Kamrup Metropolitan demo district by default)
- /zones/{zone_id}: Detailed zone evaluation
- /shelters: Verified relief shelters with capacity and DEM elevation
- /sos: Citizen distress calls query and submission
- /model/metrics: Real measured ML validation metrics (GroupKFold)
"""

from contextlib import asynccontextmanager
from typing import Optional, List
import os
from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from backend.schemas import (
    ZonePredictionRequest,
    ZonePredictionResponse,
    BatchPredictionRequest,
    BatchPredictionResponse,
    HealthResponse,
    ShelterResponse,
    SOSCreateRequest,
    SOSResponse,
    RouteRequest,
    RouteResponse,
    ShelterRecommendationRequest,
    ShelterRecommendationResponse,
    SOSTriageUpdateRequest,
    SOSTriageResponse,
    SimulationRequest,
    SimulationResponse,
    SimulationPreset
)
from backend import model_service
from backend.routing.router import find_safe_route
from backend.routing.graph_service import graph_service
from backend.shelters.recommender import recommend_shelters
from backend.sos.triage import calculate_urgency_score, get_triage_queue, update_rescue_status
from backend.simulation.simulator import run_flood_simulation, SIMULATION_PRESETS
from backend.db.session import get_db, init_db
from backend.db.models import Shelter, SOSRequest, Zone
from ml.config import STUDY_DISTRICTS, FEATURE_COLUMNS


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load model, cached static features, database, and routing graph on startup."""
    print("[FastAPI] Initializing JALDHRISHTI backend service...")
    try:
        model_service.load_model_and_data()
        init_db()
        graph_service.build_graph(
            model_service._STATIC_FEATURES_DF,
            model_service._GRID_GEOJSON
        )
        print("[FastAPI] Model, database, and routing network initialized successfully.")
    except Exception as e:
        print(f"[FastAPI] Warning: Failed to pre-load services on startup: {e}")
    yield
    print("[FastAPI] Shutting down JALDHRISHTI backend service.")


app = FastAPI(
    title="JALDHRISHTI API",
    description=(
        "AI/ML-Powered Flood Prediction and Safe Evacuation Platform. "
        "SIH Prototype by Team Enigma. Predicts 0-100 flood risk scores per 1 km zone "
        "using calibrated machine learning on real satellite and hydrological data."
    ),
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for React/Vite frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount built React frontend at /dashboard if production build exists
FRONTEND_DIST_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist")
if os.path.exists(FRONTEND_DIST_PATH):
    app.mount("/dashboard", StaticFiles(directory=FRONTEND_DIST_PATH, html=True), name="dashboard")


@app.get("/", tags=["General"])
def root():
    """Welcome endpoint providing platform overview and API links."""
    return {
        "platform": "JALDHRISHTI",
        "tagline": "AI/ML Flood Prediction & Safe Evacuation Platform",
        "team": "Team Enigma (Smart India Hackathon)",
        "version": "1.0.0",
        "docs_url": "/docs",
        "dashboard_ui": "/dashboard",
        "demo_district": "Kamrup Metropolitan (Guwahati)",
        "endpoints": {
            "dashboard": "/dashboard (Interactive React + Leaflet UI)",
            "health": "/health",
            "predict": "/predict (POST)",
            "zones": "/zones?district=Kamrup%20Metropolitan (GET)",
            "route": "/route (GET/POST)",
            "shelters": "/shelters (GET)",
            "shelter_recommendation": "/shelters/recommend (GET/POST)",
            "sos": "/sos (GET/POST)",
            "sos_triage": "/sos/triage (GET)",
            "simulate": "/simulate (POST)",
            "simulation_presets": "/simulate/presets (GET)",
            "districts": "/districts (GET)",
            "metrics": "/model/metrics (GET)"
        }
    }


@app.get("/health", response_model=HealthResponse, tags=["General"])
def health_check():
    """Health check endpoint reporting model status and available zones."""
    try:
        model_service.ensure_loaded()
        is_loaded = model_service._MODEL_PAYLOAD is not None
        model_name = model_service._MODEL_PAYLOAD.get("base_model_name", "Random Forest")
        total_zones = len(model_service._STATIC_FEATURES_DF)
        status = "healthy"
    except Exception:
        is_loaded = False
        model_name = "Unavailable"
        total_zones = 0
        status = "degraded"

    return HealthResponse(
        status=status,
        platform="JALDHRISHTI",
        team="Team Enigma",
        model_loaded=is_loaded,
        model_name=model_name,
        feature_columns=FEATURE_COLUMNS,
        total_grid_zones=total_zones,
        demo_district="Kamrup Metropolitan"
    )


@app.get("/districts", tags=["Spatial Data"])
def get_available_districts():
    """Returns the list of study districts available in the system."""
    return {
        "count": len(STUDY_DISTRICTS),
        "demo_district": "Kamrup Metropolitan",
        "districts": STUDY_DISTRICTS
    }


@app.post("/predict", response_model=ZonePredictionResponse, tags=["Inference"])
def predict_zone_risk(request: ZonePredictionRequest):
    """
    Predicts calibrated flood risk score (0-100) for a given set of physical features.
    Strictly uses region-neutral physical variables (elevation, slope, river proximity, rainfall).
    """
    try:
        features_dict = request.model_dump()
        score, level, confidence = model_service.predict_single(features_dict)
        model_name = model_service._MODEL_PAYLOAD.get("base_model_name", "Random Forest")

        return ZonePredictionResponse(
            risk_score=score,
            risk_level=level,
            confidence=confidence,
            input_summary=features_dict,
            model_name=model_name
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")


@app.post("/predict/batch", response_model=BatchPredictionResponse, tags=["Inference"])
def predict_batch_risk(request: BatchPredictionRequest):
    """Batch prediction endpoint for multiple zones simultaneously."""
    try:
        results = []
        for zone_req in request.zones:
            f_dict = zone_req.model_dump()
            score, level, confidence = model_service.predict_single(f_dict)
            results.append(ZonePredictionResponse(
                risk_score=score,
                risk_level=level,
                confidence=confidence,
                input_summary=f_dict,
                model_name=model_service._MODEL_PAYLOAD.get("base_model_name", "Random Forest")
            ))
        return BatchPredictionResponse(count=len(results), predictions=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Batch inference error: {str(e)}")


@app.get("/zones", tags=["Spatial Data"])
def get_risk_zones(
    district: Optional[str] = Query("Kamrup Metropolitan", description="District name or 'all'"),
    rain_7d: Optional[float] = Query(None, description="7-day cumulative rainfall in mm (optional, uses baseline if omitted)"),
    rain_15d: Optional[float] = Query(None, description="15-day cumulative rainfall in mm (optional)"),
    rain_30d: Optional[float] = Query(None, description="30-day cumulative rainfall in mm (optional)"),
    simulated: bool = Query(False, description="Flag indicating if the rainfall scenario is simulated")
):
    """
    Returns a GeoJSON FeatureCollection of 1 km grid zones with real-time ML-predicted risk scores.
    Ideal for direct visualization in Leaflet.js / React map components.
    """
    try:
        geojson = model_service.get_zones_with_risk(
            district=district,
            rain_7d=rain_7d,
            rain_15d=rain_15d,
            rain_30d=rain_30d,
            simulated=simulated
        )
        return JSONResponse(content=geojson)
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error computing zone risk scores: {str(e)}")


@app.get("/zones/{zone_id}", tags=["Spatial Data"])
def get_single_zone_details(
    zone_id: str,
    rain_7d: Optional[float] = Query(None, description="Optional override 7-day rainfall"),
    rain_15d: Optional[float] = Query(None, description="Optional override 15-day rainfall"),
    rain_30d: Optional[float] = Query(None, description="Optional override 30-day rainfall"),
    simulated: bool = Query(False, description="Simulation flag")
):
    """Returns detailed terrain parameters, coordinates, and calculated risk score for a single zone."""
    try:
        zone_info = model_service.get_single_zone_info(
            zone_id=zone_id,
            rain_7d=rain_7d,
            rain_15d=rain_15d,
            rain_30d=rain_30d,
            simulated=simulated
        )
        return zone_info
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving zone '{zone_id}': {str(e)}")


# ===========================================================================
# Step 3 Endpoints: Shelters and SOS Requests
# ===========================================================================

@app.get("/shelters", response_model=List[ShelterResponse], tags=["Shelters"])
def get_shelters(
    district: Optional[str] = Query("Kamrup Metropolitan", description="Filter by district"),
    status: Optional[str] = Query(None, description="Filter by status: Active, Full, Inactive"),
    db: Session = Depends(get_db)
):
    """
    Returns emergency relief shelters with real measured elevations, capacities, and occupancies.
    """
    query = db.query(Shelter)
    if district and district.lower() != "all":
        query = query.filter(Shelter.district.ilike(district.strip()))
    if status:
        query = query.filter(Shelter.status.ilike(status.strip()))

    shelters = query.all()
    return [s.to_dict() for s in shelters]


@app.get("/shelters/recommend", response_model=ShelterRecommendationResponse, tags=["Shelters"])
def recommend_safe_shelters(
    lat: float = Query(..., ge=20.0, le=30.0, description="Citizen GPS latitude"),
    lon: float = Query(..., ge=88.0, le=97.0, description="Citizen GPS longitude"),
    district: str = Query("Kamrup Metropolitan", description="District context"),
    limit: int = Query(3, ge=1, le=10, description="Number of recommendations"),
    max_distance_km: float = Query(30.0, ge=1.0, le=100.0, description="Search radius in km"),
    include_route: bool = Query(True, description="Whether to include safe evacuation path to top shelter"),
    rain_7d: Optional[float] = Query(None, description="Optional 7-day rainfall scenario"),
    rain_15d: Optional[float] = Query(None, description="Optional 15-day rainfall scenario"),
    rain_30d: Optional[float] = Query(None, description="Optional 30-day rainfall scenario"),
    simulated: bool = Query(False, description="Whether scenario is simulated"),
    db: Session = Depends(get_db)
):
    """
    Evaluates and ranks emergency relief shelters by multi-criteria suitability:
    proximity, enclosing zone flood risk, SRTM DEM elevation, and available bed capacity.
    """
    try:
        recommendations = recommend_shelters(
            lat=lat,
            lon=lon,
            db=db,
            district=district,
            limit=limit,
            max_distance_km=max_distance_km,
            include_route=include_route,
            rain_7d=rain_7d,
            rain_15d=rain_15d,
            rain_30d=rain_30d,
            simulated=simulated
        )
        return recommendations
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recommending shelters: {str(e)}")


@app.post("/shelters/recommend", response_model=ShelterRecommendationResponse, tags=["Shelters"])
def recommend_safe_shelters_post(
    request: ShelterRecommendationRequest,
    db: Session = Depends(get_db)
):
    """
    POST variant for shelter recommendation accepting JSON request payload.
    """
    try:
        recommendations = recommend_shelters(
            lat=request.lat,
            lon=request.lon,
            db=db,
            district=request.district,
            limit=request.limit,
            max_distance_km=request.max_distance_km,
            include_route=request.include_route,
            rain_7d=request.rain_7d,
            rain_15d=request.rain_15d,
            rain_30d=request.rain_30d,
            simulated=request.simulated
        )
        return recommendations
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error recommending shelters: {str(e)}")



@app.get("/sos", response_model=List[SOSResponse], tags=["SOS Management"])
def get_sos_requests(
    status: Optional[str] = Query(None, description="Filter by status: Pending, Dispatched, Rescued, Cancelled"),
    db: Session = Depends(get_db)
):
    """
    Returns citizen SOS distress requests prioritized by urgency score (descending).
    All demo/test records are labeled is_simulated=True per Rule 3.
    """
    query = db.query(SOSRequest)
    if status:
        query = query.filter(SOSRequest.status.ilike(status.strip()))

    # Order by urgency score descending (most urgent first)
    requests = query.order_by(SOSRequest.urgency_score.desc()).all()
    return [r.to_dict() for r in requests]


@app.post("/sos", response_model=SOSResponse, status_code=201, tags=["SOS Management"])
def submit_sos_request(
    request: SOSCreateRequest,
    db: Session = Depends(get_db)
):
    """
    Allows citizens or field volunteers to submit an emergency rescue request.
    Computes calibrated urgency score based on water depth, medical emergency, infants, elderly,
    group size, and enclosing zone flood risk.
    """
    try:
        # 1. Assign enclosing zone if coordinates match our grid
        assigned_zone = None
        zone_risk = 15.0  # Safe default baseline
        if model_service._GRID_GEOJSON is not None:
            from shapely.geometry import Point, shape
            pt = Point(request.lon, request.lat)
            for feat in model_service._GRID_GEOJSON.get("features", []):
                geom = shape(feat["geometry"])
                if geom.contains(pt) or geom.distance(pt) < 0.005:
                    assigned_zone = feat["properties"]["zone_id"]
                    zone_risk = feat["properties"].get("risk_score", 15.0)
                    break

        # 2. Calculate comprehensive urgency score
        urgency = calculate_urgency_score(
            water_depth_level=request.water_depth_level,
            has_medical_emergency=request.has_medical_emergency,
            has_infants=request.has_infants,
            has_elderly=request.has_elderly,
            people_count=request.people_count,
            zone_risk_score=zone_risk
        )

        sos_record = SOSRequest(
            citizen_name=request.citizen_name,
            phone=request.phone,
            lat=request.lat,
            lon=request.lon,
            zone_id=assigned_zone,
            people_count=request.people_count,
            has_elderly=request.has_elderly,
            has_infants=request.has_infants,
            has_medical_emergency=request.has_medical_emergency,
            water_depth_level=request.water_depth_level,
            urgency_score=urgency,
            status="Pending",
            notes=request.notes,
            is_simulated=request.is_simulated  # Explicitly preserve simulation flag
        )
        db.add(sos_record)
        db.commit()
        db.refresh(sos_record)
        return sos_record.to_dict()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to submit SOS request: {str(e)}")


@app.get("/sos/triage", response_model=SOSTriageResponse, tags=["SOS Management"])
def get_sos_triage_dashboard(
    status: Optional[str] = Query(None, description="Filter by status: Pending, Dispatched, Rescued, Cancelled, or all"),
    priority: Optional[str] = Query(None, description="Filter by priority: Critical, High, Moderate, Low, or all"),
    district: str = Query("Kamrup Metropolitan", description="Target district"),
    db: Session = Depends(get_db)
):
    """
    Emergency Authority Command Dashboard endpoint:
    Returns the real-time rescue triage queue sorted by life-safety urgency score.
    Associates each distress call with nearest active shelter for evacuee transport.
    """
    try:
        triage_data = get_triage_queue(
            db=db,
            status_filter=status,
            priority_filter=priority,
            district=district
        )
        return triage_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch triage queue: {str(e)}")


@app.get("/sos/{sos_id}", response_model=SOSResponse, tags=["SOS Management"])
def get_single_sos_request(
    sos_id: int,
    db: Session = Depends(get_db)
):
    """Retrieves details of a specific SOS distress call by ID."""
    req = db.query(SOSRequest).filter(SOSRequest.id == sos_id).first()
    if not req:
        raise HTTPException(status_code=404, detail=f"SOS request #{sos_id} not found.")
    return req.to_dict()


@app.patch("/sos/{sos_id}/status", response_model=SOSResponse, tags=["SOS Management"])
def update_sos_dispatch_status(
    sos_id: int,
    update_data: SOSTriageUpdateRequest,
    db: Session = Depends(get_db)
):
    """
    Updates the operational lifecycle status, assigns a dispatch rescue unit, and sets ETA.
    Permitted statuses: Pending, Dispatched, Rescued, Cancelled.
    """
    try:
        updated_req = update_rescue_status(
            sos_id=sos_id,
            status=update_data.status,
            db=db,
            assigned_team=update_data.assigned_team,
            estimated_eta_min=update_data.estimated_eta_min,
            notes=update_data.notes
        )
        return updated_req.to_dict()
    except KeyError as ke:
        raise HTTPException(status_code=404, detail=str(ke))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update SOS status: {str(e)}")



# ===========================================================================
# Step 4 Endpoints: Safe Evacuation Routing
# ===========================================================================

@app.post("/route", response_model=RouteResponse, tags=["Routing"])
def calculate_evacuation_route(request: RouteRequest):
    """
    Computes both shortest path and flood-safe evacuation path between two GPS coordinates.
    Weight costs penalize roads traversing high-risk flood zones and completely blocks critical zones (risk >= 75).
    """
    try:
        result = find_safe_route(
            start_lat=request.start_lat,
            start_lon=request.start_lon,
            end_lat=request.end_lat,
            end_lon=request.end_lon,
            alpha_penalty=request.alpha_penalty,
            district=request.district,
            rain_7d=request.rain_7d,
            rain_15d=request.rain_15d,
            rain_30d=request.rain_30d,
            simulated=request.simulated
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing calculation error: {str(e)}")


@app.get("/route", response_model=RouteResponse, tags=["Routing"])
def get_evacuation_route(
    start_lat: float = Query(..., ge=20.0, le=30.0, description="Start latitude"),
    start_lon: float = Query(..., ge=88.0, le=97.0, description="Start longitude"),
    end_lat: float = Query(..., ge=20.0, le=30.0, description="Destination latitude"),
    end_lon: float = Query(..., ge=88.0, le=97.0, description="Destination longitude"),
    alpha_penalty: float = Query(15.0, ge=1.0, le=100.0, description="Risk penalty factor"),
    district: str = Query("Kamrup Metropolitan", description="Routing district"),
    rain_7d: Optional[float] = Query(None, description="Optional 7d rainfall"),
    rain_15d: Optional[float] = Query(None, description="Optional 15d rainfall"),
    rain_30d: Optional[float] = Query(None, description="Optional 30d rainfall"),
    simulated: bool = Query(False, description="Simulation flag")
):
    """
    Convenience GET endpoint for calculating evacuation routes directly via URL query parameters.
    """
    try:
        result = find_safe_route(
            start_lat=start_lat,
            start_lon=start_lon,
            end_lat=end_lat,
            end_lon=end_lon,
            alpha_penalty=alpha_penalty,
            district=district,
            rain_7d=rain_7d,
            rain_15d=rain_15d,
            rain_30d=rain_30d,
            simulated=simulated
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing calculation error: {str(e)}")


# ===========================================================================
# Step 7 Endpoints: What-If Flood Scenario Simulation
# ===========================================================================

@app.get("/simulate/presets", response_model=List[SimulationPreset], tags=["Simulation"])
def get_simulation_presets():
    """
    Returns preconfigured what-if disaster simulation presets for authority drills.
    Includes Monsoon Normal, Heavy Monsoon Surge, Extreme Cloudburst, and 100-Year Century Flood.
    """
    return SIMULATION_PRESETS


@app.post("/simulate", response_model=SimulationResponse, tags=["Simulation"])
def execute_flood_simulation(
    request: SimulationRequest,
    db: Session = Depends(get_db)
):
    """
    Executes a dynamic what-if disaster simulation:
    Re-scores all 1 km grid zones with hypothetical rainfall parameters,
    identifies road corridors severed, compromises to relief shelters, and SOS vulnerability shifts.
    Output is strictly tagged 'simulated': true per Rule 3.
    """
    try:
        result = run_flood_simulation(
            rain_7d_mm=request.rain_7d_mm,
            rain_15d_mm=request.rain_15d_mm,
            rain_30d_mm=request.rain_30d_mm,
            scenario_name=request.scenario_name,
            district=request.district,
            db=db,
            baseline_7d=request.baseline_7d,
            baseline_15d=request.baseline_15d,
            baseline_30d=request.baseline_30d
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation execution error: {str(e)}")




@app.get("/model/metrics", tags=["Machine Learning"])
def get_model_evaluation_metrics():
    """
    Returns the real measured validation metrics from 5-fold District GroupKFold.
    Includes Precision, Recall, F1, ROC-AUC, Brier calibration score, and feature importances.
    """
    try:
        metadata = model_service.get_model_metadata()
        return metadata
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading model metrics: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=True)
