import React from 'react';
import { ShieldAlert, AlertOctagon, HelpCircle } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab, onOpenSOSModal, onOpenHowToUse }) {
  const isCitizen = activeTab === 'citizen';

  return (
    <header className="px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 z-30 shrink-0 border-b bg-white border-slate-200 text-slate-900 shadow-sm">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm shrink-0">
          <ShieldAlert className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg tracking-tight text-slate-900">
              JALDHRISHTI
            </h1>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase tracking-wider">
              DEMO
            </span>
          </div>
          <p className="text-xs text-slate-500 hidden sm:block">
            {isCitizen ? 'Flood Safety & Safe Evacuation · Assam' : 'Control room view for rescue coordinators.'}
          </p>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/* Switch Link between Citizen & Authority */}
        {isCitizen ? (
          <button
            onClick={() => setActiveTab('authority')}
            className="text-sm font-semibold text-slate-600 hover:text-blue-700 underline underline-offset-4 transition px-1"
          >
            Authority
          </button>
        ) : (
          <button
            onClick={() => setActiveTab('citizen')}
            className="text-sm font-semibold text-blue-600 hover:text-blue-800 underline underline-offset-4 transition px-1"
          >
            Citizen view
          </button>
        )}

        {/* How to use button */}
        <button
          onClick={onOpenHowToUse}
          className="flex items-center gap-1.5 px-3 min-h-[42px] text-sm font-medium rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 transition"
          title="How to use this app"
          aria-label="How to use"
        >
          <HelpCircle className="w-4 h-4 text-blue-600" />
          <span className="hidden sm:inline">How to use</span>
        </button>

        {/* Citizen-only: Quick SOS Button */}
        {isCitizen && (
          <button
            onClick={onOpenSOSModal}
            className="flex items-center gap-1.5 px-3.5 min-h-[42px] bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all active:scale-95"
          >
            <AlertOctagon className="w-4 h-4" />
            <span>SOS</span>
          </button>
        )}
      </div>
    </header>
  );
}
