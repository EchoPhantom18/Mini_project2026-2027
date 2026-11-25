import React from 'react';
import { X, MapPin, Mountain, Waves, Compass, CloudRain, ShieldCheck } from 'lucide-react';

export default function ZoneInspectorModal({ zone, onClose, onEvacuateFromZone }) {
  if (!zone) return null;

  const risk = zone.risk_score || 0;
  let badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  if (risk >= 75) badgeColor = 'bg-red-500/20 text-red-400 border-red-500/30';
  else if (risk >= 50) badgeColor = 'bg-orange-500/20 text-orange-400 border-orange-500/30';
  else if (risk >= 25) badgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30';

  return (
    <div className="absolute top-4 left-4 z-[1000] bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl p-4 shadow-2xl max-w-sm w-full text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-cyan-400" />
          <h3 className="font-bold text-sm text-white">Zone {zone.zone_id}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Risk Score Pill */}
      <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 mb-3">
        <div>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
            Calibrated Risk Score
          </span>
          <span className="text-xl font-black text-white font-mono">
            {zone.risk_score} <span className="text-xs text-slate-500 font-normal">/ 100</span>
          </span>
        </div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${badgeColor}`}>
          {zone.risk_level}
        </span>
      </div>

      {/* Physical Features Grid (SRTM DEM, HydroRIVERS, CHIRPS) */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-800">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Mountain className="w-3 h-3 text-slate-400" />
            <span>Mean Elevation</span>
          </span>
          <span className="font-semibold text-slate-200 font-mono mt-0.5 block">
            {zone.elevation_mean?.toFixed(1)} m
          </span>
        </div>

        <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-800">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Mountain className="w-3 h-3 text-slate-400" />
            <span>Lowest Point</span>
          </span>
          <span className="font-semibold text-slate-200 font-mono mt-0.5 block">
            {zone.elevation_min?.toFixed(1)} m
          </span>
        </div>

        <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-800">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Waves className="w-3 h-3 text-cyan-400" />
            <span>River Proximity</span>
          </span>
          <span className="font-semibold text-cyan-400 font-mono mt-0.5 block">
            {zone.dist_to_river_m?.toFixed(0)} m
          </span>
        </div>

        <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-800">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <Compass className="w-3 h-3 text-slate-400" />
            <span>Terrain Slope</span>
          </span>
          <span className="font-semibold text-slate-200 font-mono mt-0.5 block">
            {zone.slope_mean?.toFixed(2)}°
          </span>
        </div>

        <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-800 col-span-2">
          <span className="text-[10px] text-slate-400 flex items-center gap-1">
            <CloudRain className="w-3 h-3 text-blue-400" />
            <span>Monsoon Rainfall Applied</span>
          </span>
          <span className="font-semibold text-blue-300 font-mono mt-0.5 block text-[11px]">
            7d: {zone.rain_7d_mm}mm · 15d: {zone.rain_15d_mm}mm · 30d: {zone.rain_30d_mm}mm
          </span>
        </div>
      </div>

      {onEvacuateFromZone && (
        <button
          onClick={() => onEvacuateFromZone(zone.centroid_lat, zone.centroid_lon)}
          className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-xs font-semibold shadow transition"
        >
          Set as Evacuation Origin
        </button>
      )}
    </div>
  );
}
