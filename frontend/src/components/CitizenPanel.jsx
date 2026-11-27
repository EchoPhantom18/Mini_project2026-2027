import React from 'react';
import {
  MapPin,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Home,
  Navigation,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  HelpCircle,
  Loader2
} from 'lucide-react';

const QUICK_PLACES = [
  { name: 'Paltan Bazaar', lat: 26.1812, lon: 91.7510 },
  { name: 'Jalukbari', lat: 26.1445, lon: 91.6631 },
  { name: 'Dispur', lat: 26.1420, lon: 91.7898 }
];

function getRiskDetails(riskScore) {
  if (riskScore >= 75) {
    return {
      level: 'SEVERE',
      headline: 'Your area: SEVERE flood risk. Leave for a shelter immediately.',
      advice: 'Water levels are dangerous here. Move to higher ground right away.',
      bgClass: 'bg-red-600/20 border-red-500 text-red-100',
      badgeClass: 'bg-red-600 text-white',
      Icon: AlertOctagon
    };
  }
  if (riskScore >= 50) {
    return {
      level: 'HIGH',
      headline: 'Your area: HIGH flood risk. Move to a shelter now.',
      advice: 'Water can rise quickly in this area. Please move to a nearby dry shelter.',
      bgClass: 'bg-orange-600/20 border-orange-500 text-orange-100',
      badgeClass: 'bg-orange-600 text-white',
      Icon: AlertTriangle
    };
  }
  if (riskScore >= 25) {
    return {
      level: 'MODERATE',
      headline: 'Your area: MODERATE flood risk. Stay alert.',
      advice: 'Keep your phone charged, pack essentials, and be ready to move if rain continues.',
      bgClass: 'bg-amber-500/20 border-amber-400 text-amber-100',
      badgeClass: 'bg-amber-500 text-slate-950',
      Icon: AlertTriangle
    };
  }
  return {
    level: 'LOW',
    headline: 'Your area: LOW flood risk. You are relatively safe.',
    advice: 'Your spot is on safer ground. Still watch local updates during heavy rain.',
    bgClass: 'bg-emerald-600/20 border-emerald-500 text-emerald-100',
    badgeClass: 'bg-emerald-600 text-white',
    Icon: ShieldCheck
  };
}

