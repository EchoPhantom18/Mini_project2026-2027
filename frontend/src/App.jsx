import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import MapViewer from './components/MapViewer';
import CitizenPanel from './components/CitizenPanel';
import AuthorityPanel from './components/AuthorityPanel';
import SOSModal from './components/SOSModal';
import ZoneInspectorModal from './components/ZoneInspectorModal';

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

  // Modals
  const [isSOSModalOpen, setIsSOSModalOpen] = useState(false);

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
        console.error("Initial platform load error:", err);
      }
    }
    initPlatform();
  }, []);

  // 2. Safe Evacuation Route Calculation
  const handleCalculateRoute = async (startLat, startLon, endLat, endLon, alpha = 15.0) => {
    setRoutingLoading(true);
    try {
      const res = await calculateRoute(startLat, startLon, endLat, endLon, alpha);
      setRouteData(res);
      // Center map between start and end
      setRecenterCoords([(startLat + endLat) / 2, (startLon + endLon) / 2]);
    } catch (err) {
      alert(err.message || "Failed to calculate route");
    } finally {
      setRoutingLoading(false);
    }
  };

  // 3. Shelter Recommendations
  const handleRecommendShelters = async (lat, lon) => {
    setShelterLoading(true);
    try {
      const res = await recommendShelters(lat, lon, 3, true);
      setShelterRecommendations(res);
      if (res.recommended_shelters?.[0]?.route_to_shelter?.geojson) {
        // If route to top shelter exists, display it on map
        setRecenterCoords([lat, lon]);
      }
    } catch (err) {
      alert(err.message || "Failed to recommend shelters");
    } finally {
      setShelterLoading(false);
    }
  };

  // 4. Submit Citizen SOS
  const handleSubmitSOS = async (data) => {
    const res = await submitSOS(data);
    // Refresh triage list
    const updatedTriage = await fetchSOSTriage().catch(() => null);
    if (updatedTriage) {
      setTriageData(updatedTriage);
      setSosRequests(updatedTriage.queue || []);
    }
    setRecenterCoords([data.lat, data.lon]);
    return res;
  };

  // 5. Update SOS Dispatch Lifecycle
  const handleUpdateSOSStatus = async (id, status, assignedTeam, etaMin, notes) => {
    try {
      await updateSOSStatus(id, status, assignedTeam, etaMin, notes);
      const updatedTriage = await fetchSOSTriage();
      setTriageData(updatedTriage);
      setSosRequests(updatedTriage.queue || []);
    } catch (err) {
      alert(err.message || "Failed to update SOS status");
    }
  };

  // 6. Execute What-If Flood Simulation
  const handleRunSimulation = async (rain7d, rain15d, rain30d, scenarioName) => {
    setSimulationLoading(true);
    try {
      const res = await runSimulation(rain7d, rain15d, rain30d, scenarioName);
      setSimulationResult(res);

      // Re-fetch zones with simulated rainfall to instantly recolor the map!
      const updatedZones = await fetchZones('Kamrup Metropolitan', rain7d, rain15d, rain30d, true);
      setZonesGeoJSON(updatedZones);
    } catch (err) {
      alert(err.message || "Simulation failed");
    } finally {
      setSimulationLoading(false);
    }
  };

  // 7. Pan to Location
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
      />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 relative overflow-hidden">
        {/* Left Control Panel (Responsive Drawer) */}
        <div className="w-full sm:w-[420px] lg:w-[460px] h-full shrink-0 z-20 shadow-2xl">
          {activeTab === 'citizen' ? (
            <CitizenPanel
              onCalculateRoute={handleCalculateRoute}
              routeData={routeData}
              routingLoading={routingLoading}
              onRecommendShelters={handleRecommendShelters}
              shelterRecommendations={shelterRecommendations}
              shelterLoading={shelterLoading}
              onOpenSOSModal={() => setIsSOSModalOpen(true)}
            />
          ) : (
            <AuthorityPanel
              triageData={triageData}
              triageLoading={triageLoading}
              onUpdateSOSStatus={handleUpdateSOSStatus}
              presets={simulationPresets}
              onRunSimulation={handleRunSimulation}
              simulationResult={simulationResult}
              simulationLoading={simulationLoading}
              onPanToLocation={handlePanToLocation}
            />
          )}
        </div>

        {/* Right Map Canvas (Leaflet) */}
        <div className="flex-1 h-full relative">
          <MapViewer
            zonesGeoJSON={zonesGeoJSON}
            shelters={shelters}
            sosRequests={sosRequests}
            routeData={routeData}
            selectedZone={selectedZone}
            onSelectZone={(props) => setSelectedZone(props)}
            recenterCoords={recenterCoords}
            onSetRouteStart={(lat, lon, name) => {
              // Quick helper
            }}
            onSetRouteEnd={(lat, lon, name) => {
              // Evacuate from Paltan Bazaar to this shelter
              handleCalculateRoute(26.1812, 91.7510, lat, lon, 15.0);
            }}
          />

          {/* Floating Zone Inspector Overlay */}
          <ZoneInspectorModal
            zone={selectedZone}
            onClose={() => setSelectedZone(null)}
            onEvacuateFromZone={(lat, lon) => {
              // Evacuate from selected zone to nearest shelter
              handleRecommendShelters(lat, lon);
            }}
          />
        </div>
      </div>

      {/* Emergency SOS Modal */}
      <SOSModal
        isOpen={isSOSModalOpen}
        onClose={() => setIsSOSModalOpen(false)}
        onSubmitSOS={handleSubmitSOS}
      />
    </div>
  );
}
