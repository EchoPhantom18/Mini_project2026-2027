import React, { useState, useMemo } from 'react';
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
  Check,
  Search,
  ArrowLeft,
  ChevronRight,
  Radio,
  ExternalLink
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
  teams = [],
  presets = [],
  onRunSimulation,
  onResetScenario,
  activeScenario,
  simulationResult,
  simulationLoading,
  onPanToLocation,
  selectedSOSId,
  onSelectSOS
}) {
  const [activeTab, setActiveTab] = useState('queue'); // 'queue' | 'teams' | 'shelters' | 'whatif'

  const activeTeams = teams && teams.length > 0 ? teams : DEMO_TEAMS;

  // SOS Queue filters & search
  const [statusFilter, setStatusFilter] = useState('Pending'); // 'Pending' | 'Dispatched' | 'Rescued' | 'all'
  const [searchQuery, setSearchQuery] = useState('');

  // Dispatch modal state
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [targetSOS, setTargetSOS] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState('SDRF Boat Unit 2');
  const [etaMinutes, setEtaMinutes] = useState(20);
  const [toastMessage, setToastMessage] = useState('');

  // Simulation state
  const [selectedPreset, setSelectedPreset] = useState('heavy_monsoon_surge');
  const [rain7d, setRain7d] = useState(180);
  const [rain15d, setRain15d] = useState(320);
  const [rain30d, setRain30d] = useState(520);
  const [scenarioName, setScenarioName] = useState('Heavy monsoon downpour (demo)');

  // Clean preset display names
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

  // Sort queue by urgency descending & apply status + search filters
  const sortedAndFilteredQueue = useMemo(() => {
    const rawQueue = triageData?.queue || [];

    // Always sort by urgency score descending
    const sorted = [...rawQueue].sort((a, b) => (b.urgency_score || 0) - (a.urgency_score || 0));

    return sorted.filter((item) => {
      // 1. Status Filter
      if (statusFilter !== 'all' && item.status.toLowerCase() !== statusFilter.toLowerCase()) {
        return false;
      }
      // 2. Search Query Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = item.citizen_name?.toLowerCase().includes(q);
        const noteMatch = (item.notes || item.message || '')?.toLowerCase().includes(q);
        const phoneMatch = item.phone?.toLowerCase().includes(q);
        const waterMatch = item.water_depth_level?.toLowerCase().includes(q);
        const specialMatch =
          (item.has_medical_emergency && 'medical'.includes(q)) ||
          (item.has_elderly && 'elderly'.includes(q)) ||
          (item.has_infants && 'infant'.includes(q));
        if (!nameMatch && !noteMatch && !phoneMatch && !waterMatch && !specialMatch) {
          return false;
        }
      }
      return true;
    });
  }, [triageData?.queue, statusFilter, searchQuery]);

  // Counts for filter pills
  const statusCounts = useMemo(() => {
    const queue = triageData?.queue || [];
    return {
      all: queue.length,
      pending: queue.filter((x) => x.status?.toLowerCase() === 'pending').length,
      dispatched: queue.filter((x) => x.status?.toLowerCase() === 'dispatched').length,
      rescued: queue.filter((x) => x.status?.toLowerCase() === 'rescued').length
    };
  }, [triageData?.queue]);

  // Active SOS item for detail view
  const activeSOS = useMemo(() => {
    if (!selectedSOSId) return null;
    return (triageData?.queue || []).find((x) => x.id === selectedSOSId) || null;
  }, [selectedSOSId, triageData?.queue]);

  // Handle clicking a compact row
  const handleRowClick = (item) => {
    if (onSelectSOS) onSelectSOS(item.id);
    if (onPanToLocation) onPanToLocation(item.lat, item.lon, 15);
  };

  // Open dispatch modal for specific SOS
  const handleOpenDispatch = (item) => {
    setTargetSOS(item);
    const currTeam = activeTeams.find((t) => t.name === selectedTeam);
    if (!currTeam || currTeam.status !== 'Available') {
      const avail = activeTeams.find((t) => t.status === 'Available');
      if (avail) setSelectedTeam(avail.name);
    }
    setDispatchModalOpen(true);
  };

  // Submit dispatch action
  const handleDispatchConfirm = async (e) => {
    e.preventDefault();
    const itemToDispatch = targetSOS || activeSOS;
    if (!itemToDispatch) return;

    await onUpdateSOSStatus(
      itemToDispatch.id,
      'Dispatched',
      selectedTeam,
      etaMinutes,
      'Emergency response unit dispatched'
    );

    setDispatchModalOpen(false);
    setTargetSOS(null);
    setToastMessage(`Dispatched ${selectedTeam} to #${itemToDispatch.id}`);
    setTimeout(() => setToastMessage(''), 3500);
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 text-slate-800 overflow-hidden font-sans">
      {/* Panel Header */}
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
        <div className="mx-3 mt-2 px-3 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm shrink-0">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="truncate">{toastMessage}</span>
        </div>
      )}

      {/* 4 Tabs: SOS Queue | Teams | Shelters | What-If */}
      <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-100/80 p-1 gap-1 text-xs font-semibold shrink-0">
        <button
          onClick={() => {
            setActiveTab('queue');
          }}
          className={`py-2 px-1 rounded-lg text-center transition flex items-center justify-center gap-1 ${
            activeTab === 'queue'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          <span>SOS Queue</span>
          {statusCounts.pending > 0 && (
            <span className="w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
              {statusCounts.pending}
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
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {/* ================= TAB 1: SOS QUEUE ================= */}
        {activeTab === 'queue' && (
          <div className="space-y-3">
            {/* If a specific SOS is clicked -> Show Detail Panel */}
            {activeSOS ? (
              <div className="space-y-3 animate-fade-in">
                {/* Back Link */}
                <button
                  type="button"
                  onClick={() => onSelectSOS && onSelectSOS(null)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 transition py-0.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to SOS Queue</span>
                </button>

                {/* Detail Card Header */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base text-slate-900">
                          #{activeSOS.id} · {activeSOS.citizen_name}
                        </h3>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            activeSOS.priority_level === 'Critical'
                              ? 'bg-red-100 text-red-800 border border-red-300'
                              : activeSOS.priority_level === 'High'
                              ? 'bg-orange-100 text-orange-800 border border-orange-300'
                              : activeSOS.priority_level === 'Moderate'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}
                        >
                          {activeSOS.priority_level}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                            activeSOS.status === 'Pending'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : activeSOS.status === 'Dispatched'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          }`}
                        >
                          {activeSOS.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Phone: <span className="font-mono text-slate-800 font-semibold">{maskPhone(activeSOS.phone)}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-2xl font-extrabold text-red-600 font-mono leading-none">
                        {Math.round(activeSOS.urgency_score)}
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase font-semibold">
                        Urgency (demo)
                      </span>
                    </div>
                  </div>

                  {/* Physical Situation Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap text-xs pt-1 border-t border-slate-200">
                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                      Water: {activeSOS.water_depth_level}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                      People: {activeSOS.people_count}
                    </span>
                    {activeSOS.has_medical_emergency && (
                      <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-300 font-semibold">
                        Medical Emergency
                      </span>
                    )}
                    {activeSOS.has_infants && (
                      <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-300 font-semibold">
                        Infant Present
                      </span>
                    )}
                    {activeSOS.has_elderly && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 font-semibold">
                        Elderly Present
                      </span>
                    )}
                  </div>

                  {/* Full Distress Note */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-700">Citizen Distress Message:</span>
                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs text-slate-700 italic leading-relaxed">
                      "{activeSOS.notes || activeSOS.message || 'No additional note provided.'}"
                    </div>
                  </div>

                  {/* Nearest Designated Shelter */}
                  <div className="space-y-1.5 pt-1 border-t border-slate-200">
                    <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                      <Home className="w-3.5 h-3.5 text-blue-600" />
                      <span>Nearest Evacuation Shelter:</span>
                    </span>
                    <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-1 text-xs">
                      <div className="font-bold text-slate-900">
                        {activeSOS.nearest_shelter?.name || 'Nehru Stadium Sports Pavilion (Ulubari)'}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-slate-600 text-[11px] pt-1">
                        <div>
                          Distance: <b>{activeSOS.nearest_shelter?.distance_km || 1.4} km</b>
                        </div>
                        <div>
                          Space: <b>{activeSOS.nearest_shelter?.available_capacity || 400} beds (DEMO)</b>
                        </div>
                        <div>
                          Status: <span className="font-semibold text-emerald-600">Active</span>
                        </div>
                        <div>
                          Emergency: <a href="tel:112" className="text-blue-600 underline font-semibold">112</a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dispatch / Status Actions */}
                  <div className="pt-2 space-y-2">
                    {activeSOS.status === 'Pending' && (
                      <button
                        type="button"
                        onClick={() => handleOpenDispatch(activeSOS)}
                        className="w-full min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition active:scale-[0.99] flex items-center justify-center gap-2"
                      >
                        <Truck className="w-4 h-4" />
                        <span>Dispatch team (demo)</span>
                      </button>
                    )}

                    {activeSOS.status === 'Dispatched' && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-300 text-xs text-amber-900 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Truck className="w-4 h-4 text-amber-700 shrink-0" />
                          <div>
                            <p className="font-bold">Team Dispatched</p>
                            <p className="text-[11px] text-amber-800">
                              {activeSOS.assigned_team || 'SDRF Boat Unit 2'} · ETA: {activeSOS.estimated_eta_min || 20} min
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenDispatch(activeSOS)}
                          className="text-[11px] text-blue-700 underline font-semibold shrink-0"
                        >
                          Reassign
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onPanToLocation && onPanToLocation(activeSOS.lat, activeSOS.lon, 15)}
                      className="w-full min-h-[38px] bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
                    >
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      <span>Zoom to Marker on Map</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* ================= COMPACT QUEUE LIST ================= */
              <div className="space-y-2.5">
                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name, phone, needs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Filters: Pending / Dispatched / Rescued / All */}
                <div className="flex items-center gap-1 text-xs overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('Pending')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
                      statusFilter === 'Pending'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>Pending</span>
                    <span className="text-[10px] opacity-80">({statusCounts.pending})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('Dispatched')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
                      statusFilter === 'Dispatched'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>Dispatched</span>
                    <span className="text-[10px] opacity-80">({statusCounts.dispatched})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('Rescued')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
                      statusFilter === 'Rescued'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>Rescued</span>
                    <span className="text-[10px] opacity-80">({statusCounts.rescued})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
                      statusFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>All</span>
                    <span className="text-[10px] opacity-80">({statusCounts.all})</span>
                  </button>
                </div>

                {/* Queue Cards: At least 5 rows visible without scrolling */}
                <div className="space-y-1.5">
                  {sortedAndFilteredQueue.length === 0 ? (
                    <div className="p-8 text-center text-slate-500 text-xs bg-slate-50 rounded-xl border border-slate-200">
                      No calls matching "{searchQuery || statusFilter}".
                    </div>
                  ) : (
                    sortedAndFilteredQueue.map((item) => {
                      const isSelected = selectedSOSId === item.id;
                      const noteText = item.notes || item.message || 'Distress call registered';

                      return (
                        <div
                          key={`compact-row-${item.id}`}
                          onClick={() => handleRowClick(item)}
                          className={`px-3 py-2 rounded-xl border transition cursor-pointer text-xs ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50/80 ring-1 ring-blue-500 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-blue-400 hover:bg-slate-50/90 shadow-2xs'
                          }`}
                        >
                          {/* Line 1: name, urgency number, priority chip */}
                          <div className="flex items-center justify-between gap-1.5 leading-snug">
                            <span className="font-bold text-slate-900 truncate">
                              #{item.id} · {item.citizen_name}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                  item.priority_level === 'Critical'
                                    ? 'bg-red-100 text-red-800 border border-red-300'
                                    : item.priority_level === 'High'
                                    ? 'bg-orange-100 text-orange-800 border border-orange-300'
                                    : item.priority_level === 'Moderate'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}
                              >
                                {item.priority_level}
                              </span>
                              <span className="font-extrabold text-sm text-red-600 font-mono">
                                {Math.round(item.urgency_score)}
                              </span>
                            </div>
                          </div>

                          {/* Line 2: people, water depth, special needs */}
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-600 mt-0.5 truncate leading-tight">
                            <span>{item.people_count} {item.people_count === 1 ? 'person' : 'people'}</span>
                            <span className="text-slate-300">•</span>
                            <span className="font-medium text-slate-700">{item.water_depth_level} water</span>
                            <span className="text-slate-300">•</span>
                            <span className="truncate">
                              {item.has_medical_emergency
                                ? 'Medical'
                                : item.has_infants
                                ? 'Infant'
                                : item.has_elderly
                                ? 'Elderly'
                                : 'Standard'}
                            </span>
                            {item.status === 'Dispatched' && (
                              <span className="text-[10px] text-blue-700 font-semibold shrink-0 ml-auto">
                                Dispatched
                              </span>
                            )}
                          </div>

                          {/* Line 3: one-line note */}
                          <p className="text-[11px] text-slate-500 italic truncate mt-0.5 leading-tight">
                            "{noteText}"
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 2: TEAMS ================= */}
        {activeTab === 'teams' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Assam Emergency Response Teams</h3>
                <p className="text-xs text-slate-500">SDRF, NDRF, and Medical Units stationed in Kamrup Metropolitan</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase shrink-0">
                DEMO
              </span>
            </div>

            <div className="space-y-3">
              {activeTeams.map((team) => {
                const isDispatched = team.status === 'Dispatched';
                return (
                  <div
                    key={team.id}
                    className={`bg-slate-50 rounded-2xl border ${
                      isDispatched ? 'border-blue-300 bg-blue-50/20' : 'border-slate-200'
                    } p-3.5 space-y-2.5 shadow-sm transition`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isDispatched ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {team.type.toLowerCase().includes('boat') ? (
                            <LifeBuoy className="w-4 h-4" />
                          ) : team.type.toLowerCase().includes('paramedic') || team.type.toLowerCase().includes('ambulance') ? (
                            <Activity className="w-4 h-4" />
                          ) : (
                            <Truck className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-xs text-slate-900">{team.name}</h4>
                            <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase">
                              DEMO
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">{team.type}</p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ${
                          isDispatched
                            ? 'bg-blue-100 text-blue-800 border-blue-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        {team.status}
                      </span>
                    </div>

                    {/* Assigned Request info */}
                    {isDispatched ? (
                      <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs flex items-center justify-between gap-2">
                        <div className="text-blue-900 text-[11px]">
                          <span className="font-medium text-slate-600">Assigned to: </span>
                          <b className="font-bold text-blue-950">SOS #{team.assignedRequestId}</b>
                          {team.assignedCitizenName && (
                            <span className="text-blue-800"> ({team.assignedCitizenName})</span>
                          )}
                        </div>
                        {team.assignedRequestId && (
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('queue');
                              if (onSelectSOS) onSelectSOS(team.assignedRequestId);
                            }}
                            className="text-[11px] font-bold text-blue-700 hover:text-blue-900 underline shrink-0"
                          >
                            View in Queue
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500 italic bg-white/70 px-2.5 py-1.5 rounded-xl border border-slate-200/60">
                        Available · Staged at base for deployment
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/80 text-slate-600">
                      <div>Base: <b className="text-slate-800">{team.base}</b></div>
                      <div>Capacity: <b className="text-slate-800">{team.capacity} persons</b></div>
                      <div>Crew: <b className="text-slate-800">{team.personnel} personnel</b></div>
                      <div>Radio: <b className="text-slate-800 font-mono">CH-07 (SDRF)</b></div>
                    </div>

                    <div className="pt-0.5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onPanToLocation && onPanToLocation(team.lat, team.lon, 15)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline flex items-center gap-1 transition"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Locate Base on Map</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= TAB 3: SHELTERS ================= */}
        {activeTab === 'shelters' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between pb-1">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Designated Relief Shelters</h3>
                <p className="text-xs text-slate-500">Government relief shelters in Kamrup Metropolitan</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase shrink-0">
                DEMO
              </span>
            </div>

            <div className="space-y-3">
              {shelters.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl border border-slate-200">
                  Loading relief shelters...
                </div>
              ) : (
                shelters.map((s) => {
                  const capacity = s.capacity || 100;
                  const occupancy = s.current_occupancy || 0;
                  const occPct = Math.min(100, Math.round((occupancy / capacity) * 100));
                  const barColor = occPct >= 85 ? 'bg-red-500' : occPct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';

                  return (
                    <div
                      key={`shelter-list-${s.id}`}
                      onClick={() => onPanToLocation && onPanToLocation(s.lat, s.lon, 15)}
                      className="bg-slate-50 hover:bg-white rounded-2xl border border-slate-200 hover:border-blue-400 p-3.5 space-y-2.5 shadow-sm hover:shadow-md cursor-pointer transition group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-100 group-hover:bg-blue-100 flex items-center justify-center text-emerald-700 group-hover:text-blue-700 shrink-0 transition">
                            <Home className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-xs text-slate-900 group-hover:text-blue-700 transition">
                              {s.name}
                            </h4>
                            <p className="text-[11px] text-slate-500">{s.district}</p>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ${
                            s.status?.toLowerCase() === 'full'
                              ? 'bg-red-100 text-red-800 border-red-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>

                      {/* Occupancy Progress Bar */}
                      <div className="space-y-1 bg-white/90 p-2 rounded-xl border border-slate-200/80">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-600 font-medium text-[11px]">Occupancy</span>
                          <span className="font-bold text-slate-800 font-mono text-[11px]">
                            {occupancy} / {capacity} beds ({occPct}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${barColor} rounded-full transition-all duration-300`}
                            style={{ width: `${occPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Specs with capacity labeled DEMO */}
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200/80 text-slate-600">
                        <div>
                          Capacity:{' '}
                          <b className="text-slate-800">{capacity} beds</b>{' '}
                          <span className="text-[9px] font-bold text-amber-800 bg-amber-100 px-1 py-0.2 rounded border border-amber-300">
                            DEMO
                          </span>
                        </div>
                        <div>Elevation: <b className="text-slate-800">{s.elevation_m}m</b></div>
                        <div>Available: <b className="text-emerald-700">{s.available_capacity || (capacity - occupancy)} beds</b></div>
                        <div>Emergency: <a href="tel:112" onClick={(e) => e.stopPropagation()} className="text-blue-600 underline font-semibold">112</a></div>
                      </div>

                      <div className="pt-0.5 flex justify-end">
                        <span className="text-xs font-semibold text-blue-600 group-hover:text-blue-800 group-hover:underline flex items-center gap-1 transition">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Click to zoom on map</span>
                        </span>
                      </div>
                    </div>
                  );
                })
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

      {/* Dispatch Modal (Select Team & ETA) */}
      {dispatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div>
              <h3 className="font-bold text-base text-slate-900">
                Dispatch Emergency Team
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Assign a dedicated response unit to distress call #{(targetSOS || activeSOS)?.id} ({(targetSOS || activeSOS)?.citizen_name})
              </p>
            </div>

            <form onSubmit={handleDispatchConfirm} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Assign Demo Unit:</label>
                <div className="space-y-1.5">
                  {activeTeams.map((t) => {
                    const isAvail = t.status === 'Available';
                    return (
                      <label
                        key={t.id}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer text-xs transition ${
                          selectedTeam === t.name
                            ? 'border-blue-500 bg-blue-50/70 text-blue-950 font-semibold shadow-xs'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="assignedTeam"
                            value={t.name}
                            checked={selectedTeam === t.name}
                            onChange={(e) => setSelectedTeam(e.target.value)}
                            className="accent-blue-600"
                          />
                          <div>
                            <p className="font-bold">{t.name}</p>
                            <p className="text-[10px] text-slate-500">{t.base} · {t.capacity} cap</p>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase ${
                            isAvail
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                              : 'text-blue-700 bg-blue-50 border-blue-200'
                          }`}
                        >
                          {t.status}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600 font-semibold">Estimated Arrival Time</span>
                  <span className="font-bold text-slate-900 font-mono">{etaMinutes} mins</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={etaMinutes}
                  onChange={(e) => setEtaMinutes(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div className="p-2 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500">
                Demo notice: Updates the operational triage status without notifying real-world emergency services.
              </div>

              <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setDispatchModalOpen(false);
                    setTargetSOS(null);
                  }}
                  className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition active:scale-95"
                >
                  Confirm Dispatch (demo)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
