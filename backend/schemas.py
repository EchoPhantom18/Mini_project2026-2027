"""
backend/schemas.py - Pydantic Request & Response schemas for JALDHRISHTI API.
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class ZonePredictionRequest(BaseModel):
    """
    Physical, region-neutral input features required for flood risk prediction.
    Strictly forbids spatial coordinates/district identifiers to prevent leakage.
    """
    elevation_mean: float = Field(..., description="Mean elevation of the zone in meters (SRTM DEM)")
    elevation_min: float = Field(..., description="Minimum elevation of the zone in meters")
    slope_mean: float = Field(..., description="Mean terrain slope in degrees")
    dist_to_river_m: float = Field(..., description="Shortest distance to nearest river centerline in meters")
    drainage_density: float = Field(..., description="River length inside cell / cell area (km/km^2)")
    rain_7d_mm: float = Field(..., description="7-day cumulative rainfall prior to prediction in mm")
    rain_15d_mm: float = Field(..., description="15-day cumulative rainfall prior to prediction in mm")
    rain_30d_mm: float = Field(..., description="30-day cumulative rainfall prior to prediction in mm")

    model_config = {
        "json_schema_extra": {
            "example": {
                "elevation_mean": 45.5,
                "elevation_min": 42.0,
                "slope_mean": 0.45,
                "dist_to_river_m": 250.0,
                "drainage_density": 1.25,
                "rain_7d_mm": 120.0,
                "rain_15d_mm": 240.0,
                "rain_30d_mm": 450.0
            }
        }
    }


class ZonePredictionResponse(BaseModel):
    """Prediction output containing the calibrated flood risk score and risk classification."""
    risk_score: float = Field(..., description="Calibrated flood risk probability scaled to 0 - 100")
    risk_level: str = Field(..., description="Classification category: Safe (<25), Moderate (25-50), High (50-75), Critical (75+)")
    confidence: float = Field(..., description="Model confidence score (0.0 to 1.0)")
    input_summary: Dict[str, float] = Field(..., description="Summary of physical features evaluated")
    model_name: str = Field(..., description="Name of the winning model evaluated with GroupKFold")


class BatchPredictionRequest(BaseModel):
    """Batch prediction request for multiple zones."""
    zones: List[ZonePredictionRequest]


class BatchPredictionResponse(BaseModel):
    """Batch prediction response."""
    count: int
    predictions: List[ZonePredictionResponse]


class ZoneFeatureProperties(BaseModel):
    """GeoJSON properties for a 1 km grid zone with dynamic risk evaluation."""
    zone_id: str
    district: str
    elevation_mean: float
    elevation_min: float
    slope_mean: float
    dist_to_river_m: float
    drainage_density: float
    rain_7d_mm: float
    rain_15d_mm: float
    rain_30d_mm: float
    risk_score: float
    risk_level: str
    centroid_lat: float
    centroid_lon: float
    simulated: bool = False


class HealthResponse(BaseModel):
    """API health status and model metadata."""
    status: str
    platform: str
    team: str
    model_loaded: bool
    model_name: str
    feature_columns: List[str]
    total_grid_zones: int
    demo_district: str


# ===========================================================================
# Step 3 Schemas: Shelters and SOS Requests
# ===========================================================================

class ShelterResponse(BaseModel):
    """Emergency relief shelter details."""
    id: int
    name: str
    district: str
    lat: float
    lon: float
    capacity: int
    current_occupancy: int
    available_capacity: int
    elevation_m: float
    status: str
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    zone_id: Optional[str] = None
    is_simulated: bool = False


class SOSCreateRequest(BaseModel):
    """Citizen distress call submission payload."""
    citizen_name: str = Field(..., min_length=2, description="Full name of person requesting assistance")
    phone: str = Field(..., min_length=8, description="Contact phone number")
    lat: float = Field(..., description="GPS Latitude coordinate")
    lon: float = Field(..., description="GPS Longitude coordinate")
    people_count: int = Field(default=1, ge=1, description="Number of individuals needing rescue")
    has_elderly: bool = Field(default=False, description="Presence of elderly individuals")
    has_infants: bool = Field(default=False, description="Presence of infants/young children")
    has_medical_emergency: bool = Field(default=False, description="Life-threatening medical emergency present")
    water_depth_level: str = Field(..., description="Water depth: Ankle, Knee, Waist, Chest, Submerged")
    notes: Optional[str] = Field(default=None, description="Additional distress notes or location details")
    is_simulated: bool = Field(default=True, description="Rule 3: demo SOS submissions must be flagged simulated")


class SOSResponse(BaseModel):
    """Stored SOS rescue request."""
    id: int
    citizen_name: str
    phone: str
    lat: float
    lon: float
    zone_id: Optional[str] = None
    people_count: int
    has_elderly: bool
    has_infants: bool
    has_medical_emergency: bool
    water_depth_level: str
    urgency_score: float
    status: str
    notes: Optional[str] = None
    is_simulated: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ===========================================================================
# Step 4 Schemas: Safe Routing Engine
# ===========================================================================

class RouteRequest(BaseModel):
    """Origin and destination coordinates for evacuation path calculation."""
    start_lat: float = Field(..., ge=20.0, le=30.0, description="Origin GPS Latitude (Assam range 24-28)")
    start_lon: float = Field(..., ge=88.0, le=97.0, description="Origin GPS Longitude (Assam range 89-96)")
    end_lat: float = Field(..., ge=20.0, le=30.0, description="Destination GPS Latitude")
    end_lon: float = Field(..., ge=88.0, le=97.0, description="Destination GPS Longitude")
    alpha_penalty: float = Field(default=15.0, ge=1.0, le=100.0, description="Risk penalty weight multiplier")
    district: str = Field(default="Kamrup Metropolitan", description="Routing district context")
    rain_7d: Optional[float] = Field(default=None, description="Optional what-if 7-day rainfall in mm")
    rain_15d: Optional[float] = Field(default=None, description="Optional what-if 15-day rainfall in mm")
    rain_30d: Optional[float] = Field(default=None, description="Optional what-if 30-day rainfall in mm")
    simulated: bool = Field(default=False, description="Flag indicating if the rainfall scenario is simulated")

    model_config = {
        "json_schema_extra": {
            "example": {
                "start_lat": 26.1445,
                "start_lon": 91.7362,
                "end_lat": 26.1158,
                "end_lon": 91.7086,
                "alpha_penalty": 15.0,
                "district": "Kamrup Metropolitan",
                "simulated": False
            }
        }
    }


class RoutePointInfo(BaseModel):
    """Snapped node metadata for origin or destination."""
    lat: float
    lon: float
    snapped_node: str
    snap_distance_m: float


class RoutePathDetails(BaseModel):
    """Detailed metrics and GeoJSON geometry for a computed route path."""
    nodes_count: int
    total_distance_km: float
    total_distance_m: float
    estimated_time_min: float
    average_risk_score: float
    max_risk_score: float
    flood_exposed_km: float
    flood_exposed_pct: float
    safety_status: str
    geojson: Dict[str, Any]


class RouteSafetyComparison(BaseModel):
    """Comparative analysis between shortest path and flood-safe path."""
    risk_reduction_pct: float
    distance_overhead_km: float
    shortest_path_max_risk: float
    safe_path_max_risk: float
    recommendation: str


class RouteResponse(BaseModel):
    """Comprehensive route response containing shortest vs safe evacuation path."""
    status: str
    start: RoutePointInfo
    destination: RoutePointInfo
    safety_comparison: RouteSafetyComparison
    routes: Dict[str, RoutePathDetails]
    simulated: bool

