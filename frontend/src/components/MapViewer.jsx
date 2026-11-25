import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ShieldCheck, AlertTriangle, Home, LifeBuoy, MapPin, Navigation } from 'lucide-react';

// Fix Leaflet's default icon missing in React bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom Shelter Icon (Blue)
const createShelterIcon = (beds) => {
  return L.divIcon({
    className: 'custom-shelter-marker',
    html: `
      <div style="background-color: #2563eb; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.3); border: 2px solid white; font-size: 11px; font-weight: bold;">
        <span>🏠</span>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18]
  });
};

// Custom SOS Distress Icon (Red Pulsating)
const createSOSIcon = (urgency) => {
  const isCritical = urgency >= 85;
  return L.divIcon({
    className: 'custom-sos-marker',
    html: `
      <div class="${isCritical ? 'pulse-sos' : ''}" style="background-color: #dc2626; color: white; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 8px rgba(220, 38, 38, 0.5); border: 2px solid #fee2e2; font-size: 11px; font-weight: 800;">
        <span>${Math.round(urgency)}</span>
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

export default function MapViewer({
  zonesGeoJSON,
  shelters,
  sosRequests,
  routeData,
  selectedZone,
  onSelectZone,
  recenterCoords,
  showGrid = true,
  onSetRouteStart,
  onSetRouteEnd
}) {
  const defaultCenter = [26.15, 91.75]; // Guwahati central coordinates
  const geoJsonRef = useRef(null);

  // Style function for 1 km grid zones
  const styleZone = (feature) => {
    const risk = feature.properties.risk_score || 0;
    let fillColor = '#10b981'; // Safe
    let fillOpacity = 0.20;

    if (risk >= 75) {
      fillColor = '#ef4444'; // Critical
      fillOpacity = 0.60;
    } else if (risk >= 50) {
      fillColor = '#f97316'; // High
      fillOpacity = 0.45;
    } else if (risk >= 25) {
      fillColor = '#f59e0b'; // Moderate
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

  // Interactions on each zone polygon
  const onEachZone = (feature, layer) => {
    layer.on({
      click: () => {
        onSelectZone(feature.properties);
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
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> voyager'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {/* Dynamic Map Recenter */}
        {recenterCoords && <MapRecenter center={recenterCoords} />}

        {/* 1 km Grid Zones */}
        {showGrid && zonesGeoJSON && (
          <GeoJSON
            key={JSON.stringify(zonesGeoJSON.summary || {})}
            ref={geoJsonRef}
            data={zonesGeoJSON}
            style={styleZone}
            onEachFeature={onEachZone}
          />
        )}

        {/* Route Lines (Shortest vs Safe Path) */}
        {routeData && routeData.routes && (
          <>
            {/* Shortest Route (Grey/Red Dashed) */}
            {routeData.routes.shortest && routeData.routes.shortest.geojson && (
              <GeoJSON
                key={`shortest-${routeData.start.lat}`}
                data={routeData.routes.shortest.geojson}
                style={{
                  color: '#94a3b8',
                  weight: 3.5,
                  opacity: 0.7,
                  dashArray: '6, 8'
                }}
              />
            )}

            {/* Safe Evacuation Route (Bright Emerald Solid with High Visibility) */}
            {routeData.routes.safe && routeData.routes.safe.geojson && (
              <GeoJSON
                key={`safe-${routeData.start.lat}`}
                data={routeData.routes.safe.geojson}
                style={{
                  color: '#10b981',
                  weight: 5.5,
                  opacity: 0.95
                }}
              />
            )}

            {/* Origin Marker */}
            <Marker
              position={[routeData.start.lat, routeData.start.lon]}
              icon={createPointIcon('#0284c7', 'Start')}
            />

            {/* Destination Marker */}
            <Marker
              position={[routeData.destination.lat, routeData.destination.lon]}
              icon={createPointIcon('#10b981', 'Destination')}
            />
          </>
        )}

        {/* Verified Relief Shelters */}
        {shelters && shelters.map((shelter) => (
          <Marker
            key={`shelter-${shelter.id}`}
            position={[shelter.lat, shelter.lon]}
            icon={createShelterIcon(shelter.capacity)}
          >
            <Popup className="custom-leaflet-popup">
              <div className="p-1 font-sans text-slate-800">
                <div className="flex items-center gap-1.5 font-bold text-sm text-blue-700">
                  <Home className="w-4 h-4" />
                  <span>{shelter.name}</span>
                </div>
                <div className="mt-1.5 text-xs space-y-1">
                  <div>Capacity: <b>{shelter.capacity} beds</b> ({shelter.available_capacity} free)</div>
                  <div>Elevation: <b>{shelter.elevation_m}m</b> (SRTM DEM)</div>
                  <div>Status: <span className="font-semibold text-emerald-600">{shelter.status}</span></div>
                  {shelter.contact_phone && (
                    <div>Helpline: <a href={`tel:${shelter.contact_phone}`} className="text-blue-600 underline">{shelter.contact_phone}</a></div>
                  )}
                </div>
                {onSetRouteEnd && (
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

        {/* SOS Citizen Distress Pins */}
        {sosRequests && sosRequests.map((sos) => (
          <Marker
            key={`sos-${sos.id}`}
            position={[sos.lat, sos.lon]}
            icon={createSOSIcon(sos.urgency_score)}
          >
            <Popup className="custom-leaflet-popup">
              <div className="p-1 font-sans text-slate-800">
                <div className="flex items-center gap-1.5 font-bold text-sm text-red-700">
                  <LifeBuoy className="w-4 h-4" />
                  <span>SOS Rescue #{sos.id} ({sos.priority_level || 'Distress'})</span>
                </div>
                <div className="mt-1.5 text-xs space-y-1">
                  <div>Citizen: <b>{sos.citizen_name}</b></div>
                  <div>Phone: <a href={`tel:${sos.phone}`} className="text-blue-600 underline font-semibold">{sos.phone}</a></div>
                  <div>Water Level: <b className="text-red-600">{sos.water_depth_level}</b></div>
                  <div>People Trapped: <b>{sos.people_count}</b></div>
                  <div>Urgency Score: <b className="text-red-700">{sos.urgency_score}/100</b></div>
                  {sos.assigned_team && (
                    <div className="text-emerald-700 font-medium">Assigned: {sos.assigned_team}</div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Floating Map Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl p-3 shadow-xl text-xs max-w-xs pointer-events-auto">
        <div className="font-semibold text-slate-200 mb-2 flex items-center justify-between">
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

        {routeData && (
          <div className="mt-2.5 pt-2 border-t border-slate-800 space-y-1 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="w-4 h-1 rounded bg-emerald-500"></span>
              <span className="text-emerald-400 font-medium">Safe Route (Flood-penalized)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-4 h-0.5 border-t border-dashed border-slate-400"></span>
              <span className="text-slate-400">Shortest Route (Distance only)</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
