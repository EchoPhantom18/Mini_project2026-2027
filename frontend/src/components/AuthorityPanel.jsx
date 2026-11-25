import React, { useState } from 'react';
import { LifeBuoy, CloudRain, AlertTriangle, CheckCircle, Truck, Users, Activity, Play, ShieldAlert } from 'lucide-react';

export default function AuthorityPanel({
  triageData,
  triageLoading,
  onUpdateSOSStatus,
  presets,
  onRunSimulation,
  simulationResult,
  simulationLoading,
  onPanToLocation
}) {
  const [activeTab, setActiveTab] = useState('triage'); // 'triage' | 'simulation'

  // Triage filter
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Simulation state
  const [selectedPreset, setSelectedPreset] = useState('heavy_monsoon_surge');
  const [rain7d, setRain7d] = useState(180);
  const [rain15d, setRain15d] = useState(320);
  const [rain30d, setRain30d] = useState(520);
  const [scenarioName, setScenarioName] = useState('Heavy Monsoon Surge (+150mm)');

  // Dispatch modal state
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [assignedTeam, setAssignedTeam] = useState('SDRF Boat Unit 2');
  const [etaMin, setEtaMin] = useState(25);

  const handleApplyPreset = (presetId) => {
    setSelectedPreset(presetId);
    const p = presets?.find((item) => item.id === presetId);
    if (p) {
      setRain7d(p.rain_7d_mm);
      setRain15d(p.rain_15d_mm);
      setRain30d(p.rain_30d_mm);
      setScenarioName(p.name);
    }
  };

  const handleExecuteSimulation = (e) => {
    e.preventDefault();
    onRunSimulation(rain7d, rain15d, rain30d, scenarioName);
  };

  const handleDispatchSubmit = async (e) => {
    e.preventDefault();
    if (!dispatchTarget) return;
    await onUpdateSOSStatus(dispatchTarget.id, 'Dispatched', assignedTeam, etaMin, 'Emergency unit dispatched');
    setDispatchTarget(null);
  };

  const filteredQueue = triageData?.queue?.filter((item) => {
    if (statusFilter !== 'all' && item.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    if (priorityFilter !== 'all' && item.priority_level.toLowerCase() !== priorityFilter.toLowerCase()) return false;
    return true;
  }) || [];

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-100 overflow-y-auto">
      {/* Sub-navigation tabs */}
      <div className="grid grid-cols-2 p-2.5 gap-2 border-b border-slate-800 bg-slate-950/60 sticky top-0 z-10 backdrop-blur">
        <button
          onClick={() => setActiveTab('triage')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            activeTab === 'triage'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <LifeBuoy className="w-3.5 h-3.5" />
          <span>SOS Triage Queue</span>
          {triageData?.summary?.pending_requests > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-red-500 text-white rounded-full text-[10px] font-bold">
              {triageData.summary.pending_requests}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('simulation')}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition ${
            activeTab === 'simulation'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
              : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <CloudRain className="w-3.5 h-3.5" />
          <span>What-If Simulator</span>
        </button>
      </div>

      <div className="p-4 space-y-5">
        {activeTab === 'triage' ? (
          /* ================= SOS TRIAGE QUEUE ================= */
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <LifeBuoy className="w-4 h-4 text-red-400" />
                <span>Emergency Rescue Triage Queue</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ranks distress calls by live urgency score (water depth, elderly, infants, medical priority, zone risk).
              </p>
            </div>

            {/* Aggregate Stats */}
            {triageData?.summary && (
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-slate-400 block">Pending Rescue</span>
                  <span className="text-base font-bold text-red-400 font-mono">
                    {triageData.summary.pending_requests}
                  </span>
                </div>
                <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-slate-400 block">People at Risk</span>
                  <span className="text-base font-bold text-amber-400 font-mono">
                    {triageData.summary.total_people_at_risk}
                  </span>
                </div>
                <div className="bg-slate-800/80 p-2 rounded-xl border border-slate-700">
                  <span className="text-[10px] text-slate-400 block">Medical Emerg.</span>
                  <span className="text-base font-bold text-cyan-400 font-mono">
                    {triageData.summary.medical_emergencies_pending}
                  </span>
                </div>
              </div>
            )}

            {/* Status & Priority Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              {['Pending', 'Dispatched', 'Rescued', 'all'].map((st) => (
                <button
                  key={`st-${st}`}
                  onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition shrink-0 ${
                    statusFilter === st
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'all' ? 'All Status' : st}
                </button>
              ))}
            </div>

            {/* Triage Queue List */}
            <div className="space-y-2.5">
              {filteredQueue.map((item) => (
                <div
                  key={`triage-${item.id}`}
                  className="bg-slate-800/80 rounded-xl border border-slate-700/80 p-3 space-y-2 hover:border-purple-500/50 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-slate-700 text-slate-300 font-mono text-xs flex items-center justify-center font-bold">
                        #{item.queue_position}
                      </span>
                      <div>
                        <h3 className="font-bold text-xs text-white flex items-center gap-1.5">
                          <span>{item.citizen_name}</span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                            item.priority_level === 'Critical'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : item.priority_level === 'High'
                              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}>
                            {item.priority_level}
                          </span>
                        </h3>
                        <span className="text-[11px] text-slate-400">
                          Phone: <a href={`tel:${item.phone}`} className="text-blue-400 underline font-semibold">{item.phone}</a>
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-base font-extrabold text-red-400 font-mono">
                        {item.urgency_score}
                      </span>
                      <span className="text-[9px] text-slate-400 block uppercase">
                        Urgency
                      </span>
                    </div>
                  </div>

                  {/* Conditions Pills */}
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">
                      Water: <b>{item.water_depth_level}</b>
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">
                      People: <b>{item.people_count}</b>
                    </span>
                    {item.has_medical_emergency && (
                      <span className="px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 font-semibold">
                        Medical Emergency
                      </span>
                    )}
                    {item.has_infants && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                        Infant Present
                      </span>
                    )}
                    {item.has_elderly && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                        Elderly
                      </span>
                    )}
                  </div>

                  {item.notes && (
                    <p className="text-[11px] text-slate-300 italic bg-slate-900/60 p-1.5 rounded">
                      "{item.notes}"
                    </p>
                  )}

                  {item.nearest_shelter && (
                    <div className="text-[10px] text-cyan-300 bg-cyan-950/30 border border-cyan-800/30 rounded p-1.5">
                      Nearest Evacuation Shelter: <b>{item.nearest_shelter.name}</b> ({item.nearest_shelter.distance_km} km)
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      onClick={() => onPanToLocation(item.lat, item.lon)}
                      className="text-[11px] py-1 px-2.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-200 transition"
                    >
                      Locate on Map
                    </button>

                    {item.status.toLowerCase() === 'pending' && (
                      <button
                        onClick={() => setDispatchTarget(item)}
                        className="text-[11px] py-1 px-3 bg-red-600 hover:bg-red-500 rounded text-white font-semibold transition ml-auto flex items-center gap-1"
                      >
                        <Truck className="w-3 h-3" />
                        <span>Dispatch Rescue</span>
                      </button>
                    )}

                    {item.status.toLowerCase() === 'dispatched' && (
                      <button
                        onClick={() => onUpdateSOSStatus(item.id, 'Rescued')}
                        className="text-[11px] py-1 px-3 bg-emerald-600 hover:bg-emerald-500 rounded text-white font-semibold transition ml-auto flex items-center gap-1"
                      >
                        <CheckCircle className="w-3 h-3" />
                        <span>Mark Rescued</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ================= WHAT-IF SIMULATOR ================= */
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                <CloudRain className="w-4 h-4 text-purple-400" />
                <span>What-If Flood Scenario Simulator</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Model extreme cloudbursts and monsoon surges. Re-scores all 904 zones and predicts severed corridors and compromised shelters.
              </p>
            </div>

            {/* Presets List */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-300 block">
                Disaster Drill Presets:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {presets?.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleApplyPreset(p.id)}
                    className={`p-2 rounded-xl text-left border transition text-xs ${
                      selectedPreset === p.id
                        ? 'bg-purple-950/60 border-purple-500 text-white'
                        : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-semibold truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      7d: +{p.rain_7d_mm}mm
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Sliders Form */}
            <form onSubmit={handleExecuteSimulation} className="space-y-3 bg-slate-800/50 p-3.5 rounded-xl border border-slate-800">
              <div>
                <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                  <span>7-Day Rainfall (Sudden Storm)</span>
                  <span className="font-mono text-purple-400">{rain7d} mm</span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="600"
                  step="10"
                  value={rain7d}
                  onChange={(e) => setRain7d(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                  <span>15-Day Rainfall (Runoff Saturation)</span>
                  <span className="font-mono text-purple-400">{rain15d} mm</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="1000"
                  step="20"
                  value={rain15d}
                  onChange={(e) => setRain15d(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                  <span>30-Day Rainfall (Catchment Monsoon)</span>
                  <span className="font-mono text-purple-400">{rain30d} mm</span>
                </div>
                <input
                  type="range"
                  min="200"
                  max="1500"
                  step="50"
                  value={rain30d}
                  onChange={(e) => setRain30d(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>

              <button
                type="submit"
                disabled={simulationLoading}
                className="w-full py-2 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-md transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {simulationLoading ? (
                  <span>Executing Scenario Simulation...</span>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Run What-If Flood Simulation</span>
                  </>
                )}
              </button>
            </form>

            {/* Simulation Results Card */}
            {simulationResult && (
              <div className="bg-slate-800/80 rounded-xl border border-slate-700 p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-700 pb-2">
                  <span className="text-xs font-bold text-white">Scenario Impact Analysis</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    SIMULATED
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Newly Critical Zones</span>
                    <span className="text-base font-bold text-red-400 font-mono">
                      +{simulationResult.zone_impact?.newly_critical_zones_count || 0}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Mean Δ Risk: +{simulationResult.zone_impact?.mean_risk_increase}%
                    </span>
                  </div>

                  <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Severed Road Links</span>
                    <span className="text-base font-bold text-amber-400 font-mono">
                      {simulationResult.road_network_impact?.severed_impassable_edges || 0}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      {simulationResult.road_network_impact?.severed_edge_pct}% of corridors
                    </span>
                  </div>
                </div>

                {/* Monitored Corridors */}
                {simulationResult.road_network_impact?.monitored_corridors && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[11px] font-semibold text-slate-300 block">
                      Major Corridors Status:
                    </span>
                    {simulationResult.road_network_impact.monitored_corridors.map((c, i) => (
                      <div
                        key={`corridor-${i}`}
                        className="flex items-center justify-between text-xs p-1.5 rounded bg-slate-900/40 border border-slate-800/80"
                      >
                        <span className="text-slate-300 text-[11px] truncate max-w-[180px]">{c.corridor_name}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                          c.is_impassable
                            ? 'bg-red-500/20 text-red-400'
                            : c.max_risk_score >= 50
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dispatch Modal */}
      {dispatchTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleDispatchSubmit} className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div>
              <h3 className="font-bold text-sm text-white">Dispatch Rescue Unit</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Assigning team to SOS #{dispatchTarget.id} for {dispatchTarget.citizen_name}
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Rescue Unit Designation
              </label>
              <input
                type="text"
                value={assignedTeam}
                onChange={(e) => setAssignedTeam(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Estimated Arrival Time (ETA Minutes)
              </label>
              <input
                type="number"
                min="5"
                max="120"
                value={etaMin}
                onChange={(e) => setEtaMin(parseInt(e.target.value, 10))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                required
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDispatchTarget(null)}
                className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs text-white font-semibold shadow-lg shadow-red-600/30 transition"
              >
                Confirm Dispatch
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
