import React from 'react';
import { ShieldAlert, Users, Radio, AlertOctagon, HelpCircle } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, health, onOpenSOSModal, onOpenHowToUse }) {
  return (
    <header className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 z-30 shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
          <ShieldAlert className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg tracking-tight text-white">
              JALDHRISHTI
            </h1>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
              DEMO
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden lg:block">
            Flood Safety & Safe Evacuation · Assam
          </p>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800 shadow-inner">
        <button
          onClick={() => setActiveTab('citizen')}
          className={`flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg text-sm font-medium transition-all ${
            activeTab === 'citizen'
              ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md shadow-blue-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Citizen</span>
        </button>

        <button
          onClick={() => setActiveTab('authority')}
          className={`flex items-center gap-1.5 px-3 min-h-[40px] rounded-lg text-sm font-medium transition-all ${
            activeTab === 'authority'
              ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-purple-500/20'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Radio className="w-4 h-4" />
          <span>Authority</span>
        </button>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* How to use (?) button */}
        <button
          onClick={onOpenHowToUse}
          className="flex items-center gap-1.5 px-3 min-h-[48px] bg-slate-800 hover:bg-slate-700 text-slate-100 text-base font-medium rounded-xl border border-slate-700 transition"
          title="How to use this app"
          aria-label="How to use"
        >
          <HelpCircle className="w-5 h-5 text-blue-400" />
          <span className="hidden sm:inline">How to use</span>
        </button>

        {/* SOS Quick Button */}
        <button
          onClick={onOpenSOSModal}
          className="flex items-center gap-1.5 px-3.5 min-h-[48px] bg-red-600 hover:bg-red-500 text-white text-base font-semibold rounded-xl shadow-lg shadow-red-600/30 transition-all active:scale-95"
        >
          <AlertOctagon className="w-5 h-5" />
          <span>SOS</span>
        </button>

        {/* Model Badge: Authority View Only */}
        {activeTab === 'authority' && (
          <div
            className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs shadow-sm cursor-help"
            title="Model: Calibrated Random Forest (5-fold District GroupKFold) | Training Period: 2000–2018 MODIS flood events"
          >
            {health?.status === 'healthy' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-slate-200 font-semibold">Random Forest v1.0</span>
                  <span className="text-[10px] text-slate-400">20,464 statewide zones</span>
                </div>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span className="text-amber-400 font-medium">Connecting...</span>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
