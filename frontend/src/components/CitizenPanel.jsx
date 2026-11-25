import React, { useState } from 'react';
import { Navigation, Home, AlertCircle, ArrowRight, ShieldCheck, Clock, Gauge, Compass } from 'lucide-react';

const GUWAHATI_LANDMARKS = [
  { name: 'Jalukbari Flyover (West Entry)', lat: 26.1445, lon: 91.6631 },
  { name: 'Paltan Bazaar (Guwahati Railway Stn)', lat: 26.1812, lon: 91.7510 },
  { name: 'Dispur (State Secretariat)', lat: 26.1420, lon: 91.7898 },
  { name: 'Khanapara (Border Exit)', lat: 26.1158, lon: 91.8210 },
  { name: 'Sarusajai Sports Complex (Relief Base)', lat: 26.1152, lon: 91.7384 },
  { name: 'IIT Guwahati (North Guwahati)', lat: 26.1901, lon: 91.6914 },
  { name: 'Assam Engineering College (AEC)', lat: 26.1390, lon: 91.6605 },
  { name: 'Nehru Stadium (Ulubari)', lat: 26.1772, lon: 91.7570 }
];

export default function CitizenPanel({
  onCalculateRoute,
  routeData,
  routingLoading,
  onRecommendShelters,
  shelterRecommendations,
  shelterLoading,
  onOpenSOSModal
}) {
  const [activeTab, setActiveTab] = useState('routing'); // 'routing' | 'shelters'

  // Route finder state
  const [startIdx, setStartIdx] = useState(0); // Jalukbari
  const [endIdx, setEndIdx] = useState(3);   // Khanapara
  const [alphaPenalty, setAlphaPenalty] = useState(15.0);

  // Shelter finder state
  const [citizenLocIdx, setCitizenLocIdx] = useState(1); // Paltan Bazaar

  const handleRouteSubmit = (e) => {
    e.preventDefault();
    const start = GUWAHATI_LANDMARKS[startIdx];
    const end = GUWAHATI_LANDMARKS[endIdx];
    onCalculateRoute(start.lat, start.lon, end.lat, end.lon, alphaPenalty);
  };

  const handleShelterSubmit = (e) => {
    e.preventDefault();
    const loc = GUWAHATI_LANDMARKS[citizenLocIdx];
    onRecommendShelters(loc.lat, loc.lon);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-100 overflow-y-auto">
      {/* Sub-navigation tabs */}
      <div className="grid grid-cols-2 p-2.5 gap-2 border-b border-slate-800 bg-slate-950/60 sticky top-0 z-10 backdrop-blur">
        <button
          onClick={() => setActiveTab('routing')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            activeTab === 'routing'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Safe Route Finder</span>
        </button>

        <button
          onClick={() => setActiveTab('shelters')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            activeTab === 'shelters'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Home className="w-3.5 h-3.5" />
          <span>Shelter Locator</span>
        </button>
      </div>

      <div className="p-4 space-y-5">
        {activeTab === 'routing' ? (
          /* ================= SAFE ROUTE FINDER ================= */
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span>Flood-Penalized Evacuation Path</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Calculates both shortest road distance and flood-safe detour path bypassing inundated corridors.
              </p>
            </div>

            <form onSubmit={handleRouteSubmit} className="space-y-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-800">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Starting Point (Origin)
                </label>
                <select
                  value={startIdx}
                  onChange={(e) => setStartIdx(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {GUWAHATI_LANDMARKS.map((lm, i) => (
                    <option key={`start-${i}`} value={i} disabled={i === endIdx}>
                      {lm.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Evacuation Destination
                </label>
                <select
                  value={endIdx}
                  onChange={(e) => setEndIdx(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {GUWAHATI_LANDMARKS.map((lm, i) => (
                    <option key={`end-${i}`} value={i} disabled={i === startIdx}>
                      {lm.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                  <span>Flood Risk Avoidance Penalty (α)</span>
                  <span className="font-mono text-cyan-400">{alphaPenalty}×</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  step="1"
                  value={alphaPenalty}
                  onChange={(e) => setAlphaPenalty(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              <button
                type="submit"
                disabled={routingLoading}
                className="w-full py-2 px-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {routingLoading ? (
                  <span>Computing Optimal Path...</span>
                ) : (
                  <>
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Find Safe Evacuation Path</span>
                  </>
                )}
              </button>
            </form>

            {/* Route Comparison Results Card */}
            {routeData && (
              <div className="bg-slate-800/80 rounded-xl border border-slate-700/80 p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                  <span className="text-xs font-bold text-white">Route Analysis</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    routeData.safety_comparison?.safe_path_max_risk < 50
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {routeData.routes?.safe?.safety_status || 'Safe Path'}
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Safe Route Distance</span>
                    <span className="text-base font-bold text-emerald-400 font-mono">
                      {routeData.routes?.safe?.total_distance_km} km
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Shortest: {routeData.routes?.shortest?.total_distance_km} km
                    </span>
                  </div>

                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Risk Reduction</span>
                    <span className="text-base font-bold text-cyan-400 font-mono">
                      {routeData.safety_comparison?.risk_reduction_pct}%
                    </span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Max Risk: {routeData.routes?.safe?.max_risk_score}/100
                    </span>
                  </div>
                </div>

                <div className="text-[11px] bg-cyan-950/40 border border-cyan-800/40 rounded-lg p-2.5 text-cyan-200">
                  <span className="font-semibold block text-cyan-300 mb-0.5">Recommendation:</span>
                  {routeData.safety_comparison?.recommendation}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ================= SHELTER FINDER ================= */
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Home className="w-4 h-4 text-blue-400" />
                <span>Multi-Criteria Relief Shelter Locator</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ranks verified shelters by proximity, live zone flood safety, DEM elevation, and available bed capacity.
              </p>
            </div>

            <form onSubmit={handleShelterSubmit} className="space-y-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-800">
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Your Current Location
                </label>
                <select
                  value={citizenLocIdx}
                  onChange={(e) => setCitizenLocIdx(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                >
                  {GUWAHATI_LANDMARKS.map((lm, i) => (
                    <option key={`cit-${i}`} value={i}>
                      {lm.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={shelterLoading}
                className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {shelterLoading ? (
                  <span>Evaluating Shelters...</span>
                ) : (
                  <>
                    <Home className="w-3.5 h-3.5" />
                    <span>Find Safest Nearby Shelters</span>
                  </>
                )}
              </button>
            </form>

            {/* Recommendations List */}
            {shelterRecommendations && shelterRecommendations.recommended_shelters && (
              <div className="space-y-2.5">
                <span className="text-xs font-semibold text-slate-400 block">
                  Top Recommended Shelters:
                </span>
                {shelterRecommendations.recommended_shelters.map((s) => (
                  <div
                    key={`rec-${s.id}`}
                    className="bg-slate-800/80 rounded-xl border border-slate-700/70 p-3 space-y-2 hover:border-blue-500/50 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-blue-600/30 text-blue-400 font-bold text-xs flex items-center justify-center border border-blue-500/30">
                            #{s.suitability_rank}
                          </span>
                          <h3 className="font-bold text-xs text-white">{s.name}</h3>
                        </div>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">
                          {s.distance_km} km away · Elev {s.elevation_m}m · Free Beds: {s.available_capacity}/{s.capacity}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-emerald-400 block">
                          {s.suitability_score} pts
                        </span>
                        <span className="text-[9px] uppercase tracking-wider text-slate-400">
                          Suitability
                        </span>
                      </div>
                    </div>

                    {s.safety_warning && (
                      <div className="text-[10px] text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded p-1.5">
                        {s.safety_warning}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        const loc = GUWAHATI_LANDMARKS[citizenLocIdx];
                        onCalculateRoute(loc.lat, loc.lon, s.lat, s.lon, 15.0);
                      }}
                      className="w-full text-xs py-1.5 px-2.5 bg-slate-700/80 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center justify-center gap-1 transition"
                    >
                      <Navigation className="w-3 h-3 text-cyan-400" />
                      <span>Evacuate to this Shelter</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
