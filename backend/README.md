# JALDHRISHTI — FastAPI Backend API Reference

The backend exposes real-time inference and geospatial risk querying for JALDHRISHTI.
It connects the trained machine learning pipeline to the React/Leaflet user interface.

---

## 1. How to Run the Server

From the project root (`c:\mini_project`):

```powershell
# Development server with hot reload
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

Interactive API documentation (Swagger UI) is available at:
👉 **http://127.0.0.1:8000/docs**

---

## 2. API Endpoints

### `GET /health`
Returns system status, loaded model name, input feature list, and total cached grid zones.

**Response:**
```json
{
  "status": "healthy",
  "platform": "JALDHRISHTI",
  "team": "Team Enigma",
  "model_loaded": true,
  "model_name": "Random Forest",
  "feature_columns": [
    "elevation_mean", "elevation_min", "slope_mean",
    "dist_to_river_m", "drainage_density",
    "rain_7d_mm", "rain_15d_mm", "rain_30d_mm"
  ],
  "total_grid_zones": 20464,
  "demo_district": "Kamrup Metropolitan"
}
```

---

### `POST /predict`
Predicts calibrated flood risk score (0–100) for custom physical features.

**Request:**
```json
{
  "elevation_mean": 42.0,
  "elevation_min": 38.0,
  "slope_mean": 0.25,
  "dist_to_river_m": 120.0,
  "drainage_density": 1.5,
  "rain_7d_mm": 180.0,
  "rain_15d_mm": 350.0,
  "rain_30d_mm": 550.0
}
```

**Response:**
```json
{
  "risk_score": 15.6,
  "risk_level": "Safe",
  "confidence": 0.844,
  "input_summary": { ... },
  "model_name": "Random Forest"
}
```

---

### `GET /zones`
Returns a standard **GeoJSON FeatureCollection** of 1 km grid zones with real-time calculated risk scores.
Each zone geometry is ready to render directly on a Leaflet map.

**Query Parameters:**
- `district` (string, default: `"Kamrup Metropolitan"`): Filter to a specific district or `"all"`.
- `rain_7d` (float, optional): Custom 7-day rainfall in mm (uses CHIRPS monsoon baseline if omitted).
- `rain_15d` (float, optional): Custom 15-day rainfall in mm.
- `rain_30d` (float, optional): Custom 30-day rainfall in mm.
- `simulated` (bool, default: `false`): Flags whether scenario inputs are simulated.

**Response:**
```json
{
  "type": "FeatureCollection",
  "summary": {
    "total_zones": 904,
    "district": "Kamrup Metropolitan",
    "rain_inputs_mm": { "7d": 65.0, "15d": 145.0, "30d": 280.0 },
    "risk_breakdown": {
      "Safe": 609,
      "Moderate": 143,
      "High": 152,
      "Critical": 0
    },
    "mean_risk_score": 19.7,
    "max_risk_score": 56.7,
    "simulated": false
  },
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Polygon", "coordinates": [...] },
      "properties": {
        "zone_id": "KAMP_0001",
        "district": "Kamrup Metropolitan",
        "risk_score": 28.4,
        "risk_level": "Moderate",
        "elevation_mean": 45.2,
        "dist_to_river_m": 310.0,
        "centroid_lat": 26.182,
        "centroid_lon": 91.753,
        "simulated": false
      }
    }
  ]
}
```

---

### `GET /zones/{zone_id}`
Retrieves full terrain parameters, centroid GPS coordinates, and current flood risk score for a single zone.

---

### `POST /route` and `GET /route`
Computes both shortest path and flood-safe evacuation path between two GPS coordinates using Dijkstra/A* routing.

**Cost Function:**
$$\text{Cost}_{\text{safe}} = \text{Length}_m \times \left(1 + \alpha \times \left(\frac{\text{Risk}}{100}\right)^\beta\right)$$
- If $\text{Risk} \ge 75$ (Critical submerged road), cost is penalized by $1000\times$ (impassable barrier).

**Request Body (POST) or Query Parameters (GET):**
- `start_lat`, `start_lon`: Origin GPS coordinates (e.g. Jalukbari: `26.1445, 91.6631`)
- `end_lat`, `end_lon`: Destination GPS coordinates (e.g. Khanapara: `26.1158, 91.8210`)
- `alpha_penalty` (float, default: `15.0`): Penalty weight multiplier for flood risk
- `district` (string, default: `"Kamrup Metropolitan"`): Routing district
- `rain_7d`, `rain_15d`, `rain_30d` (float, optional): Dynamic rainfall what-if scenario
- `simulated` (bool, default: `false`): Flag for simulated scenarios

**Response:**
Returns `safety_comparison` metrics (risk reduction percentage, distance overhead, safety recommendations) and GeoJSON LineStrings for both the shortest path and the safe evacuation path.

---

### `GET /shelters`
Returns verified emergency relief shelters with real DEM elevations, capacities, and occupancies.

---

### `GET /sos` and `POST /sos`
- `GET /sos`: Returns citizen distress calls ranked in descending priority by calculated urgency score.
- `POST /sos`: Submits new citizen distress call; calculates urgency score from water depth and vulnerable individuals.

---

### `GET /model/metrics`
Returns measured evaluation metrics from 5-fold District GroupKFold validation (ROC-AUC, Precision, Recall, F1, Brier score, feature importances).

---

## 3. How to Run the Automated Test Suite

```powershell
python -m pytest backend/ -v
```
All 28 tests execute in under 6 seconds.
