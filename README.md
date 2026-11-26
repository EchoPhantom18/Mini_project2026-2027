# JALDHRISHTI (जलदृष्टि)

> **AI/ML-Powered Flood Prediction and Safe Evacuation Routing Platform**  
> *Smart India Hackathon (SIH) Prototype — Team Enigma*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python)](https://python.org)
[![scikit-learn](https://img.shields.io/badge/scikit--learn-F7931E.svg?logo=scikitlearn)](https://scikit-learn.org)
[![PostGIS](https://img.shields.io/badge/PostGIS-15--3.3-336791.svg?logo=postgresql)](https://postgis.net)
[![Tests](https://img.shields.io/badge/Tests-52%2F52%20Passing-brightgreen.svg)]()

---

## 📌 Executive Summary

**JALDHRISHTI** is an end-to-end disaster management platform designed for the flood-prone floodplains of Assam, India. It combines calibrated machine learning, satellite remote sensing, hydrological analysis, and risk-weighted graph routing to provide:

1. **Hyperlocal Flood Risk Forecasting**: 0–100 risk score per 1 km × 1 km grid zone (20,464 zones across 7 Assam study districts) based on topography, river proximity, drainage density, and multi-day antecedent rainfall.
2. **Safe Evacuation Routing**: Dynamic Dijkstra/A* routing where road costs penalize flood exposure, steering evacuees away from hazardous routes and automatically detouring around critical submerged roads.
3. **Emergency Shelter Recommendation**: Multi-criteria ranking prioritizing shelters by proximity, live enclosing zone flood safety, SRTM DEM elevation, and available bed capacity.
4. **Citizen SOS Distress Management & Triage**: Authority triage queue ranking distress calls by calculated urgency (water depth, elderly, infants, medical emergencies, zone flood risk) with rescue team dispatch management.

---

## 🛰️ Datasets & Methodology (Strictly Real Data)

All machine learning models are trained exclusively on authentic Earth observation and spatial datasets:
- **NASA SRTM 30m Digital Elevation Model (DEM)**: Terrain elevation, slope, and catchment profiles.
- **HydroSHEDS HydroRIVERS**: River centerline geometries, Euclidean distance to river, and drainage density per grid cell.
- **CHIRPS Daily 0.05° Rainfall**: 7-day, 15-day, and 30-day antecedent cumulative monsoon precipitation.
- **Global Flood Database v1 (MODIS)**: 27 historical flood events (2000–2018) intersecting Assam.
- **Validation**: 5-Fold District-wise `GroupKFold` ensuring models are evaluated on unseen geographic districts.

---

## 🏗️ Architecture & Modules

```
mini_project/
├── backend/
│   ├── main.py              # FastAPI application & REST endpoints
│   ├── model_service.py     # Sub-50ms ML inference engine
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── db/                  # PostgreSQL / PostGIS & SQLite ORM models and seeders
│   ├── routing/             # NetworkX A*/Dijkstra risk-weighted routing engine
│   ├── shelters/            # Multi-criteria shelter ranking engine
│   ├── sos/                 # Urgency scoring, prioritization & dispatch triage
│   ├── simulation/          # What-if scenario modeling & cascade impact engine
│   └── test_*.py            # 52 automated pytest unit & integration tests
├── ml/
│   ├── config.py            # Coordinate reference systems (EPSG:32646), physical features
│   ├── build_features.py    # Spatial feature engineering pipeline
│   ├── train.py             # Random Forest vs XGBoost GroupKFold training & calibration
│   └── flood_risk_model.joblib # Calibrated Random Forest model
├── data/                    # Processed grids, SQLite database, GEE scripts
└── docker-compose.yml       # PostGIS 15 container specification
```

---

## 🚀 Quick Start Guide

### 1. Environment Setup

```bash
# Clone the repository
git clone https://github.com/EchoPhantom18/Mini_project2026-2027.git
cd Mini_project2026-2027

# Install dependencies
pip install fastapi uvicorn pydantic scikit-learn networkx geopandas shapely sqlalchemy pytest
```

### 2. Run the Backend API

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```
Interactive Swagger API documentation will be available at:  
👉 **`http://127.0.0.1:8000/docs`**

### 3. Run Automated Tests

```bash
python -m pytest backend/ -v
```
All **52/52 tests** execute in under 10 seconds.

---

## 📡 Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | System health check and model status |
| `POST` | `/predict` | Predicts 0–100 calibrated flood risk for physical features |
| `GET` | `/zones` | Returns GeoJSON FeatureCollection with live zone risk scores |
| `POST` | `/route` | Computes shortest path vs flood-safe evacuation route |
| `GET` | `/shelters` | Lists relief shelters with live capacity & DEM elevation |
| `GET` | `/shelters/recommend` | Multi-criteria ranking of nearest & safest emergency shelters |
| `POST` | `/sos` | Submits emergency rescue request with urgency scoring |
| `GET` | `/sos/triage` | Ranked priority rescue queue for emergency responders (NDRF/SDRF) |
| `PATCH` | `/sos/{id}/status` | Dispatches rescue unit, sets ETA, and updates operational lifecycle |
| `GET` | `/simulate/presets` | Predefined disaster drill simulation presets |
| `POST` | `/simulate` | Executes what-if flood scenario modeling and cascade impact analysis |
| `GET` | `/model/metrics` | Returns measured GroupKFold validation metrics |

---


