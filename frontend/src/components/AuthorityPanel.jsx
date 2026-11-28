import React, { useState } from 'react';
import {
  LifeBuoy,
  CloudRain,
  AlertTriangle,
  CheckCircle,
  Truck,
  Users,
  Activity,
  Play,
  Home,
  MapPin,
  Clock,
  Phone,
  ShieldCheck,
  Check
} from 'lucide-react';

function maskPhone(phone) {
  if (!phone) return '+91-98xxx-xxx00';
  if (phone.includes('xxx')) return phone;
  const digits = phone.replace(/\D/g, '');
  const last2 = digits.slice(-2) || '00';
  const prefix2 = digits.length >= 10 ? digits.slice(-10, -8) : '98';
  return `+91-${prefix2}xxx-xxx${last2}`;
}

const DEMO_TEAMS = [
  {
    id: 'team-1',
    name: 'SDRF Boat Unit 1',
    type: 'Inflatable Motorboat',
    capacity: 8,
    status: 'Ready',
    base: 'Bharalumukh Riverfront',
    lat: 26.1760,
    lon: 91.7280,
    personnel: 5
  },
  {
    id: 'team-2',
    name: 'SDRF Boat Unit 2',
    type: 'High-Capacity Rescue Boat',
    capacity: 12,
    status: 'Ready',
    base: 'Pandu River Port',
    lat: 26.1680,
    lon: 91.7030,
    personnel: 6
  },
  {
    id: 'team-3',
    name: 'NDRF Quick Response Team 4',
    type: 'Amphibious Transport',
    capacity: 16,
    status: 'Ready',
    base: 'Khanapara Depot',
    lat: 26.1240,
    lon: 91.8260,
    personnel: 8
  },
  {
    id: 'team-4',
    name: 'Civil Defense Paramedic Unit',
    type: 'Mobile Trauma Ambulance',
    capacity: 4,
    status: 'On Standby',
    base: 'GMCH Bhangagarh',
    lat: 26.1610,
    lon: 91.7700,
    personnel: 4
  }
];

