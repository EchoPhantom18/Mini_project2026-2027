/**
 * frontend/src/api.js - API client for JALDHRISHTI FastAPI Backend.
 */

const API_BASE = "http://127.0.0.1:8000";

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error("Health check failed");
  return res.json();
}

export async function fetchDistricts() {
  const res = await fetch(`${API_BASE}/districts`);
  if (!res.ok) throw new Error("Failed to fetch districts");
  return res.json();
}

export async function fetchZones(district = "Kamrup Metropolitan", rain7d = null, rain15d = null, rain30d = null, simulated = false) {
  const params = new URLSearchParams({ district });
  if (rain7d !== null) params.append("rain_7d", rain7d);
  if (rain15d !== null) params.append("rain_15d", rain15d);
  if (rain30d !== null) params.append("rain_30d", rain30d);
  if (simulated) params.append("simulated", "true");

  const res = await fetch(`${API_BASE}/zones?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load zone risk grid");
  return res.json();
}

export async function fetchSingleZone(zoneId) {
  const res = await fetch(`${API_BASE}/zones/${zoneId}`);
  if (!res.ok) throw new Error(`Failed to load zone ${zoneId}`);
  return res.json();
}

export async function calculateRoute(startLat, startLon, endLat, endLon, alpha = 15.0, rain7d = null, rain15d = null, rain30d = null, simulated = false) {
  const payload = {
    start_lat: parseFloat(startLat),
    start_lon: parseFloat(startLon),
    end_lat: parseFloat(endLat),
    end_lon: parseFloat(endLon),
    alpha_penalty: parseFloat(alpha),
    district: "Kamrup Metropolitan",
    rain_7d: rain7d ? parseFloat(rain7d) : null,
    rain_15d: rain15d ? parseFloat(rain15d) : null,
    rain_30d: rain30d ? parseFloat(rain30d) : null,
    simulated: Boolean(simulated)
  };

  const res = await fetch(`${API_BASE}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to calculate evacuation route");
  }
  return res.json();
}

export async function fetchShelters(district = "Kamrup Metropolitan") {
  const res = await fetch(`${API_BASE}/shelters?district=${encodeURIComponent(district)}`);
  if (!res.ok) throw new Error("Failed to fetch shelters");
  return res.json();
}

export async function recommendShelters(lat, lon, limit = 3, includeRoute = true, rain7d = null, rain15d = null, rain30d = null, simulated = false) {
  const payload = {
    lat: parseFloat(lat),
    lon: parseFloat(lon),
    district: "Kamrup Metropolitan",
    limit: parseInt(limit, 10),
    include_route: Boolean(includeRoute),
    rain_7d: rain7d ? parseFloat(rain7d) : null,
    rain_15d: rain15d ? parseFloat(rain15d) : null,
    rain_30d: rain30d ? parseFloat(rain30d) : null,
    simulated: Boolean(simulated)
  };

  const res = await fetch(`${API_BASE}/shelters/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to recommend shelters");
  }
  return res.json();
}

export async function submitSOS(data) {
  const res = await fetch(`${API_BASE}/sos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...data,
      is_simulated: data.is_simulated !== undefined ? data.is_simulated : false
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to submit distress call");
  }
  return res.json();
}

export async function fetchSOSTriage(status = null, priority = null, district = "Kamrup Metropolitan") {
  const params = new URLSearchParams({ district });
  if (status && status !== "all") params.append("status", status);
  if (priority && priority !== "all") params.append("priority", priority);

  const res = await fetch(`${API_BASE}/sos/triage?${params.toString()}`);
  if (!res.ok) throw new Error("Failed to load SOS triage queue");
  return res.json();
}

export async function updateSOSStatus(id, status, assignedTeam = null, etaMin = null, notes = null) {
  const payload = {
    status,
    assigned_team: assignedTeam,
    estimated_eta_min: etaMin ? parseInt(etaMin, 10) : null,
    notes
  };

  const res = await fetch(`${API_BASE}/sos/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update SOS status");
  }
  return res.json();
}

export async function fetchSimulationPresets() {
  const res = await fetch(`${API_BASE}/simulate/presets`);
  if (!res.ok) throw new Error("Failed to load simulation presets");
  return res.json();
}

export async function runSimulation(rain7d, rain15d, rain30d, scenarioName = "Custom Drill") {
  const payload = {
    scenario_name: scenarioName,
    district: "Kamrup Metropolitan",
    rain_7d_mm: parseFloat(rain7d),
    rain_15d_mm: parseFloat(rain15d),
    rain_30d_mm: parseFloat(rain30d)
  };

  const res = await fetch(`${API_BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Simulation run failed");
  }
  return res.json();
}

export async function fetchModelMetrics() {
  const res = await fetch(`${API_BASE}/model/metrics`);
  if (!res.ok) throw new Error("Failed to load model metrics");
  return res.json();
}

export async function queryMultiAgent(query, district = "Kamrup Metropolitan", rain7d = null, rain15d = null, rain30d = null, simulated = false) {
  const payload = {
    query,
    district,
    rain_7d_mm: rain7d ? parseFloat(rain7d) : null,
    rain_15d_mm: rain15d ? parseFloat(rain15d) : null,
    rain_30d_mm: rain30d ? parseFloat(rain30d) : null,
    simulated: Boolean(simulated)
  };

  const res = await fetch(`${API_BASE}/agents/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Multi-Agent query failed");
  }
  return res.json();
}

export async function fetchAgentsStatus() {
  const res = await fetch(`${API_BASE}/agents/status`);
  if (!res.ok) throw new Error("Failed to fetch agent status");
  return res.json();
}
