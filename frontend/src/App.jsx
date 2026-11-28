import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import MapViewer from './components/MapViewer';
import CitizenPanel from './components/CitizenPanel';
import AuthorityPanel from './components/AuthorityPanel';
import SOSModal from './components/SOSModal';
import ZoneInspectorModal from './components/ZoneInspectorModal';
import WelcomeModal from './components/WelcomeModal';
import HowCalculatedModal from './components/HowCalculatedModal';

import {
  fetchHealth,
  fetchZones,
  fetchShelters,
  calculateRoute,
  recommendShelters,
  submitSOS,
  fetchSOSTriage,
  updateSOSStatus,
  fetchSimulationPresets,
  runSimulation
} from './api';

// Haversine distance in km
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Find nearest area risk properties from loaded GeoJSON
function findNearestAreaRisk(lat, lon, zonesGeoJSON) {
  if (!zonesGeoJSON?.features?.length) {
    return { risk_score: 0, risk_level: 'Low' };
  }
  let best = null;
  let bestDist = Infinity;
  for (const f of zonesGeoJSON.features) {
    const p = f.properties;
    if (p?.centroid_lat == null || p?.centroid_lon == null) continue;
    const d = (p.centroid_lat - lat) ** 2 + (p.centroid_lon - lon) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best || { risk_score: 0, risk_level: 'Low' };
}

export default function App() {
  const [activeTab, setActiveTab] = useState('citizen'); // 'citizen' | 'authority'
  const [health, setHealth] = useState(null);

  // Map spatial layers
  const [zonesGeoJSON, setZonesGeoJSON] = useState(null);
  const [baselineZonesGeoJSON, setBaselineZonesGeoJSON] = useState(null);
  const [mapCompareMode, setMapCompareMode] = useState('after'); // 'after' | 'before'
  const [shelters, setShelters] = useState([]);
  const [sosRequests, setSosRequests] = useState([]);
  const [routeData, setRouteData] = useState(null);
  const [selectedZone, setSelectedZone] = useState(null);
  const [recenterCoords, setRecenterCoords] = useState(null);

  // Citizen 3-step guided flow state
  const [citizenStep, setCitizenStep] = useState(1);
  const [userLocation, setUserLocation] = useState(null);
  const [userAreaRisk, setUserAreaRisk] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [shelterIndex, setShelterIndex] = useState(0);
  const [shelterError, setShelterError] = useState('');
  const [routeMode, setRouteMode] = useState('safe'); // 'safe' | 'shortest'
  const [routeError, setRouteError] = useState('');

  // Loading flags
  const [routingLoading, setRoutingLoading] = useState(false);
  const [shelterLoading, setShelterLoading] = useState(false);
  const [shelterRecommendations, setShelterRecommendations] = useState(null);

  // Authority state
  const [triageData, setTriageData] = useState(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [simulationPresets, setSimulationPresets] = useState([]);
  const [simulationResult, setSimulationResult] = useState(null);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [activeScenario, setActiveScenario] = useState({
    name: 'Demo scenario: moderate rainfall (assumed)',
    description: '65mm (7d) · 145mm (15d) · 280mm (30d)',
    isSimulated: false,
    rain7d: 65,
    rain15d: 145,
    rain30d: 280
  });

  // Modals
  const [isSOSModalOpen, setIsSOSModalOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(() => {
    try {
      return !localStorage.getItem('jaldhrishti_welcome_seen');
    } catch {
      return true;
    }
  });
  const [isHowCalculatedOpen, setIsHowCalculatedOpen] = useState(false);

  const handleCloseWelcome = () => {
    setIsWelcomeOpen(false);
    try {
      localStorage.setItem('jaldhrishti_welcome_seen', 'true');
    } catch {
      // Ignore storage errors
    }
  };

  // 1. Initial Data Loading on Mount
  useEffect(() => {
    async function initPlatform() {
      try {
        const h = await fetchHealth().catch(() => null);
        setHealth(h);

        const [zones, sList, triage, presets] = await Promise.all([
          fetchZones('Kamrup Metropolitan').catch(() => null),
          fetchShelters('Kamrup Metropolitan').catch(() => []),
          fetchSOSTriage().catch(() => null),
          fetchSimulationPresets().catch(() => [])
        ]);

        if (zones) {
          setZonesGeoJSON(zones);
          setBaselineZonesGeoJSON(zones);
        }
        setShelters(sList || []);
        if (triage) {
          setTriageData(triage);
          setSosRequests(triage.queue || []);
        }
        setSimulationPresets(presets || []);
      } catch (err) {
        console.error('Initial platform load error:', err);
      }
    }
    initPlatform();
  }, []);

  // Recompute user's area risk if scenario changes while userLocation is set
  useEffect(() => {
    if (userLocation && zonesGeoJSON) {
      setUserAreaRisk(findNearestAreaRisk(userLocation.lat, userLocation.lon, zonesGeoJSON));
    }
  }, [zonesGeoJSON, userLocation]);

  // Select location (from GPS, map tap, or quick place) and move to Step 2
  const handleSelectCitizenLocation = useCallback(
    (lat, lon, label = 'Selected location on map') => {
      setLocationError('');
      setShelterError('');
      setRouteError('');
      setRouteData(null);
      setShelterRecommendations(null);
      setShelterIndex(0);

      setUserLocation({ lat, lon, label });
      setUserAreaRisk(findNearestAreaRisk(lat, lon, zonesGeoJSON));
      setRecenterCoords([lat, lon]);
      setCitizenStep(2);
    },
    [zonesGeoJSON]
  );

  // Use browser GPS
  const handleUseCurrentLocation = () => {
    setLocationError('');
    if (!navigator.geolocation) {
      setLocationError(
        'Location is not supported by your browser. Please tap anywhere on the map or pick a place below.'
      );
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocationLoading(false);
        const { latitude, longitude } = pos.coords;
        const distFromGuwahati = distanceKm(latitude, longitude, 26.15, 91.75);
        if (distFromGuwahati > 80) {
          setLocationError(
            'Your GPS is outside the Guwahati demo area. Please tap on the map or pick a Guwahati place below.'
          );
          return;
        }
        handleSelectCitizenLocation(latitude, longitude, 'Your current location');
      },
      () => {
        setLocationLoading(false);
        setLocationError(
          'Could not get your GPS location. Please tap anywhere on the map or pick a place below.'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Step 2 -> Step 3: Find nearest safe shelters
  const handleFindCitizenShelters = async () => {
    if (!userLocation) return;
    setShelterLoading(true);
    setShelterError('');
    setRouteError('');
    setRouteData(null);
    setRouteMode('safe');
    setShelterIndex(0);

    try {
      const res = await recommendShelters(
        userLocation.lat,
        userLocation.lon,
        3,
        true,
        activeScenario.isSimulated ? activeScenario.rain7d : null,
        activeScenario.isSimulated ? activeScenario.rain15d : null,
        activeScenario.isSimulated ? activeScenario.rain30d : null,
        activeScenario.isSimulated
      );
      setShelterRecommendations(res);

      // Automatically show safe route for top shelter if available
      const top = res.recommended_shelters?.[0];
      if (top) {
        const r = await calculateRoute(
          userLocation.lat,
          userLocation.lon,
          top.lat,
          top.lon,
          15.0,
          activeScenario.isSimulated ? activeScenario.rain7d : null,
          activeScenario.isSimulated ? activeScenario.rain15d : null,
          activeScenario.isSimulated ? activeScenario.rain30d : null,
          activeScenario.isSimulated
        ).catch(() => null);
        if (r) {
          setRouteData(r);
          setRecenterCoords([(userLocation.lat + top.lat) / 2, (userLocation.lon + top.lon) / 2]);
        }
      }
      setCitizenStep(3);
    } catch {
      setShelterError(
        'Could not check shelters right now. Please try again in a moment.'
      );
    } finally {
      setShelterLoading(false);
    }
  };

  // Step 3: Show safest or shortest route for chosen shelter
  const handleShowCitizenRoute = async (shelter, mode) => {
    if (!userLocation || !shelter) return;
    setRoutingLoading(true);
    setRouteError('');
    setRouteMode(mode);

    const alpha = mode === 'shortest' ? 0.0 : 15.0;
    try {
      const res = await calculateRoute(
        userLocation.lat,
        userLocation.lon,
        shelter.lat,
        shelter.lon,
        alpha,
        activeScenario.isSimulated ? activeScenario.rain7d : null,
        activeScenario.isSimulated ? activeScenario.rain15d : null,
        activeScenario.isSimulated ? activeScenario.rain30d : null,
        activeScenario.isSimulated
      );
      setRouteData(res);
      setRecenterCoords([
        (userLocation.lat + shelter.lat) / 2,
        (userLocation.lon + shelter.lon) / 2
      ]);
    } catch {
      setRouteError(
        'Could not find a road path right now. Please try another shelter or check your connection.'
      );
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleNextShelter = () => {
    const list = shelterRecommendations?.recommended_shelters || [];
    if (!list.length) return;
    const nextIdx = (shelterIndex + 1) % list.length;
    setShelterIndex(nextIdx);
    handleShowCitizenRoute(list[nextIdx], 'safe');
  };

  const handleStartOver = () => {
    setCitizenStep(1);
    setUserLocation(null);
    setUserAreaRisk(null);
    setShelterRecommendations(null);
    setRouteData(null);
    setLocationError('');
    setShelterError('');
    setRouteError('');
    setShelterIndex(0);
    setRouteMode('safe');
  };

  // Authority: Safe Evacuation Route Calculation
  const handleCalculateRoute = async (startLat, startLon, endLat, endLon, alpha = 15.0) => {
    setRoutingLoading(true);
    try {
      const res = await calculateRoute(startLat, startLon, endLat, endLon, alpha);
      setRouteData(res);
      setRecenterCoords([(startLat + endLat) / 2, (startLon + endLon) / 2]);
    } catch (err) {
      alert(err.message || 'Failed to calculate route');
    } finally {
      setRoutingLoading(false);
    }
  };

  // Submit Citizen SOS
  const handleSubmitSOS = async (data) => {
    const res = await submitSOS(data);
    const updatedTriage = await fetchSOSTriage().catch(() => null);
    if (updatedTriage) {
      setTriageData(updatedTriage);
      setSosRequests(updatedTriage.queue || []);
    }
    setRecenterCoords([data.lat, data.lon]);
    return res;
  };

  // Update SOS Dispatch Lifecycle (Authority)
  const handleUpdateSOSStatus = async (id, status, assignedTeam, etaMin, notes) => {
    // 1. Immediate optimistic UI update of queue and summary numbers
    if (triageData?.queue) {
      const updatedQueue = triageData.queue.map((item) =>
        item.id === id
          ? { ...item, status, assigned_team: assignedTeam, estimated_eta_min: etaMin }
          : item
      );
      const pendingCount = updatedQueue.filter((x) => x.status?.toLowerCase() === 'pending').length;
      const peopleAtRisk = updatedQueue
        .filter((x) => x.status?.toLowerCase() === 'pending')
        .reduce((sum, x) => sum + (x.people_count || 1), 0);
      const medicalCount = updatedQueue.filter(
        (x) => x.status?.toLowerCase() === 'pending' && x.has_medical_emergency
      ).length;

      setTriageData({
        ...triageData,
        queue: updatedQueue,
        summary: {
          ...triageData.summary,
          pending_requests: pendingCount,
          total_people_at_risk: peopleAtRisk,
          medical_emergencies_pending: medicalCount
        }
      });
      setSosRequests(updatedQueue);
    }

    try {
      await updateSOSStatus(id, status, assignedTeam, etaMin, notes);
      const freshTriage = await fetchSOSTriage().catch(() => null);
      if (freshTriage) {
        setTriageData(freshTriage);
        setSosRequests(freshTriage.queue || []);
      }
    } catch (err) {
      console.error('Failed to update SOS status on backend:', err);
    }
  };

  // Execute What-If Flood Simulation (Authority)
  const handleRunSimulation = async (rain7d, rain15d, rain30d, scenarioName) => {
    setSimulationLoading(true);
    try {
      const res = await runSimulation(rain7d, rain15d, rain30d, scenarioName);
      setSimulationResult(res);

      const updatedZones = await fetchZones('Kamrup Metropolitan', rain7d, rain15d, rain30d, true);
      setZonesGeoJSON(updatedZones);
      setMapCompareMode('after');

      setActiveScenario({
        name: scenarioName || 'Simulated rainfall scenario',
        description: `7d ${rain7d} mm · 15d ${rain15d} mm · 30d ${rain30d} mm`,
        isSimulated: true,
        rain7d,
        rain15d,
        rain30d
      });
    } catch (err) {
      alert(err.message || 'Simulation failed');
    } finally {
      setSimulationLoading(false);
    }
  };

  const handleResetScenario = async () => {
    setSimulationLoading(true);
    try {
      const defaultZones = await fetchZones('Kamrup Metropolitan');
      setZonesGeoJSON(defaultZones);
      setBaselineZonesGeoJSON(defaultZones);
      setSimulationResult(null);
      setMapCompareMode('after');
      setActiveScenario({
        name: 'Demo scenario: moderate rainfall (assumed)',
        description: '7d 65 mm · 15d 145 mm · 30d 280 mm',
        isSimulated: false,
        rain7d: 65,
        rain15d: 145,
        rain30d: 280
      });
    } catch {
      alert('Failed to reset scenario');
    } finally {
      setSimulationLoading(false);
    }
  };

  const [selectedSOSId, setSelectedSOSId] = useState(null);

  const handleSelectSOS = (sosId) => {
    setSelectedSOSId(sosId);
    if (sosId) {
      const target = (triageData?.queue || sosRequests || []).find((s) => s.id === sosId);
      if (target) {
        setRecenterCoords([target.lat, target.lon, 15]);
      }
    }
  };

  const handlePanToLocation = (lat, lon, zoom = 15) => {
    setRecenterCoords([lat, lon, zoom]);
  };

  // Switch tabs and clear citizen state to fix route bleeding onto Authority view
  const handleSwitchTab = (tab) => {
    setActiveTab(tab);
    setSelectedSOSId(null);
    if (tab === 'authority') {
      setUserLocation(null);
      setRouteData(null);
      setShelterRecommendations(null);
      setUserAreaRisk(null);
      setCitizenStep(1);
      setLocationError('');
      setShelterError('');
      setRouteError('');
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden font-sans bg-slate-50 text-slate-900">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleSwitchTab}
        onOpenSOSModal={() => setIsSOSModalOpen(true)}
        onOpenHowToUse={() => setIsWelcomeOpen(true)}
      />

      {/* Authority View Summary Row: Full labels, no abbreviations */}
      {activeTab === 'authority' && (
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between flex-wrap gap-3 text-xs z-20 shrink-0 shadow-sm">
          <div className="flex items-center gap-6 sm:gap-8 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0"></span>
              <span className="text-slate-500 font-medium">Pending rescue:</span>
              <span className="font-bold text-slate-900 text-sm font-mono">
                {triageData?.summary?.pending_requests ?? 6}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span>
              <span className="text-slate-500 font-medium">People at risk:</span>
              <span className="font-bold text-slate-900 text-sm font-mono">
                {triageData?.summary?.total_people_at_risk ?? 31}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 shrink-0"></span>
              <span className="text-slate-500 font-medium">Medical emergencies:</span>
              <span className="font-bold text-slate-900 text-sm font-mono">
                {triageData?.summary?.medical_emergencies_pending ?? 1}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0"></span>
              <span className="text-slate-500 font-medium">Teams available (demo):</span>
              <span className="font-bold text-slate-900 text-sm font-mono">
                4 teams ready
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Layout: 400px panel for Authority view */}
      <div className="flex flex-col-reverse sm:flex-row flex-1 relative overflow-hidden">
        {/* Left / Bottom Control Panel */}
        <div className={`w-full ${activeTab === 'authority' ? 'sm:w-[400px]' : 'sm:w-[420px] lg:w-[460px]'} h-[58vh] sm:h-full shrink-0 z-20 shadow-lg`}>
          {activeTab === 'citizen' ? (
            <CitizenPanel
              step={citizenStep}
              onSetStep={setCitizenStep}
              userLocation={userLocation}
              locationLoading={locationLoading}
              locationError={locationError}
              onUseCurrentLocation={handleUseCurrentLocation}
              onSelectPlace={handleSelectCitizenLocation}
              userAreaRisk={userAreaRisk}
              onFindShelters={handleFindCitizenShelters}
              shelterRecommendations={shelterRecommendations}
              shelterIndex={shelterIndex}
              onNextShelter={handleNextShelter}
              shelterLoading={shelterLoading}
              shelterError={shelterError}
              routeData={routeData}
              routeMode={routeMode}
              routingLoading={routingLoading}
              routeError={routeError}
              onShowSafestRoute={(s) => handleShowCitizenRoute(s, 'safe')}
              onShowShortestRoute={(s) => handleShowCitizenRoute(s, 'shortest')}
              onOpenHowCalculated={() => setIsHowCalculatedOpen(true)}
              activeScenario={activeScenario}
              onStartOver={handleStartOver}
            />
          ) : (
            <AuthorityPanel
              triageData={triageData}
              triageLoading={triageLoading}
              onUpdateSOSStatus={handleUpdateSOSStatus}
              shelters={shelters}
              presets={simulationPresets}
              onRunSimulation={handleRunSimulation}
              onResetScenario={handleResetScenario}
              activeScenario={activeScenario}
              simulationResult={simulationResult}
              simulationLoading={simulationLoading}
              onPanToLocation={handlePanToLocation}
              selectedSOSId={selectedSOSId}
              onSelectSOS={handleSelectSOS}
            />
          )}
        </div>

        {/* Right / Top Map Canvas */}
        <div className="flex-1 h-[42vh] sm:h-full relative">
          <MapViewer
            viewMode={activeTab}
            zonesGeoJSON={mapCompareMode === 'before' && baselineZonesGeoJSON ? baselineZonesGeoJSON : zonesGeoJSON}
            shelters={shelters}
            recommendedShelters={shelterRecommendations?.recommended_shelters}
            sosRequests={sosRequests}
            routeData={routeData}
            routeMode={routeMode}
            userLocation={userLocation}
            userAreaRisk={userAreaRisk}
            onMapSelectLocation={(lat, lon) =>
              handleSelectCitizenLocation(lat, lon, 'Selected point on map')
            }
            onSelectZone={(props) => setSelectedZone(props)}
            recenterCoords={recenterCoords}
            activeScenario={activeScenario}
            simulationResult={simulationResult}
            mapCompareMode={mapCompareMode}
            onSetMapCompareMode={setMapCompareMode}
            onResetScenario={handleResetScenario}
            selectedSOSId={selectedSOSId}
            onSelectSOS={handleSelectSOS}
            onSetRouteEnd={(lat, lon) => {
              handleCalculateRoute(26.1812, 91.7510, lat, lon, 15.0);
            }}
          />

          {/* Zone Inspector Modal: Authority Mode Only */}
          {activeTab === 'authority' && (
            <ZoneInspectorModal
              zone={selectedZone}
              onClose={() => setSelectedZone(null)}
              onEvacuateFromZone={() => {}}
            />
          )}
        </div>
      </div>

      {/* Emergency SOS Modal */}
      <SOSModal
        isOpen={isSOSModalOpen}
        onClose={() => setIsSOSModalOpen(false)}
        onSubmitSOS={handleSubmitSOS}
      />

      {/* First-Visit 3-Screen Welcome Guide */}
      <WelcomeModal isOpen={isWelcomeOpen} onClose={handleCloseWelcome} />

      {/* How is this calculated? Modal */}
      <HowCalculatedModal
        isOpen={isHowCalculatedOpen}
        onClose={() => setIsHowCalculatedOpen(false)}
        activeScenario={activeScenario}
      />
    </div>
  );
}
