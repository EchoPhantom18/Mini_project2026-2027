import React from 'react';
import { ShieldAlert, Users, Radio, CloudRain, CheckCircle2, AlertOctagon } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, health, onOpenSOSModal }) {
  return (
    <header className="bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-2.5 flex items-center justify-between z-30 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <ShieldAlert className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              JALDHRISHTI
            </h1>
            <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Team Enigma
            </span>
            <span className="text-[10px] font-medium tracking-wide uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              SIH Prototype
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">
            AI/ML Flood Risk Prediction & Safe Evacuation Routing · Assam
          </p>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 shadow-inner">
        <button
          onClick={() => setActiveTab('citizen')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'citizen'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Citizen Portal</span>
        </button>

        <button
          onClick={() => setActiveTab('authority')}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'authority'
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-purple-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>Authority Command</span>
        </button>
      </div>

      {/* Right Actions & Health Status */}
      <div className="flex items-center gap-2.5">
        {/* SOS Quick Button for Citizens */}
        <button
          onClick={onOpenSOSModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-red-600/30 transition-all hover:scale-105 active:scale-95 animate-pulse"
        >
          <AlertOctagon className="w-4 h-4" />
          <span>Emergency SOS</span>
        </button>

        {/* Backend Health Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs">
          {health?.status === 'healthy' ? (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-emerald-400 font-medium">Model Ready</span>
              <span className="text-slate-500 text-[11px]">({health.total_grid_zones} zones)</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span className="text-amber-400 font-medium">Connecting...</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
