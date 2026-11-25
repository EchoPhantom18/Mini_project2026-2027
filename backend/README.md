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

### `GET /shelters/recommend` and `POST /shelters/recommend`
Multi-criteria ranking engine recommending optimal relief shelters for evacuees.

**Scoring Criteria:**
- **Proximity (40%)**: Haversine distance from citizen GPS location
- **Zone Safety (30%)**: Live flood risk score of the shelter's enclosing 1 km zone
- **Terrain Elevation (15%)**: Real SRTM DEM elevation (higher ground is safer)
- **Available Capacity (15%)**: Spare bed capacity ($C_{\text{avail}} = \text{Capacity} - \text{Occupancy}$)

**Safety Penalties:**
- Critical flood zone ($R \ge 75$): Slashed by 75% with severe hazard warning.
- Full capacity: Slashed by 60% with full capacity warning.
- Inactive shelter: Score set to 0.

**Query Parameters (GET) / Request Body (POST):**
- `lat`, `lon`: Citizen GPS coordinates (e.g. `26.1445, 91.6631`)
- `district` (default: `"Kamrup Metropolitan"`): Target district
- `limit` (default: `3`): Number of top recommendations
- `max_distance_km` (default: `30.0`): Maximum search radius
- `include_route` (default: `true`): Generates safe evacuation route to top shelter
- `simulated` (default: `false`): Flag for simulated scenario inputs

---

### `GET /sos` and `POST /sos`
- `GET /sos`: Returns citizen distress calls ranked in descending priority by calculated urgency score.
- `POST /sos`: Submits new citizen distress call; calculates calibrated urgency score considering water depth, vulnerability, and surrounding zone flood risk.

---

### `GET /sos/triage`
Authority Command Dashboard endpoint: returns the active rescue triage queue sorted by life-safety urgency score.
- **Urgency Formula**:
  $$\text{Urgency} = \text{Base}(\text{Water Depth}) + \text{Vulnerabilities} + \text{Zone Flood Risk} + \text{Temporal Escalation}$$
  - Water depths: `Submerged` (90), `Chest` (75), `Waist` (50), `Knee` (30), `Ankle` (15)
  - Boosters: Medical Emergency (+25), Infants (+15), Elderly (+10), Group size (+1/person up to +10), Critical Zone (+15)
  - Priority Tiers: **Critical** ($\ge 85$), **High** ($65-84$), **Moderate** ($40-64$), **Low** ($< 40$)
- Includes aggregate statistics: pending requests, people at risk, pending medical emergencies, and priority tier breakdown.
- Automatically links the closest active relief shelter for each distress call to streamline evacuee transfer.

---

### `GET /sos/{id}` and `PATCH /sos/{id}/status`
- `GET /sos/{id}`: Detailed view of a single SOS distress record.
- `PATCH /sos/{id}/status`: Updates rescue operational status (`Pending` $\to$ `Dispatched` $\to$ `Rescued` / `Cancelled`), assigns a rescue team (e.g. `SDRF Unit 4`), and sets estimated arrival time in minutes.

---

### `GET /simulate/presets`
Returns predefined disaster simulation presets for authority drills:
- Monsoon Normal Seasonal Baseline ($65\text{mm} / 145\text{mm} / 280\text{mm}$)
- Continuous Heavy Monsoon Downpour ($180\text{mm} / 320\text{mm} / 520\text{mm}$)
- Kamrup Foothills Flash Cloudburst ($320\text{mm} / 480\text{mm} / 720\text{mm}$)
- 100-Year Brahmaputra River Overflow ($480\text{mm} / 750\text{mm} / 1100\text{mm}$)

---

### `POST /simulate`
Executes dynamic what-if disaster simulation:
- Re-scores 1 km grid zones with hypothetical rainfall parameters
- Detects newly critical zones and mean risk increases
- Assesses road network impact (severed corridors, impassable highways)
- Evaluates shelter compromise and endangered bed capacity
- Strictly flags all simulation outputs with `"simulated": true` per Rule 3

---

### `GET /model/metrics`
Returns measured evaluation metrics from 5-fold District GroupKFold validation (ROC-AUC, Precision, Recall, F1, Brier score, feature importances).

---

## 3. How to Run the Automated Test Suite

```powershell
python -m pytest backend/ -v
```
All 52 tests execute in under 10 seconds.