export default function CitizenPanel({
  step,
  onSetStep,
  userLocation,
  locationLoading,
  locationError,
  onUseCurrentLocation,
  onSelectPlace,
  userAreaRisk,
  onFindShelters,
  shelterRecommendations,
  shelterIndex = 0,
  onNextShelter,
  shelterLoading,
  shelterError,
  routeData,
  routeMode,
  routingLoading,
  routeError,
  onShowSafestRoute,
  onShowShortestRoute,
  onOpenHowCalculated,
  activeScenario,
  onStartOver
}) {
  const recommendedList = shelterRecommendations?.recommended_shelters || [];
  const topShelter = recommendedList[shelterIndex] || recommendedList[0] || null;
  const riskInfo = getRiskDetails(userAreaRisk?.risk_score ?? 0);
  const RiskIcon = riskInfo.Icon;

  const activeRouteSummary =
    routeMode === 'shortest'
      ? routeData?.routes?.shortest
      : routeData?.routes?.safe || topShelter?.route_to_shelter;

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-100 overflow-y-auto text-base">
      {/* Progress Bar */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-800 bg-slate-950/60 sticky top-0 z-10 backdrop-blur">
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-semibold text-blue-400">
            Step {step} of 3
          </span>
          {activeScenario?.isSimulated && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
              SIMULATED
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                s <= step ? 'bg-blue-500' : 'bg-slate-800'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Main Step Content */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-6">
        {/* ================= STEP 1: WHERE ARE YOU? ================= */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                Where are you?
              </h2>
              <p className="text-base text-slate-300 leading-relaxed">
                Share your location so we can check if your area is safe from flooding.
              </p>
            </div>

            <button
              onClick={onUseCurrentLocation}
              disabled={locationLoading}
              className="w-full min-h-[56px] px-5 py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white text-base font-semibold rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-blue-600/25 transition active:scale-[0.99]"
            >
              {locationLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Finding your location...</span>
                </>
              ) : (
                <>
                  <MapPin className="w-5 h-5" />
                  <span>Use my current location</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-3 text-slate-400 text-base">
              <div className="flex-1 h-px bg-slate-800" />
              <span>or tap on the map</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {locationError && (
              <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-base">
                {locationError}
              </div>
            )}

            <div className="pt-2">
              <p className="text-base text-slate-400 mb-3">
                Or pick a place in Guwahati:
              </p>
              <div className="flex flex-wrap gap-2.5">
                {QUICK_PLACES.map((place) => (
                  <button
                    key={place.name}
                    onClick={() => onSelectPlace(place.lat, place.lon, place.name)}
                    className="min-h-[48px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-base font-medium rounded-xl border border-slate-700 transition"
                  >
                    {place.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= STEP 2: YOUR SAFETY ================= */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                Your safety
              </h2>
              {userLocation?.label && (
                <p className="text-base text-slate-300 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Location: {userLocation.label}</span>
                </p>
              )}
            </div>

            {/* Big Colored Result in Plain Words */}
            <div className={`p-5 rounded-2xl border-2 space-y-3 ${riskInfo.bgClass}`}>
              <div className="flex items-center gap-2.5">
                <RiskIcon className="w-7 h-7 shrink-0" />
                <span className={`px-3 py-1 rounded-full text-sm font-bold tracking-wide uppercase ${riskInfo.badgeClass}`}>
                  {riskInfo.level} FLOOD RISK
                </span>
              </div>

              <p className="text-xl font-bold leading-snug text-white">
                {riskInfo.headline}
              </p>

              <p className="text-base leading-relaxed opacity-95">
                {riskInfo.advice}
              </p>
            </div>

            {/* Primary CTA to Step 3 */}
            <button
              onClick={onFindShelters}
              disabled={shelterLoading}
              className="w-full min-h-[56px] px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 text-white text-base font-semibold rounded-xl flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/25 transition"
            >
              {shelterLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Finding nearest safe shelter...</span>
                </>
              ) : (
                <>
                  <span>Find nearest safe shelter</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            {shelterError && (
              <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-base">
                {shelterError}
              </div>
            )}

            <button
              onClick={() => onSetStep(1)}
              className="w-full min-h-[48px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-base font-medium rounded-xl flex items-center justify-center gap-2 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Change my location</span>
            </button>
          </div>
        )}

        {/* ================= STEP 3: NEAREST SAFE SHELTER ================= */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                Nearest safe shelter
              </h2>
              <p className="text-base text-slate-300">
                Follow the safe path below to reach dry ground.
              </p>
            </div>

            {shelterLoading ? (
              <div className="p-6 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center gap-3 text-base text-slate-200">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400 shrink-0" />
                <span>Looking for the closest safe shelter...</span>
              </div>
            ) : topShelter ? (
              <div className="space-y-4">
                {/* Shelter Card */}
                <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center shrink-0">
                      <Home className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white leading-snug">
                        {topShelter.name}
                      </h3>
                      <p className="text-base text-emerald-400 font-medium mt-0.5">
                        {topShelter.available_capacity} beds available · {topShelter.status}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-700/80">
                    <div>
                      <div className="text-sm text-slate-400">Distance</div>
                      <div className="text-lg font-bold text-white">
                        {activeRouteSummary?.total_distance_km ??
                          activeRouteSummary?.distance_km ??
                          topShelter.distance_km}{' '}
                        km
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-400">Travel time</div>
                      <div className="text-lg font-bold text-white">
                        ~{Math.round(
                          activeRouteSummary?.estimated_time_min ??
                            (topShelter.distance_km / 4) * 60
                        )}{' '}
                        mins
                      </div>
                    </div>
                  </div>

                  {topShelter.contact_phone && (
                    <div className="pt-2 border-t border-slate-700/80 text-base text-slate-300">
                      Helpline:{' '}
                      <a
                        href={`tel:${topShelter.contact_phone}`}
                        className="text-blue-400 underline font-medium"
                      >
                        {topShelter.contact_phone}
                      </a>
                    </div>
                  )}
                </div>

                {/* Primary Button: Show safest route */}
                <button
                  onClick={() => onShowSafestRoute(topShelter)}
                  disabled={routingLoading}
                  className={`w-full min-h-[56px] px-5 py-3.5 text-white text-base font-semibold rounded-xl flex items-center justify-center gap-2.5 shadow-lg transition ${
                    routeMode === 'safe'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/25'
                      : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/25'
                  }`}
                >
                  {routingLoading && routeMode === 'safe' ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Finding the safest route...</span>
                    </>
                  ) : (
                    <>
                      <Navigation className="w-5 h-5" />
                      <span>Show safest route</span>
                    </>
                  )}
                </button>

                {/* Small link: Show shortest route instead */}
                <div className="text-center">
                  <button
                    onClick={() => onShowShortestRoute(topShelter)}
                    disabled={routingLoading}
                    className="min-h-[48px] px-3 py-2 text-base text-slate-400 hover:text-slate-200 underline transition"
                  >
                    {routingLoading && routeMode === 'shortest'
                      ? 'Finding shortest route...'
                      : 'Show shortest route instead'}
                  </button>
                </div>

                {routeMode === 'shortest' && (
                  <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-base">
                    Showing shortest distance path. Be careful — this path may cross waterlogged roads.
                  </div>
                )}

                {routeError && (
                  <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 text-base">
                    {routeError}
                  </div>
                )}

                {/* Secondary actions */}
                <div className="flex flex-wrap gap-2.5 pt-2">
                  {recommendedList.length > 1 && (
                    <button
                      onClick={onNextShelter}
                      className="flex-1 min-h-[48px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-base font-medium rounded-xl transition"
                    >
                      Try another shelter
                    </button>
                  )}
                  <button
                    onClick={onStartOver}
                    className="flex-1 min-h-[48px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-base font-medium rounded-xl flex items-center justify-center gap-2 transition"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Start over</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-slate-800/80 border border-slate-700 space-y-4">
                <p className="text-base text-slate-200">
                  We could not find an open shelter nearby right now. Please call emergency services or press the SOS button.
                </p>
                <button
                  onClick={onStartOver}
                  className="w-full min-h-[48px] px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-base font-medium rounded-xl transition"
                >
                  Start over
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= FOOTER: HOW CALCULATED + DISCLAIMER ================= */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <button
            onClick={onOpenHowCalculated}
            className="w-full min-h-[48px] px-4 py-2.5 bg-slate-800/70 hover:bg-slate-800 text-slate-200 text-base font-medium rounded-xl border border-slate-700/80 flex items-center justify-center gap-2 transition"
          >
            <HelpCircle className="w-5 h-5 text-blue-400" />
            <span>How is this calculated?</span>
          </button>

          <div className="flex items-center justify-center gap-2 text-sm text-slate-400 text-center">
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold uppercase shrink-0">
              DEMO
            </span>
            <span>Model trained on Assam data; predictions are estimates.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
