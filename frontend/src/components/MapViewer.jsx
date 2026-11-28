import React, { useEffect, useRef, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, Circle, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Home, LifeBuoy, Layers, ChevronUp, ChevronDown } from 'lucide-react';

// Fix Leaflet's default icon missing in React bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Shelter Icon (Blue)
const createShelterIcon = (isNearest = false) => {
  return L.divIcon({
    className: 'custom-shelter-marker',
    html: `
      <div style="background-color: ${isNearest ? '#059669' : '#2563eb'}; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 6px rgba(0,0,0,0.25); border: 2px solid white; font-size: 14px;">
        <span>🏠</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18]
  });
};

// User Location Icon ("You are here")
const createUserIcon = () => {
  return L.divIcon({
    className: 'custom-user-marker',
    html: `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
        <div style="background-color: #2563eb; color: white; padding: 3px 8px; border-radius: 999px; font-weight: 700; font-size: 12px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); border: 2px solid white; margin-bottom: 4px;">
          You are here
        </div>
        <div style="width: 16px; height: 16px; border-radius: 50%; background-color: #2563eb; border: 3px solid white; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.25);"></div>
      </div>
    `,
    iconSize: [100, 42],
    iconAnchor: [50, 34],
    popupAnchor: [0, -34]
  });
};

// Mask phone numbers in UI (never show clickable tel: links for SOS placeholders)
function maskPhone(phone) {
  if (!phone) return '+91-98xxx-xxx00';
  if (phone.includes('xxx')) return phone;
  const digits = phone.replace(/\D/g, '');
  const last2 = digits.slice(-2) || '00';
  const prefix2 = digits.length >= 10 ? digits.slice(-10, -8) : '98';
  return `+91-${prefix2}xxx-xxx${last2}`;
}

// Custom SOS Distress Icon (Authority view only) - Clean circle with optional selected highlight
const createSOSIcon = (urgency, isSelected = false) => {
  const isCritical = urgency >= 85;
  const ringStyle = isSelected
    ? 'background-color: #2563eb; border: 3px solid #ffffff; box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.6), 0 4px 10px rgba(0,0,0,0.3); transform: scale(1.25); z-index: 1000;'
    : 'background-color: #dc2626; border: 2px solid white; box-shadow: 0 4px 8px rgba(220, 38, 38, 0.5);';

  return L.divIcon({
    className: `custom-sos-marker ${isSelected ? 'sos-selected' : ''}`,
    html: `
      <div class="${isCritical && !isSelected ? 'pulse-sos' : ''}" style="${ringStyle} color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; transition: all 0.2s;">
        <span>${Math.round(urgency)}</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20]
  });
};

