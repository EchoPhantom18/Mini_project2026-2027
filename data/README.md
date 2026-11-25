# JALDHRISHTI — Dataset Reference

> **STRICT RULE**: Every file in `data/raw/` comes from a verified, documented real-world source.
> No synthetic, simulated, or fabricated data is used for training.

---

## 1. Digital Elevation Model (DEM)

| Field | Value |
|---|---|
| **Dataset** | SRTM 1 Arc-Second Global (~30 m native resolution) |
| **Source** | NASA / USGS via AWS Open Data Skadi mirror |
| **Coverage** | Entire State of Assam (38 tiles from lat 24–28°N, lon 89–96°E) |
| **Mosaic File** | `data/raw/dem/assam_dem.tif` (694.5 MB, LZW compressed GeoTIFF) |
| **Derived Features** | `elevation_mean` (mean meters), `elevation_min` (min meters), `slope_mean` (degrees) |

---

## 2. Antecedent Rainfall

| Field | Value |
|---|---|
| **Dataset** | CHIRPS Daily v2.0 (`UCSB-CHG/CHIRPS/DAILY`) |
| **Resolution** | ~5.5 km (0.05°) |
| **Source** | Exported via Google Earth Engine clipped to Assam |
| **Files** | 27 GeoTIFFs in `data/raw/rainfall/` (one per flood event) |
| **Bands** | Band 1: `rain_7d_mm`, Band 2: `rain_15d_mm`, Band 3: `rain_30d_mm` |
| **Units** | Millimeters (cumulative rainfall in the 7, 15, and 30 days before event onset) |

---

## 3. Satellite Flood Extent (Ground Truth Labels)

| Field | Value |
|---|---|
| **Dataset** | Global Flood Database v1 (Tellman et al., 2021, *Nature*) |
| **Sensor** | MODIS (Terra & Aqua), 250 m resolution |
| **Source** | Google Earth Engine (`GLOBAL_FLOOD_DB/MODIS_EVENTS/V1`) |
| **Files** | 27 GeoTIFFs in `data/raw/flood_extent/` (covering 2000–2018 flood events) |
| **Bands** | Band 1: `flood_label` (1 = flooded, 0 = non-flooded)<br>Band 2: `clear_views` (quality assurance count of cloud-free observations) |
| **Quality Filter** | Reliable mask: `clear_views >= 3` and permanent water excluded (`jrc_perm_water == 0`) |

---

## 4. River Network & Drainage

| Field | Value |
|---|---|
| **Dataset** | HydroRIVERS v1.0 (USGS / WWF HydroSHEDS) |
| **Source** | HydroSHEDS Asia vector database |
| **File** | `data/raw/rivers/assam_rivers.geojson` (19,533 clipped river segments) |
| **Derived Features** | `dist_to_river_m` (meters to nearest river), `drainage_density` (km river length / km² cell area) |

---

## 5. Administrative District Boundaries

| Field | Value |
|---|---|
| **Dataset** | GADM v4.1 Level 2 (India Districts) |
| **Source** | https://geodata.ucdavis.edu/gadm/gadm4.1/shp/gadm41_IND_shp.zip |
| **Files** | `data/raw/boundaries/gadm41_IND_2.*` |
| **Study Districts** | Kamrup Metropolitan (demo district), Morigaon, Barpeta, Dhemaji, Dhubri, Dima Hasao, Nagaon |

---

## 6. Processed Feature Outputs

| Output File | Description | Records |
|---|---|---|
| `data/processed/assam_1km_grid.geojson` | 1 km × 1 km grid polygons in UTM46N / WGS84 with zone IDs | 20,464 cells |
| `data/processed/zone_static_features.csv` | Static geomorphic features per zone (elevation, slope, river distance, drainage) | 20,464 rows |
| `data/processed/zone_features.csv` | Complete training dataset pairing each zone with event rainfall and satellite labels | 438,988 rows |
| `ml/flood_risk_model.joblib` | Trained, calibrated classifier pipeline with feature metadata | ~12 MB |
| `ml/model_evaluation_metrics.json` | 5-fold District GroupKFold validation report | JSON |
