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

        if (zones) setZonesGeoJSON(zones);
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
    try {
      await updateSOSStatus(id, status, assignedTeam, etaMin, notes);
      const updatedTriage = await fetchSOSTriage();
      setTriageData(updatedTriage);
      setSosRequests(updatedTriage.queue || []);
    } catch (err) {
      alert(err.message || 'Failed to update SOS status');
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

      setActiveScenario({
        name: scenarioName || 'Simulated Monsoon Surge',
        description: `${rain7d}mm (7d) · ${rain15d}mm (15d) · ${rain30d}mm (30d)`,
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
      setSimulationResult(null);
      setActiveScenario({
        name: 'Demo scenario: moderate rainfall (assumed)',
        description: '65mm (7d) · 145mm (15d) · 280mm (30d)',
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

  const handlePanToLocation = (lat, lon) => {
    setRecenterCoords([lat, lon]);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        onOpenSOSModal={() => setIsSOSModalOpen(true)}
        onOpenHowToUse={() => setIsWelcomeOpen(true)}
      />

      {/* Main Workspace Layout: Mobile-first (map top, panel bottom on mobile; side-by-side on desktop) */}
      <div className="flex flex-col-reverse sm:flex-row flex-1 relative overflow-hidden">
        {/* Left / Bottom Control Panel */}
        <div className="w-full sm:w-[420px] lg:w-[460px] h-[58vh] sm:h-full shrink-0 z-20 shadow-2xl">
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
              presets={simulationPresets}
              onRunSimulation={handleRunSimulation}
              onResetScenario={handleResetScenario}
              activeScenario={activeScenario}
              simulationResult={simulationResult}
              simulationLoading={simulationLoading}
              onPanToLocation={handlePanToLocation}
            />
          )}
        </div>

        {/* Right / Top Map Canvas */}
        <div className="flex-1 h-[42vh] sm:h-full relative">
          <MapViewer
            viewMode={activeTab}
            zonesGeoJSON={zonesGeoJSON}
            shelters={shelters}
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
            onResetScenario={handleResetScenario}
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