// Cluster icon when multiple SOS markers are close together
const createSOSClusterIcon = (count, maxUrgency, hasSelected = false) => {
  const ringStyle = hasSelected
    ? 'background-color: #2563eb; border: 3px solid #ffffff; box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.6), 0 4px 10px rgba(0,0,0,0.3); transform: scale(1.2); z-index: 1000;'
    : 'background-color: #b91c1c; border: 2px solid white; box-shadow: 0 4px 10px rgba(185, 28, 28, 0.55);';

  return L.divIcon({
    className: `custom-sos-cluster ${hasSelected ? 'cluster-selected' : ''}`,
    html: `
      <div class="${maxUrgency >= 85 && !hasSelected ? 'pulse-sos' : ''}" style="${ringStyle} color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 11px; font-weight: 800; line-height: 1.05; transition: all 0.2s;">
        <span>${count}</span>
        <span style="font-size: 8px; font-weight: 700;">SOS</span>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -22]
  });
};

// Start & Destination Icons
const createPointIcon = (color, label) => {
  return L.divIcon({
    className: 'custom-point-marker',
    html: `
      <div style="background-color: ${color}; color: white; padding: 4px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; display: flex; align-items: center; gap: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white; white-space: nowrap;">
        <span>📍</span>
        <span>${label}</span>
      </div>
    `,
    iconSize: [80, 26],
    iconAnchor: [40, 26],
  });
};

function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      const zoom = center[2] || 15;
      map.setView([center[0], center[1]], zoom, { animate: true });
    }
  }, [center, map]);
  return null;
}

// Auto-zoom to fit all SOS markers on Authority view load
function SOSFitBounds({ markers, enabled }) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (enabled && markers && markers.length > 0 && !hasFittedRef.current) {
      const bounds = L.latLngBounds(markers.map((m) => [m.lat, m.lon]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
      hasFittedRef.current = true;
    }
  }, [enabled, markers, map]);

  return null;
}

function CitizenMapClickHandler({ enabled, onMapClick }) {
  useMapEvents({
    click(e) {
      if (enabled && onMapClick) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

function getSoftAreaColor(riskScore) {
  if (riskScore >= 75) return '#ef4444';
  if (riskScore >= 50) return '#f97316';
  if (riskScore >= 25) return '#f59e0b';
  return '#10b981';
}

export default function MapViewer({
  viewMode = 'citizen',
  zonesGeoJSON,
  shelters,
  recommendedShelters,
  sosRequests,
  routeData,
  routeMode = 'safe',
  userLocation,
  userAreaRisk,
  onMapSelectLocation,
  onSelectZone,
  recenterCoords,
  onSetRouteEnd,
  activeScenario,
  simulationResult,
  mapCompareMode = 'after',
  onSetMapCompareMode,
  onResetScenario,
  selectedSOSId,
  onSelectSOS
}) {
  const defaultCenter = [26.15, 91.75];
  const geoJsonRef = useRef(null);
  const isCitizen = viewMode === 'citizen';
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);

  // In Citizen view, show only the 2 nearest shelters
  const visibleShelters = useMemo(() => {
    if (!isCitizen) return shelters || [];
    if (recommendedShelters && recommendedShelters.length > 0) {
      return recommendedShelters.slice(0, 2);
    }
    if (!shelters || shelters.length === 0) return [];
    const refLat = userLocation?.lat ?? defaultCenter[0];
    const refLon = userLocation?.lon ?? defaultCenter[1];
    return [...shelters]
      .sort((a, b) => {
        const da = (a.lat - refLat) ** 2 + (a.lon - refLon) ** 2;
        const db = (b.lat - refLat) ** 2 + (b.lon - refLon) ** 2;
        return da - db;
      })
      .slice(0, 2);
  }, [isCitizen, shelters, recommendedShelters, userLocation]);

  // Cluster close SOS markers in Authority view to prevent overlapping DEMO badges
  const sosClusters = useMemo(() => {
    if (isCitizen || !sosRequests || sosRequests.length === 0) return [];
    const thresholdDeg = 0.018; // ~2 km clustering radius
    const clusters = [];
    const visited = new Set();

    for (let i = 0; i < sosRequests.length; i++) {
      if (visited.has(i)) continue;
      const seed = sosRequests[i];
      const group = [seed];
      visited.add(i);

      for (let j = i + 1; j < sosRequests.length; j++) {
        if (visited.has(j)) continue;
        const other = sosRequests[j];
        const dist = Math.hypot(seed.lat - other.lat, seed.lon - other.lon);
        if (dist <= thresholdDeg) {
          group.push(other);
          visited.add(j);
        }
      }

      const avgLat = group.reduce((s, x) => s + x.lat, 0) / group.length;
      const avgLon = group.reduce((s, x) => s + x.lon, 0) / group.length;
      clusters.push({
        id: group.map((g) => g.id).join('-'),
        lat: avgLat,
        lon: avgLon,
        items: group
      });
    }
    return clusters;
  }, [isCitizen, sosRequests]);

  // Style function for 1 km grid zones (Authority view only): NO grid lines (outline on hover only)
  const styleZone = (feature) => {
    const risk = feature.properties.risk_score || 0;
    let fillColor = '#10b981';
    let fillOpacity = 0.22;

    if (risk >= 75) {
      fillColor = '#ef4444';
      fillOpacity = 0.55;
    } else if (risk >= 50) {
      fillColor = '#f97316';
      fillOpacity = 0.40;
    } else if (risk >= 25) {
      fillColor = '#f59e0b';
      fillOpacity = 0.28;
    }

    return {
      fillColor,
      stroke: false,
      weight: 0,
      fillOpacity
    };
  };

  // Interactions on each zone polygon (Authority view only): Outline ONLY on hover
  const onEachZone = (feature, layer) => {
    layer.on({
      click: () => {
        onSelectZone && onSelectZone(feature.properties);
      },
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({ stroke: true, weight: 2, color: '#0f172a', fillOpacity: 0.65 });
      },
      mouseout: (e) => {
        if (geoJsonRef.current) {
          geoJsonRef.current.resetStyle(e.target);
        }
      }
    });

    const props = feature.properties;
    layer.bindTooltip(
      `<div class="text-xs font-sans">
        <strong>${props.zone_id}</strong> (${props.district})<br/>
        Risk Score: <b>${props.risk_score}</b> (${props.risk_level})<br/>
        Elev: ${props.elevation_mean?.toFixed(1)}m · Dist to River: ${props.dist_to_river_m?.toFixed(0)}m
      </div>`,
      { sticky: true }
    );
  };

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        minZoom={9}
        maxZoom={18}
        className={`w-full h-full ${isCitizen ? 'cursor-crosshair citizen-muted-map' : 'authority-muted-map'}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Dynamic Map Recenter */}
        {recenterCoords && <MapRecenter center={recenterCoords} />}

        {/* Zoom to fit all SOS markers on initial load in Authority view */}
        <SOSFitBounds markers={sosRequests} enabled={!isCitizen} />

        {/* Citizen tap-on-map handler */}
        <CitizenMapClickHandler enabled={isCitizen} onMapClick={onMapSelectLocation} />

        {/* CITIZEN VIEW: Soft, low-opacity risk color around user's area (no grid lines) */}
        {isCitizen && userLocation && (
          <>
            <Circle
              center={[userLocation.lat, userLocation.lon]}
              radius={900}
              pathOptions={{
                stroke: false,
                fillColor: getSoftAreaColor(userAreaRisk?.risk_score ?? 0),
                fillOpacity: 0.16
              }}
            />
            <Marker
              position={[userLocation.lat, userLocation.lon]}
              icon={createUserIcon()}
            />
          </>
        )}

        {/* AUTHORITY VIEW: Full 1 km Grid Overlay */}
        {!isCitizen && zonesGeoJSON && (
          <GeoJSON
            key={JSON.stringify(zonesGeoJSON.summary || {})}
            ref={geoJsonRef}
            data={zonesGeoJSON}
            style={styleZone}
            onEachFeature={onEachZone}
          />
        )}

        {/* Route Lines: STRICTLY CITIZEN VIEW ONLY (Fix: prevents bleeding onto Authority map) */}
        {isCitizen && routeData && routeData.routes && (
          <>
            {/* Shortest Route */}
            {routeMode === 'shortest' &&
              routeData.routes.shortest &&
              routeData.routes.shortest.geojson && (
                <GeoJSON
                  key={`shortest-${routeData.start.lat}-${routeMode}`}
                  data={routeData.routes.shortest.geojson}
                  style={{
                    color: '#d97706',
                    weight: 5,
                    opacity: 0.9
                  }}
                />
              )}

            {/* Safe Evacuation Route */}
            {routeMode === 'safe' &&
              routeData.routes.safe &&
              routeData.routes.safe.geojson && (
                <GeoJSON
                  key={`safe-${routeData.start.lat}-${routeMode}`}
                  data={routeData.routes.safe.geojson}
                  style={{
                    color: '#059669',
                    weight: 6,
                    opacity: 0.95
                  }}
                />
              )}
          </>
        )}

        {/* Relief Shelters (Citizen: 2 nearest with names & Nearest label; Authority: all) */}
        {visibleShelters.map((shelter, idx) => {
          const isNearest = isCitizen && idx === 0;
          return (
            <Marker
              key={`shelter-${shelter.id}`}
              position={[shelter.lat, shelter.lon]}
              icon={createShelterIcon(isNearest)}
            >
              {isCitizen && (
                <Tooltip
                  permanent
                  direction="top"
                  offset={[0, -18]}
                  className="bg-white text-slate-900 border border-slate-300 shadow-sm rounded-md px-2 py-0.5 text-xs font-semibold"
                >
                  <span>
                    {isNearest ? 'Nearest · ' : ''}
                    {shelter.name}
                  </span>
                </Tooltip>
              )}
              <Popup className="custom-leaflet-popup">
                <div className="p-1 font-sans text-slate-800 text-sm">
                  <div className="flex items-center gap-1.5 font-bold text-base text-blue-700">
                    <Home className="w-4 h-4 shrink-0" />
                    <span>{shelter.name}</span>
                  </div>
                  {isNearest && (
                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold uppercase">
                      Nearest
                    </span>
                  )}
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span>Available space: <b>{shelter.available_capacity} beds</b></span>
                      <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold uppercase">
                        DEMO
                      </span>
                    </div>
                    <div>Status: <span className="font-semibold text-emerald-600">{shelter.status}</span></div>
                    <div>National Emergency: <a href="tel:112" className="text-blue-600 underline font-semibold">112</a></div>
                  </div>
                  {!isCitizen && onSetRouteEnd && (
                    <button
                      onClick={() => onSetRouteEnd(shelter.lat, shelter.lon, shelter.name)}
                      className="mt-2 w-full text-xs py-1 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition"
                    >
                      Evacuate to this Shelter
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* SOS Citizen Distress Pins (Clustered): AUTHORITY VIEW ONLY */}
        {!isCitizen && sosClusters.map((cluster) => {
          if (cluster.items.length === 1) {
            const sos = cluster.items[0];
            const isSelected = selectedSOSId === sos.id;
            return (
              <Marker
                key={`sos-${sos.id}`}
                position={[sos.lat, sos.lon]}
                icon={createSOSIcon(sos.urgency_score, isSelected)}
                eventHandlers={{
                  click: () => onSelectSOS && onSelectSOS(sos.id)
                }}
              >
                <Popup className="custom-leaflet-popup">
                  <div className="p-1 font-sans text-slate-800">
                    <div className="flex items-center justify-between gap-2 border-b pb-1">
                      <div className="flex items-center gap-1.5 font-bold text-sm text-red-700">
                        <LifeBuoy className="w-4 h-4" />
                        <span>SOS Rescue #{sos.id}</span>
                      </div>
                      <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-red-100 text-red-800 border border-red-300">
                        {Math.round(sos.urgency_score)}/100
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs space-y-1">
                      <div>
                        Urgency Score (demo): <b className="text-red-700">{sos.urgency_score}/100</b>{' '}
                        <span className="text-[10px] text-slate-500 font-normal">({sos.priority_level || 'Distress'})</span>
                      </div>
                      <div>Water Level: <b className="text-red-600">{sos.water_depth_level}</b></div>
                      <div>People Trapped: <b>{sos.people_count}</b></div>
                      <div>Citizen: <b>{sos.citizen_name}</b></div>
                      <div>Phone: <span className="font-mono text-slate-700">{maskPhone(sos.phone)}</span></div>
                      {sos.assigned_team && (
                        <div className="text-emerald-700 font-medium">Assigned: {sos.assigned_team}</div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          }

          const maxUrgency = Math.max(...cluster.items.map((x) => x.urgency_score || 0));
          const hasSelected = cluster.items.some((x) => x.id === selectedSOSId);
          return (
            <Marker
              key={`sos-cluster-${cluster.id}`}
              position={[cluster.lat, cluster.lon]}
              icon={createSOSClusterIcon(cluster.items.length, maxUrgency, hasSelected)}
            >
              <Popup className="custom-leaflet-popup">
                <div className="p-1 font-sans text-slate-800 max-w-[260px] space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b pb-1">
                    <span className="font-bold text-sm text-red-700">
                      {cluster.items.length} Nearby SOS Calls
                    </span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {cluster.items.map((sos) => (
                      <div
                        key={sos.id}
                        onClick={() => onSelectSOS && onSelectSOS(sos.id)}
                        className={`text-xs border-b border-slate-200 pb-1.5 last:border-b-0 last:pb-0 cursor-pointer p-1 rounded transition ${
                          selectedSOSId === sos.id ? 'bg-blue-50 border-blue-300' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="font-bold text-slate-900 flex items-center justify-between">
                          <span>#{sos.id} · {sos.citizen_name}</span>
                          <span className="text-red-700 font-mono">({Math.round(sos.urgency_score)})</span>
                        </div>
                        <div className="text-slate-600">
                          Water: <b>{sos.water_depth_level}</b> · People: <b>{sos.people_count}</b>
                        </div>
                        <div className="text-slate-600">
                          Phone: <span className="font-mono">{maskPhone(sos.phone)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* CITIZEN VIEW: Minimal tap hint pill when no location selected yet */}
      {isCitizen && !userLocation && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur border border-slate-300 rounded-full px-4 py-2 shadow-md text-base text-slate-800 font-medium pointer-events-none whitespace-nowrap">
          Tap anywhere on the map to mark your location
        </div>
      )}

      {/* CITIZEN VIEW: Simulated Weather Pill (only when a simulation is active) */}
      {isCitizen && activeScenario?.isSimulated && (
        <div className="absolute top-3 right-3 z-[1000] bg-amber-100 text-amber-900 border border-amber-300 rounded-full px-3 py-1 shadow-sm text-xs font-bold uppercase tracking-wider">
          SIMULATED: {activeScenario.name}
        </div>
      )}

      {/* CITIZEN VIEW: Route network label when a route is shown */}
      {isCitizen && routeData && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur border border-slate-300 rounded-lg px-3 py-1.5 shadow-sm text-xs text-slate-700 font-medium">
          Simplified road network (demo)
        </div>
      )}

      {/* AUTHORITY VIEW: Merged Collapsible Scenario Box & Legend (Bottom-Left, Collapsed by Default) */}
      {!isCitizen && (
        <div className="absolute bottom-4 left-4 z-[1000] pointer-events-auto max-w-sm">
          {!isLegendExpanded ? (
            <button
              type="button"
              onClick={() => setIsLegendExpanded(true)}
              className="flex items-center gap-2 bg-white/95 backdrop-blur border border-slate-300 rounded-xl px-3.5 py-2 shadow-lg text-xs font-semibold text-slate-800 hover:text-blue-700 transition"
            >
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Map Legend & Scenario</span>
              {activeScenario?.isSimulated && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase">
                  SIMULATED
                </span>
              )}
              <ChevronUp className="w-4 h-4 text-slate-400 ml-1" />
            </button>
          ) : (
            <div className="bg-white/95 backdrop-blur border border-slate-300 rounded-2xl p-4 shadow-xl text-xs text-slate-800 space-y-3 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Map Legend & Scenario</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLegendExpanded(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition"
                  title="Collapse"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Scenario section */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900 text-xs break-words">
                    {activeScenario?.name || 'Demo scenario: moderate rainfall (assumed)'}
                  </span>
                  {activeScenario?.isSimulated ? (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase shrink-0">
                      SIMULATED
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                      BASELINE
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
                  <span>{activeScenario?.description || '7d 65 mm · 15d 145 mm · 30d 280 mm'}</span>
                  {activeScenario?.isSimulated && onResetScenario && (
                    <button
                      type="button"
                      onClick={onResetScenario}
                      className="text-blue-600 hover:text-blue-800 underline font-semibold shrink-0"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {activeScenario?.isSimulated && simulationResult && (
                  <div className="pt-2 border-t border-slate-200 space-y-1.5 text-[11px]">
                    <div className="text-slate-700 space-y-0.5">
                      <div>
                        • <b>{(simulationResult.zone_impact?.newly_high_risk_zones_count || 0) + (simulationResult.zone_impact?.newly_critical_zones_count || 0)}</b> zones moved to High/Critical
                      </div>
                      <div>
                        • <b>{simulationResult.shelter_impact?.compromised_shelters_count || 0}</b> shelters compromised
                      </div>
                      <div>
                        • <b>{simulationResult.sos_impact?.sos_in_elevated_risk_zones || 0}</b> SOS in elevated zones
                      </div>
                    </div>

                    {onSetMapCompareMode && (
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-slate-500 font-medium">Compare:</span>
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          <button
                            type="button"
                            onClick={() => onSetMapCompareMode('before')}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                              mapCompareMode === 'before'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Before
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetMapCompareMode('after')}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                              mapCompareMode === 'after'
                                ? 'bg-purple-600 text-white shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            After
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Risk scale legend */}
              <div className="pt-2 border-t border-slate-200 space-y-1.5">
                <div className="font-semibold text-slate-800 text-xs">
                  Flood Risk Scale (1 km Grid)
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-emerald-500"></span>
                    <span className="text-slate-700">Safe (&lt;25)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-amber-500"></span>
                    <span className="text-slate-700">Moderate (25–50)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-orange-500"></span>
                    <span className="text-slate-700">High (50–75)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-red-600"></span>
                    <span className="text-slate-700">Critical (75+)</span>
                  </div>
                </div>
              </div>

              {/* Marker note */}
              <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">SOS Distress Markers</div>
                <p className="leading-tight">
                  Number on marker = <b>Urgency Score (0–100)</b> based on water depth, vulnerable individuals, and zone flood severity.
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-500 text-center italic">
                Model trained on Assam data; predictions are estimates.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
