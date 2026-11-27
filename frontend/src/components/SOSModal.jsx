import React, { useState } from 'react';
import { AlertOctagon, X, LifeBuoy, MapPin, Users, HeartPulse, ShieldAlert } from 'lucide-react';

export default function SOSModal({ isOpen, onClose, onSubmitSOS }) {
  const [citizenName, setCitizenName] = useState('');
  const [phone, setPhone] = useState('');
  const [lat, setLat] = useState('26.1554');
  const [lon, setLon] = useState('91.6631');
  const [peopleCount, setPeopleCount] = useState(2);
  const [waterDepth, setWaterDepth] = useState('Chest');
  const [hasElderly, setHasElderly] = useState(false);
  const [hasInfants, setHasInfants] = useState(false);
  const [hasMedical, setHasMedical] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submittedResult, setSubmittedResult] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await onSubmitSOS({
        citizen_name: citizenName,
        phone,
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        people_count: parseInt(peopleCount, 10),
        water_depth_level: waterDepth,
        has_elderly: hasElderly,
        has_infants: hasInfants,
        has_medical_emergency: hasMedical,
        notes: notes || undefined,
        is_simulated: false
      });
      setSubmittedResult(res);
    } catch (err) {
      alert(err.message || 'Failed to submit SOS');
    } finally {
      setLoading(false);
    }
  };

  const handleUseCurrentGPS = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude.toFixed(4));
          setLon(pos.coords.longitude.toFixed(4));
        },
        () => {
          // Default to central Guwahati if GPS denied
          setLat('26.1554');
          setLon('91.6631');
        }
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-red-600/90 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-5 h-5 animate-pulse" />
            <h3 className="font-bold text-base">Emergency SOS Rescue Request</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-red-700/80 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300">
          {submittedResult ? (
            <div className="text-center py-6 space-y-3">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <LifeBuoy className="w-8 h-8" />
              </div>
              <h4 className="font-bold text-base text-white">Distress Call Registered</h4>
              <p className="text-slate-400 text-xs">
                Your emergency call has been logged with State Disaster Response (SDRF / NDRF).
              </p>
              <div className="bg-slate-800/80 p-3.5 rounded-xl border border-slate-700 text-left space-y-1.5 font-mono text-[11px]">
                <div>Request ID: <span className="text-white font-bold">#{submittedResult.id}</span></div>
                <div>Calculated Urgency: <span className="text-red-400 font-bold">{submittedResult.urgency_score}/100</span></div>
                <div>Status: <span className="text-amber-400 font-bold">{submittedResult.status}</span></div>
                <div>Water Level: <span className="text-cyan-400">{submittedResult.water_depth_level}</span></div>
              </div>
              <button
                onClick={() => {
                  setSubmittedResult(null);
                  onClose();
                }}
                className="mt-3 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition"
              >
                Close Window
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-200 block mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramen Boro"
                    value={citizenName}
                    onChange={(e) => setCitizenName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-200 block mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    placeholder="+91-98640-XXXXX"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              {/* GPS Coordinates */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-200">GPS Coordinates (Lat / Lon)</label>
                  <button
                    type="button"
                    onClick={handleUseCurrentGPS}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Auto-detect GPS</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={lat}
                    onChange={(e) => setLat(e.target.value)}
                    placeholder="Latitude"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={lon}
                    onChange={(e) => setLon(e.target.value)}
                    placeholder="Longitude"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Water Depth & Group Size */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-200 block mb-1">Water Depth Level</label>
                  <select
                    value={waterDepth}
                    onChange={(e) => setWaterDepth(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="Ankle">Ankle Depth (~0.2m)</option>
                    <option value="Knee">Knee Depth (~0.5m)</option>
                    <option value="Waist">Waist Depth (~1.0m)</option>
                    <option value="Chest">Chest Depth (~1.4m)</option>
                    <option value="Submerged">Submerged / On Roof</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-200 block mb-1">People Trapped</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={peopleCount}
                    onChange={(e) => setPeopleCount(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Vulnerabilities */}
              <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/80 space-y-2">
                <span className="font-semibold text-slate-200 block">Vulnerable Individuals Trapped:</span>
                <div className="grid grid-cols-1 gap-1.5 text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasMedical}
                      onChange={(e) => setHasMedical(e.target.checked)}
                      className="rounded accent-red-600 w-4 h-4"
                    />
                    <span className="text-red-400 font-semibold">Critical Medical Emergency (Injury, Oxygen, Insulin)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasInfants}
                      onChange={(e) => setHasInfants(e.target.checked)}
                      className="rounded accent-red-600 w-4 h-4"
                    />
                    <span>Infants / Small Children Present</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasElderly}
                      onChange={(e) => setHasElderly(e.target.checked)}
                      className="rounded accent-red-600 w-4 h-4"
                    />
                    <span>Elderly Persons with Limited Mobility</span>
                  </label>
                </div>
              </div>

              {/* Distress Notes */}
              <div>
                <label className="font-semibold text-slate-200 block mb-1">Additional Notes / Landmarks</label>
                <textarea
                  rows="2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Near Kaliram Baruah School, trapped on 1st floor terrace"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg shadow-red-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {loading ? (
                  <span>Broadcasting Emergency Request...</span>
                ) : (
                  <>
                    <AlertOctagon className="w-4 h-4" />
                    <span>Send Distress Call (Broadcast to NDRF/SDRF)</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
