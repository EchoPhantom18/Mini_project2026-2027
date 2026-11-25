"""
ml/config.py - Configuration settings for JALDHRISHTI ML pipeline.

Centralizes paths, CRS definitions, grid parameters, and feature definitions.
"""
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"

# Raw Data Subdirectories
DEM_DIR = RAW_DIR / "dem"
RAINFALL_DIR = RAW_DIR / "rainfall"
FLOOD_EXTENT_DIR = RAW_DIR / "flood_extent"
RIVERS_DIR = RAW_DIR / "rivers"
BOUNDARIES_DIR = RAW_DIR / "boundaries"

# Specific File Paths
GADM_SHP_PATH = BOUNDARIES_DIR / "gadm41_IND_2.shp"
DEM_MOSAIC_PATH = DEM_DIR / "assam_dem.tif"
RIVERS_GEOJSON_PATH = RIVERS_DIR / "assam_rivers.geojson"

# Processed Outputs
ZONES_GRID_PATH = PROCESSED_DIR / "assam_1km_grid.geojson"
STATIC_FEATURES_PATH = PROCESSED_DIR / "zone_static_features.csv"
TRAINING_DATA_PATH = PROCESSED_DIR / "zone_features.csv"
MODEL_SAVE_PATH = BASE_DIR / "ml" / "flood_risk_model.joblib"
MODEL_METRICS_PATH = BASE_DIR / "ml" / "model_evaluation_metrics.json"

# Spatial Reference Systems (CRS)
CRS_WGS84 = "EPSG:4326"        # Lat/Lon degrees for GPS / GeoJSON export
CRS_UTM46N = "EPSG:32646"      # UTM Zone 46N (Meters) - optimal projection for Assam metric calculations

# Grid Configuration
GRID_RESOLUTION_M = 1000       # 1 km x 1 km grid cells

# Multi-district Study Area for ML Training
# Includes geographic, hydrological, and topographic diversity:
# - Kamrup Metropolitan: Demo district (Guwahati), urban Brahmaputra floodplain
# - Morigaon: Central Assam, severe flood hazard
# - Barpeta: Lower Assam, chronic riverine flooding
# - Dhemaji: Upper Assam, flash floods / high sediment
# - Dhubri: Western boundary, low-elevation deltaic basin
# - Dima Hasao: Southern Assam, steep hilly terrain (negative control for slope/elevation)
# - Nagaon: Central agricultural floodplain
STUDY_DISTRICTS = [
    "Kamrup Metropolitan",
    "Morigaon",
    "Barpeta",
    "Dhemaji",
    "Dhubri",
    "Dima Hasao",
    "Nagaon",
]

# Flood Labeling Configuration
# Reliable MODIS pixel: clear_views >= 3
CLEAR_VIEWS_THRESHOLD = 3
# Zone is considered flooded if at least 20% of reliable sample points detect water
FLOOD_FRACTION_THRESHOLD = 0.20

# Model Feature Definitions
# STRICT RULE: Use ONLY physical, region-neutral features.
# NO latitude, longitude, or district names as input features to prevent spatial memorization.
FEATURE_COLUMNS = [
    "elevation_mean",       # Mean elevation in meters
    "elevation_min",        # Minimum elevation in meters
    "slope_mean",           # Mean terrain slope in degrees
    "dist_to_river_m",      # Shortest distance to river centerline in meters
    "drainage_density",     # Total river length inside cell / cell area (km/km^2)
    "rain_7d_mm",           # 7-day cumulative rainfall prior to event
    "rain_15d_mm",          # 15-day cumulative rainfall prior to event
    "rain_30d_mm",          # 30-day cumulative rainfall prior to event
]

TARGET_COLUMN = "flooded"
GROUP_COLUMN = "district"   # GroupKFold ensures entire districts are held out during validation

# Risk Score Classification Thresholds (0 - 100 scale)
RISK_LEVELS = {
    "Safe": (0.0, 25.0),
    "Moderate": (25.0, 50.0),
    "High": (50.0, 75.0),
    "Critical": (75.0, 100.0),
}