export default function AuthorityPanel({
  triageData,
  triageLoading,
  onUpdateSOSStatus,
  shelters = [],
  presets = [],
  onRunSimulation,
  onResetScenario,
  activeScenario,
  simulationResult,
  simulationLoading,
  onPanToLocation
}) {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'teams' | 'shelters' | 'whatif'

  // Triage filter
  const [statusFilter, setStatusFilter] = useState('Pending');

  // Simulation state
  const [selectedPreset, setSelectedPreset] = useState('heavy_monsoon_surge');
  const [rain7d, setRain7d] = useState(180);
  const [rain15d, setRain15d] = useState(320);
  const [rain30d, setRain30d] = useState(520);
  const [scenarioName, setScenarioName] = useState('Heavy monsoon downpour (demo)');

  // Dispatch modal & toast state
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [assignedTeam, setAssignedTeam] = useState('SDRF Boat Unit 2');
  const [etaMin, setEtaMin] = useState(25);
  const [toastMessage, setToastMessage] = useState('');

  // Clean preset names
  const getCleanPresetName = (preset) => {
    const map = {
      monsoon_baseline: 'Moderate rainfall baseline (demo)',
      heavy_monsoon_surge: 'Heavy monsoon downpour (demo)',
      extreme_cloudburst: 'Severe localized storm (demo)',
      catastrophic_century_flood: 'Extreme rainfall scenario (demo)'
    };
    return map[preset?.id] || preset?.name || 'Custom rainfall scenario';
  };

  const isOutsideTrainingData = rain7d > 404.9 || rain15d > 639.6 || rain30d > 1069.5;

  const handleRain7dChange = (val) => {
    setRain7d(val);
    const next15 = Math.max(rain15d, val);
    if (next15 !== rain15d) setRain15d(next15);
    if (rain30d < next15) setRain30d(next15);
    setScenarioName('Custom rainfall scenario (demo)');
    setSelectedPreset('custom');
  };

  const handleRain15dChange = (val) => {
    setRain15d(val);
    if (rain7d > val) setRain7d(val);
    if (rain30d < val) setRain30d(val);
    setScenarioName('Custom rainfall scenario (demo)');
    setSelectedPreset('custom');
  };

  const handleRain30dChange = (val) => {
    setRain30d(val);
    const next15 = Math.min(rain15d, val);
    if (next15 !== rain15d) setRain15d(next15);
    if (rain7d > next15) setRain7d(next15);
    setScenarioName('Custom rainfall scenario (demo)');
    setSelectedPreset('custom');
  };

  const handleResetSlidersAndScenario = () => {
    setSelectedPreset('monsoon_baseline');
    setRain7d(65);
    setRain15d(145);
    setRain30d(280);
    setScenarioName('Moderate rainfall baseline (demo)');
    if (onResetScenario) onResetScenario();
  };

  const handleApplyPreset = (presetId) => {
    setSelectedPreset(presetId);
    const p = presets?.find((item) => item.id === presetId);
    if (p) {
      setRain7d(p.rain_7d_mm);
      setRain15d(p.rain_15d_mm);
      setRain30d(p.rain_30d_mm);
      setScenarioName(getCleanPresetName(p));
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
    setToastMessage('Marked as dispatched (demo)');
    setTimeout(() => setToastMessage(''), 3500);
  };

  const filteredQueue = triageData?.queue?.filter((item) => {
    if (statusFilter !== 'all' && item.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    return true;
  }) || [];

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 text-slate-800 overflow-hidden font-sans">
      {/* Panel Header with single DEMO DATA badge */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Rescue Control Operations</h2>
          <p className="text-xs text-slate-500">Kamrup Metropolitan Coordination</p>
        </div>
        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wider">
          DEMO DATA
        </span>
      </div>

      {/* Confirmation Toast */}
      {toastMessage && (
        <div className="mx-3 mt-2 px-3 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm animate-fade-in shrink-0">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Tabs: SOS Queue | Teams | Shelters | What-If */}
      <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-100/80 p-1 gap-1 text-xs font-semibold shrink-0">
        <button
          onClick={() => setActiveTab('queue')}
          className={`py-2 px-1 rounded-lg text-center transition flex items-center justify-center gap-1 ${
            activeTab === 'queue'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>SOS Queue</span>
          {triageData?.summary?.pending_requests > 0 && (
            <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
              {triageData.summary.pending_requests}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('teams')}
          className={`py-2 px-1 rounded-lg text-center transition ${
            activeTab === 'teams'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>Teams</span>
        </button>

        <button
          onClick={() => setActiveTab('shelters')}
          className={`py-2 px-1 rounded-lg text-center transition ${
            activeTab === 'shelters'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>Shelters</span>
        </button>

        <button
          onClick={() => setActiveTab('whatif')}
          className={`py-2 px-1 rounded-lg text-center transition ${
            activeTab === 'whatif'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>What-If</span>
        </button>
      </div>

      {/* Tab Content Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ================= TAB 1: SOS QUEUE ================= */}
        {activeTab === 'queue' && (
          <div className="space-y-3.5">
            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {['Pending', 'Dispatched', 'Rescued', 'all'].map((st) => (
                <button
                  key={`st-${st}`}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition shrink-0 ${
                    statusFilter === st
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st === 'all' ? 'All Status' : st}
                </button>
              ))}
            </div>

            {/* Queue Cards */}
            <div className="space-y-3">
              {filteredQueue.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl border border-slate-200">
                  No requests matching "{statusFilter}".
                </div>
              ) : (
                filteredQueue.map((item) => (
                  <div
                    key={`triage-${item.id}`}
                    className="bg-slate-50 hover:bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2.5 transition shadow-sm hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900">
                            #{item.queue_position} · {item.citizen_name}
                          </h3>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            item.priority_level === 'Critical'
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : item.priority_level === 'High'
                              ? 'bg-orange-100 text-orange-800 border border-orange-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}>
                            {item.priority_level}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Phone: <span className="font-mono text-slate-700">{maskPhone(item.phone)}</span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-lg font-extrabold text-red-600 font-mono">
                          {item.urgency_score}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          urgency
                        </span>
                      </div>
                    </div>

                    {/* Needs and Water Depth badges */}
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                        Water: {item.water_depth_level}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                        People: {item.people_count}
                      </span>
                      {item.medical_emergency && (
                        <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-300 font-medium">
                          Medical Emergency
                        </span>
                      )}
                      {item.elderly_present && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 font-medium">
                          Elderly Present
                        </span>
                      )}
                      {item.infants_present && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-300 font-medium">
                          Infant Present
                        </span>
                      )}
                    </div>

                    {item.message && (
                      <p className="text-xs text-slate-600 italic bg-white p-2 rounded-lg border border-slate-200/80">
                        "{item.message}"
                      </p>
                    )}

                    {/* Shelter info */}
                    {item.nearest_shelter && (
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Home className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Nearest Shelter: <b>{item.nearest_shelter.name}</b> ({item.nearest_shelter.distance_km} km)</span>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
                      <button
                        onClick={() => onPanToLocation && onPanToLocation(item.lat, item.lon)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline transition"
                      >
                        Locate on Map
                      </button>

                      {item.status === 'Pending' && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">Demo: no real dispatch</span>
                          <button
                            onClick={() => setDispatchTarget(item)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition active:scale-95"
                          >
                            Dispatch Rescue
                          </button>
                        </div>
                      )}

                      {item.status === 'Dispatched' && (
                        <span className="text-xs font-semibold text-amber-600 flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5" />
                          <span>Dispatched ({item.assigned_team || 'Boat Unit'})</span>
                        </span>
                      )}

                      {item.status === 'Rescued' && (
                        <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Rescued</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: TEAMS ================= */}
        {activeTab === 'teams' && (
          <div className="space-y-3.5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Assam Emergency Response Teams</h3>
              <p className="text-xs text-slate-500">SDRF, NDRF, and Medical Units stationed in Kamrup Metropolitan</p>
            </div>

            <div className="space-y-3">
              {DEMO_TEAMS.map((team) => (
                <div
                  key={team.id}
                  className="bg-slate-50 rounded-2xl border border-slate-200 p-3.5 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
                        <Truck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-slate-900">{team.name}</h4>
                        <p className="text-[11px] text-slate-500">{team.type}</p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase">
                      {team.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/80 text-slate-600">
                    <div>Base: <b className="text-slate-800">{team.base}</b></div>
                    <div>Capacity: <b className="text-slate-800">{team.capacity} persons</b></div>
                    <div>Crew: <b className="text-slate-800">{team.personnel} personnel</b></div>
                    <div>Radio: <b className="text-slate-800 font-mono">CH-07 (SDRF)</b></div>
                  </div>

                  <div className="pt-1 flex justify-end">
                    <button
                      onClick={() => onPanToLocation && onPanToLocation(team.lat, team.lon)}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline transition"
                    >
                      Locate Base on Map
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 3: SHELTERS ================= */}
        {activeTab === 'shelters' && (
          <div className="space-y-3.5">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Designated Relief Shelters</h3>
              <p className="text-xs text-slate-500">Government relief shelters in Kamrup Metropolitan</p>
            </div>

            <div className="space-y-3">
              {shelters.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl border border-slate-200">
                  Loading relief shelters...
                </div>
              ) : (
                shelters.map((s) => (
                  <div
                    key={`shelter-list-${s.id}`}
                    className="bg-slate-50 rounded-2xl border border-slate-200 p-3.5 space-y-2 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                          <Home className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-xs text-slate-900">{s.name}</h4>
                          <p className="text-[11px] text-slate-500">{s.district}</p>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 uppercase shrink-0">
                        {s.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/80 text-slate-600">
                      <div>Space: <b className="text-slate-800">{s.available_capacity} beds (DEMO)</b></div>
                      <div>Elevation: <b className="text-slate-800">{s.elevation_m}m</b></div>
                      <div>Emergency: <a href="tel:112" className="text-blue-600 underline font-semibold">112</a></div>
                      <div>Medical Post: <b className="text-slate-800">Yes</b></div>
                    </div>

                    <div className="pt-1 flex justify-end">
                      <button
                        onClick={() => onPanToLocation && onPanToLocation(s.lat, s.lon)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline transition"
                      >
                        Locate on Map
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: WHAT-IF SIMULATOR ================= */}
        {activeTab === 'whatif' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <CloudRain className="w-4 h-4 text-blue-600" />
                <span>What-If Flood Simulator</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Re-scores the 904 demo-area zones using the trained model.
              </p>
            </div>

            {/* Presets */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700">Predefined Rainfall Scenarios:</span>
              <div className="grid grid-cols-1 gap-2">
                {(presets.length > 0 ? presets : [
                  { id: 'monsoon_baseline', rain_7d_mm: 65, rain_15d_mm: 145, rain_30d_mm: 280 },
                  { id: 'heavy_monsoon_surge', rain_7d_mm: 180, rain_15d_mm: 320, rain_30d_mm: 520 },
                  { id: 'extreme_cloudburst', rain_7d_mm: 260, rain_15d_mm: 390, rain_30d_mm: 580 },
                  { id: 'catastrophic_century_flood', rain_7d_mm: 380, rain_15d_mm: 550, rain_30d_mm: 820 }
                ]).map((p) => {
                  const title = getCleanPresetName(p);
                  const isSelected = selectedPreset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleApplyPreset(p.id)}
                      className={`p-2.5 rounded-xl border text-left text-xs transition flex items-center justify-between ${
                        isSelected
                          ? 'bg-blue-50 border-blue-400 text-blue-950 font-semibold shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <span className="whitespace-normal leading-tight">{title}</span>
                      <span className="text-[10px] text-slate-500 shrink-0 font-mono ml-2">
                        7d {p.rain_7d_mm} mm
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sliders */}
            <form onSubmit={handleExecuteSimulation} className="space-y-4 pt-1">
              <div className="space-y-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Dynamic Precipitation Sliders</span>
                  <button
                    type="button"
                    onClick={handleResetSlidersAndScenario}
                    className="text-xs text-blue-600 hover:text-blue-800 underline font-medium"
                  >
                    Reset to baseline
                  </button>
                </div>

                {/* 7-day */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Rainfall in last 7 days</span>
                    <span className="font-bold font-mono text-slate-900">{rain7d} mm</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="500"
                    step="5"
                    value={rain7d}
                    onChange={(e) => handleRain7dChange(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>

                {/* 15-day */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Rainfall in last 15 days</span>
                    <span className="font-bold font-mono text-slate-900">{rain15d} mm</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="800"
                    step="5"
                    value={rain15d}
                    onChange={(e) => handleRain15dChange(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>

                {/* 30-day */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Rainfall in last 30 days</span>
                    <span className="font-bold font-mono text-slate-900">{rain30d} mm</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="1200"
                    step="10"
                    value={rain30d}
                    onChange={(e) => handleRain30dChange(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>

                {/* Out of training data warning */}
                {isOutsideTrainingData && (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>This is outside the data the model was trained on. Treat results with extra caution.</span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={simulationLoading}
                className="w-full min-h-[46px] bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-sm transition active:scale-[0.99]"
              >
                {simulationLoading ? (
                  <span>Re-scoring 904 zones with ML model...</span>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>Run Simulation</span>
                  </>
                )}
              </button>
            </form>

            {/* Results summary with SIMULATED badge */}
            {activeScenario?.isSimulated && simulationResult && (
              <div className="p-3.5 bg-amber-50/70 border border-amber-300 rounded-2xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">Simulation Outcome</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200 text-amber-900 border border-amber-400 uppercase">
                    SIMULATED
                  </span>
                </div>
                <div className="text-slate-700 space-y-1">
                  <div>• <b>{(simulationResult.zone_impact?.newly_high_risk_zones_count || 0) + (simulationResult.zone_impact?.newly_critical_zones_count || 0)}</b> zones moved to High or Critical</div>
                  <div>• <b>{simulationResult.shelter_impact?.compromised_shelters_count || 0}</b> shelters compromised</div>
                  <div>• <b>{simulationResult.sos_impact?.sos_in_elevated_risk_zones || 0}</b> demo SOS requests in High/Critical zones</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dispatch Rescue Modal */}
      {dispatchTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div>
              <h3 className="font-bold text-base text-slate-900">
                Dispatch Rescue Unit
              </h3>
              <p className="text-xs text-slate-500">
                Assign an emergency team to distress call #{dispatchTarget.id} ({dispatchTarget.citizen_name})
              </p>
            </div>

            <form onSubmit={handleDispatchSubmit} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Select Response Team</label>
                <select
                  value={assignedTeam}
                  onChange={(e) => setAssignedTeam(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-800"
                >
                  <option value="SDRF Boat Unit 1">SDRF Boat Unit 1 (Bharalumukh Ghat)</option>
                  <option value="SDRF Boat Unit 2">SDRF Boat Unit 2 (Pandu Port)</option>
                  <option value="NDRF Quick Response Team 4">NDRF Quick Response Team 4 (Khanapara)</option>
                  <option value="Civil Defense Paramedic Unit">Civil Defense Paramedic Unit (GMCH)</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 font-semibold">Estimated Arrival Time</span>
                  <span className="font-bold text-slate-900">{etaMin} minutes</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="90"
                  step="5"
                  value={etaMin}
                  onChange={(e) => setEtaMin(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                Note: This is a hackathon prototype demonstration. No actual emergency personnel will be alerted.
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDispatchTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
                >
                  Confirm Dispatch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
