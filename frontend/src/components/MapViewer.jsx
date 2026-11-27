import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Home, LifeBuoy } from 'lucide-react';

// Fix Leaflet's default icon missing in React bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Shelter Icon (Blue)
const createShelterIcon = () => {
  return L.divIcon({
    className: 'custom-shelter-marker',
    html: `
      <div style="background-color: #2563eb; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white; font-size: 14px;">
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
        <div style="background-color: #2563eb; color: white; padding: 3px 8px; border-radius: 999px; font-weight: 700; font-size: 12px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.4); border: 2px solid white; margin-bottom: 4px;">
          You are here
        </div>
        <div style="width: 18px; height: 18px; border-radius: 50%; background-color: #3b82f6; border: 3px solid white; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.35);"></div>
      </div>
    `,
    iconSize: [100, 44],
    iconAnchor: [50, 35],
    popupAnchor: [0, -35]
  });
};

// Custom SOS Distress Icon (Authority view only)
const createSOSIcon = (urgency, isSimulated = true) => {
  const isCritical = urgency >= 85;
  const isDemo = isSimulated !== false;
  const badgeHtml = isDemo
    ? `<span style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); background-color: #d97706; color: white; font-size: 8px; font-weight: 800; padding: 0.5px 3.5px; border-radius: 3px; letter-spacing: 0.5px; border: 1px solid #78350f; box-shadow: 0 1px 2px rgba(0,0,0,0.5); text-transform: uppercase; white-space: nowrap;">DEMO</span>`
    : `<span style="position: absolute; top: -8px; left: 50%; transform: translateX(-50%); background-color: #059669; color: white; font-size: 8px; font-weight: 800; padding: 0.5px 3.5px; border-radius: 3px; letter-spacing: 0.5px; border: 1px solid #064e3b; box-shadow: 0 1px 2px rgba(0,0,0,0.5); text-transform: uppercase; white-space: nowrap;">LIVE</span>`;

  return L.divIcon({
    className: 'custom-sos-marker',
    html: `
      <div style="position: relative; width: 34px; height: 34px;">
        ${badgeHtml}
        <div class="${isCritical ? 'pulse-sos' : ''}" style="background-color: #dc2626; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(220, 38, 38, 0.5); border: 2px solid #fee2e2; font-size: 11px; font-weight: 800;">
          <span>${Math.round(urgency)}</span>
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -20]
  });
};

// Start & Destination Icons
const createPointIcon = (color, label) => {
  return L.divIcon({
    className: 'custom-point-marker',
    html: `
      <div style="background-color: ${color}; color: white; padding: 4px 8px; border-radius: 12px; font-weight: bold; font-size: 11px; display: flex; align-items: center; gap: 4px; box-shadow: 0 4px 6px rgba(0,0,0,0.4); border: 2px solid white; white-space: nowrap;">
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
      map.setView(center, 13, { animate: true });
    }
  }, [center, map]);
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
  onResetScenario
}) {
  const defaultCenter = [26.15, 91.75];
  const geoJsonRef = useRef(null);
  const isCitizen = viewMode === 'citizen';

  // Style function for 1 km grid zones (Authority view only)
  const styleZone = (feature) => {
    const risk = feature.properties.risk_score || 0;
    let fillColor = '#10b981';
    let fillOpacity = 0.20;

    if (risk >= 75) {
      fillColor = '#ef4444';
      fillOpacity = 0.60;
    } else if (risk >= 50) {
      fillColor = '#f97316';
      fillOpacity = 0.45;
    } else if (risk >= 25) {
      fillColor = '#f59e0b';
      fillOpacity = 0.30;
    }

    return {
      fillColor,
      weight: 1,
      opacity: 0.8,
      color: fillColor,
      fillOpacity
    };
  };

  // Interactions on each zone polygon (Authority view only)
  const onEachZone = (feature, layer) => {
    layer.on({
      click: () => {
        onSelectZone && onSelectZone(feature.properties);
      },
      mouseover: (e) => {
        const l = e.target;
        l.setStyle({ weight: 2.5, color: '#ffffff', fillOpacity: 0.75 });
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
      { sticky: true, className: 'leaflet-tooltip-dark' }
    );
  };

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={defaultCenter}
        zoom={12}
        minZoom={9}
        maxZoom={18}
        className={`w-full h-full ${isCitizen ? 'cursor-crosshair' : ''}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Dynamic Map Recenter */}
        {recenterCoords && <MapRecenter center={recenterCoords} />}

        {/* Citizen tap-on-map handler */}
        <CitizenMapClickHandler enabled={isCitizen} onMapClick={onMapSelectLocation} />

        {/* CITIZEN VIEW: Soft risk color circle around user's area (no grid lines) */}
        {isCitizen && userLocation && (
          <>
            <Circle
              center={[userLocation.lat, userLocation.lon]}
              radius={900}
              pathOptions={{
                stroke: false,
                fillColor: getSoftAreaColor(userAreaRisk?.risk_score ?? 0),
                fillOpacity: 0.28
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

        {/* Route Lines */}
        {routeData && routeData.routes && (
          <>
            {/* Shortest Route */}
            {(!isCitizen || routeMode === 'shortest') &&
              routeData.routes.shortest &&
              routeData.routes.shortest.geojson && (
                <GeoJSON
                  key={`shortest-${routeData.start.lat}-${routeMode}`}
                  data={routeData.routes.shortest.geojson}
                  style={{
                    color: isCitizen ? '#f59e0b' : '#94a3b8',
                    weight: isCitizen ? 5 : 3.5,
                    opacity: isCitizen ? 0.9 : 0.7,
                    dashArray: isCitizen ? undefined : '6, 8'
                  }}
                />
              )}

            {/* Safe Evacuation Route */}
            {(!isCitizen || routeMode === 'safe') &&
              routeData.routes.safe &&
              routeData.routes.safe.geojson && (
                <GeoJSON
                  key={`safe-${routeData.start.lat}-${routeMode}`}
                  data={routeData.routes.safe.geojson}
                  style={{
                    color: '#10b981',
                    weight: 6,
                    opacity: 0.95
                  }}
                />
              )}

            {/* Origin Marker (Authority view; Citizen has "You are here") */}
            {!isCitizen && (
              <Marker
                position={[routeData.start.lat, routeData.start.lon]}
                icon={createPointIcon('#0284c7', 'Start')}
              />
            )}

            {/* Destination Marker */}
            <Marker
              position={[routeData.destination.lat, routeData.destination.lon]}
              icon={createPointIcon('#10b981', 'Shelter')}
            />
          </>
        )}

        {/* Verified Relief Shelters */}
        {shelters && shelters.map((shelter) => (
          <Marker
            key={`shelter-${shelter.id}`}
            position={[shelter.lat, shelter.lon]}
            icon={createShelterIcon()}
          >
            <Popup className="custom-leaflet-popup">
              <div className="p-1 font-sans text-slate-800 text-sm">
                <div className="flex items-center gap-1.5 font-bold text-base text-blue-700">
                  <Home className="w-4 h-4 shrink-0" />
                  <span>{shelter.name}</span>
                </div>
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
        ))}

        {/* SOS Citizen Distress Pins: AUTHORITY VIEW ONLY */}
        {!isCitizen && sosRequests && sosRequests.map((sos) => (
          <Marker
            key={`sos-${sos.id}`}
            position={[sos.lat, sos.lon]}
            icon={createSOSIcon(sos.urgency_score, sos.is_simulated)}
          >
            <Popup className="custom-leaflet-popup">
              <div className="p-1 font-sans text-slate-800">
                <div className="flex items-center justify-between gap-2 border-b pb-1">
                  <div className="flex items-center gap-1.5 font-bold text-sm text-red-700">
                    <LifeBuoy className="w-4 h-4" />
                    <span>SOS Rescue #{sos.id}</span>
                  </div>
                  {sos.is_simulated !== false ? (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300">
                      DEMO
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                      LIVE
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-xs space-y-1">
                  <div>
                    Urgency Score: <b className="text-red-700">{sos.urgency_score}/100</b>{' '}
                    <span className="text-[10px] text-slate-500 font-normal">({sos.priority_level || 'Distress'})</span>
                  </div>
                  <div>Water Level: <b className="text-red-600">{sos.water_depth_level}</b></div>
                  <div>People Trapped: <b>{sos.people_count}</b></div>
                  <div>Citizen: <b>{sos.citizen_name}</b></div>
                  <div>Phone: <a href={`tel:${sos.phone}`} className="text-blue-600 underline font-semibold">{sos.phone}</a></div>
                  {sos.assigned_team && (
                    <div className="text-emerald-700 font-medium">Assigned: {sos.assigned_team}</div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* CITIZEN VIEW: Minimal tap hint pill when no location selected yet */}
      {isCitizen && !userLocation && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-slate-900/90 backdrop-blur border border-slate-700 rounded-full px-4 py-2 shadow-xl text-base text-white font-medium pointer-events-none">
          Tap anywhere on the map to mark your location
        </div>
      )}

      {/* CITIZEN VIEW: Simulated Weather Pill (only when a simulation is active) */}
      {isCitizen && activeScenario?.isSimulated && (
        <div className="absolute top-3 right-3 z-[1000] bg-amber-500 text-slate-950 rounded-full px-3 py-1 shadow-lg text-xs font-bold uppercase tracking-wider">
          SIMULATED: {activeScenario.name}
        </div>
      )}

      {/* CITIZEN VIEW: Route network label when a route is shown */}
      {isCitizen && routeData && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-slate-900/90 backdrop-blur border border-slate-700 rounded-lg px-3 py-1.5 shadow-lg text-xs text-slate-200 font-medium">
          Simplified road network (demo)
        </div>
      )}

      {/* AUTHORITY VIEW: Floating Active Scenario Badge */}
      {!isCitizen && (
        <div className="absolute top-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl px-3.5 py-2.5 shadow-xl text-xs max-w-sm pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-medium">Risk under:</span>
            <span className="font-semibold text-white truncate">
              {activeScenario?.name || 'Demo scenario: moderate rainfall (assumed)'}
            </span>
            {activeScenario?.isSimulated ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider shrink-0">
                SIMULATED
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                BASELINE
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between gap-3">
            <span>{activeScenario?.description || '65mm (7d) · 145mm (15d) · 280mm (30d)'}</span>
            {activeScenario?.isSimulated && onResetScenario && (
              <button
                onClick={onResetScenario}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-semibold shrink-0"
              >
                Reset to Baseline
              </button>
            )}
          </div>
        </div>
      )}

      {/* AUTHORITY VIEW: Floating Map Legend */}
      {!isCitizen && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-xl text-xs max-w-xs pointer-events-auto space-y-2">
          <div className="font-semibold text-slate-200 flex items-center justify-between">
            <span>Flood Risk Scale (1 km Grid)</span>
            <span className="text-[10px] text-slate-400">SRTM + CHIRPS ML</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500"></span>
              <span className="text-slate-300">Safe (&lt;25)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-500"></span>
              <span className="text-slate-300">Moderate (25-50)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-500"></span>
              <span className="text-slate-300">High (50-75)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-red-500"></span>
              <span className="text-slate-300">Critical (75+)</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300">SOS Distress Markers</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">DEMO</span>
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              Number on marker (e.g. <span className="text-red-400 font-bold">85</span>) = <b className="text-slate-200">Urgency Score (0–100)</b> based on water depth, medical distress, trapped infants/seniors, and zone flood severity.
            </p>
          </div>

          {routeData && (
            <div className="pt-2 border-t border-slate-800 space-y-1 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-4 h-1 rounded bg-emerald-500"></span>
                <span className="text-emerald-400 font-medium">Safe Route (Flood-penalized)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-0.5 border-t border-dashed border-slate-400"></span>
                <span className="text-slate-400">Shortest Route (Distance only)</span>
              </div>
              <div className="text-[10px] text-amber-300 font-medium pt-0.5">
                Simplified road network (demo)
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 text-center italic leading-tight">
            Model trained on Assam data; predictions are estimates.
          </div>
        </div>
      )}
    </div>
  );
}
