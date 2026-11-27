import React from 'react';
import { X, Mountain, CloudRain, Waves, Info } from 'lucide-react';

export default function HowCalculatedModal({ isOpen, onClose, activeScenario }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <Info className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold text-white">How is this calculated?</h2>
          </div>
          <button
            onClick={onClose}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4 text-base text-slate-300 leading-relaxed">
          <p>
            JALDHRISHTI checks flood safety around you by combining satellite maps, local terrain, and rainfall patterns.
          </p>

          <div className="space-y-3">
            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <Mountain className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Ground Height & Slope</div>
                <p className="text-base text-slate-300">
                  Low-lying flat land fills with water faster than higher ground.
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <Waves className="w-6 h-6 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Nearness to Rivers</div>
                <p className="text-base text-slate-300">
                  Places closer to major rivers and dense streams face higher overflow danger.
                </p>
              </div>
            </div>

            <div className="flex gap-3 p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <CloudRain className="w-6 h-6 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-white">Recent Rainfall</div>
                <p className="text-base text-slate-300">
                  Checks total rainfall over the last 7, 15, and 30 days.
                  {activeScenario?.isSimulated && (
                    <span className="block mt-1 text-amber-300 font-medium">
                      Currently showing a SIMULATED weather scenario ({activeScenario.name}).
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
            <div className="font-semibold text-white">Safety Color Guide</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-base">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-emerald-500 shrink-0"></span>
                <span>Low risk — Safe</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-amber-500 shrink-0"></span>
                <span>Moderate risk — Stay alert</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-orange-500 shrink-0"></span>
                <span>High risk — Move to shelter</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-red-500 shrink-0"></span>
                <span>Severe risk — Leave now</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-base">
            <div className="flex items-center gap-2 font-semibold mb-1">
              <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-xs font-bold uppercase">
                DEMO
              </span>
              <span>Prototype Notice</span>
            </div>
            <p className="text-base">
              Model trained on Assam data; predictions are estimates. Always follow instructions from local rescue authorities.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full min-h-[48px] bg-blue-600 hover:bg-blue-500 text-white text-base font-semibold rounded-xl transition"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
