import React from 'react';
import {
  MapPin,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Home,
  Navigation,
  ArrowRight,
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
      badge: 'SEVERE RISK',
      sentence: 'Severe risk under current assumptions. Follow official alerts.',
      cardClass: 'bg-red-50 border-red-300 text-red-950',
      badgeClass: 'bg-red-600 text-white',
      Icon: AlertOctagon
    };
  }
  if (riskScore >= 50) {
    return {
      badge: 'HIGH RISK',
      sentence: 'High risk under current assumptions. Follow official alerts.',
      cardClass: 'bg-orange-50 border-orange-300 text-orange-950',
      badgeClass: 'bg-orange-600 text-white',
      Icon: AlertTriangle
    };
  }
  if (riskScore >= 25) {
    return {
      badge: 'MODERATE RISK',
      sentence: 'Moderate risk under current assumptions. Follow official alerts.',
      cardClass: 'bg-amber-50 border-amber-300 text-amber-950',
      badgeClass: 'bg-amber-500 text-slate-950',
      Icon: AlertTriangle
    };
  }
  return {
    badge: 'LOW RISK',
    sentence: 'Low risk under current assumptions. Follow official alerts.',
    cardClass: 'bg-emerald-50 border-emerald-300 text-emerald-950',
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
  const recommendedList = (shelterRecommendations?.recommended_shelters || []).slice(0, 2);
  const topShelter = recommendedList[shelterIndex] || recommendedList[0] || null;
  const riskInfo = getRiskDetails(userAreaRisk?.risk_score ?? 0);
  const RiskIcon = riskInfo.Icon;

  const activeRouteSummary =
    routeMode === 'shortest'
      ? routeData?.routes?.shortest
      : routeData?.routes?.safe || topShelter?.route_to_shelter;

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 text-slate-900 overflow-y-auto text-base">
      {/* Progress Bar */}
      <div className="px-5 pt-4 pb-3 border-b border-slate-200 bg-slate-50/90 sticky top-0 z-10 backdrop-blur">
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-semibold text-blue-700">
            Step {step} of 3
          </span>
          {activeScenario?.isSimulated && (
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 uppercase">
              SIMULATED
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 rounded-full transition-all ${
                s <= step ? 'bg-blue-600' : 'bg-slate-200'
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
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                Where are you?
              </h2>
              <p className="text-base text-slate-600 leading-relaxed">
                Share your location so we can check if your area is safe from flooding.
              </p>
            </div>

            <button
              onClick={onUseCurrentLocation}
              disabled={locationLoading}
              className="w-full min-h-[52px] px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-base font-semibold rounded-xl flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition active:scale-[0.99]"
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

            <div className="text-center">
              <span className="text-sm text-slate-500">
                Prefer choosing manually?{' '}
                <span className="text-blue-600 hover:text-blue-700 font-medium underline cursor-pointer">
                  Tap anywhere on the map
                </span>
              </span>
            </div>

            {locationError && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm leading-relaxed space-y-1">
                <p className="font-semibold text-amber-950">Location access not available</p>
                <p>{locationError}</p>
              </div>
            )}

            <div className="pt-1">
              <p className="text-base text-slate-600 mb-3">
                Or pick a place in Guwahati:
              </p>
              <div className="flex flex-wrap gap-2.5">
                {QUICK_PLACES.map((place) => (
                  <button
                    key={place.name}
                    onClick={() => onSelectPlace(place.lat, place.lon, place.name)}
                    className="min-h-[48px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-base font-medium rounded-xl border border-slate-300 transition"
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
              <h2 className="text-2xl font-bold text-slate-900 mb-1">
                Your safety
              </h2>
              {userLocation?.label && (
                <p className="text-base text-slate-600 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Location: {userLocation.label}</span>
                </p>
              )}
            </div>

            {/* Result Card: Risk level ONCE (badge + one short sentence) + small basis line */}
            <div className={`p-5 rounded-2xl border-2 space-y-3 ${riskInfo.cardClass}`}>
              <div className="flex items-center gap-2">
                <RiskIcon className="w-6 h-6 shrink-0" />
                <span className={`px-3 py-1 rounded-full text-sm font-bold tracking-wide uppercase ${riskInfo.badgeClass}`}>
                  {riskInfo.badge}
                </span>
              </div>

              <p className="text-lg font-semibold leading-snug">
                {riskInfo.sentence}
              </p>

              <p className="text-sm opacity-80">
                {activeScenario?.isSimulated
                  ? `Based on: ${activeScenario.name} (demo)`
                  : 'Based on: assumed moderate rainfall (demo)'}
              </p>
            </div>

            {/* One Primary Button */}
            <button
              onClick={onFindShelters}
              disabled={shelterLoading}
              className="w-full min-h-[52px] px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-base font-semibold rounded-xl flex items-center justify-center gap-2.5 shadow-sm transition"
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
              <div className="p-4 rounded-xl bg-red-50 border border-red-300 text-red-900 text-base">
                {shelterError}
              </div>
            )}

            {/* Small text link for Change my location */}
            <div className="text-center">
              <button
                onClick={() => onSetStep(1)}
                className="text-base text-slate-600 hover:text-slate-900 underline underline-offset-4 py-1 transition"
              >
                Change my location
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: NEAREST SAFE SHELTER ================= */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">
                Nearest safe shelter
              </h2>
              <p className="text-base text-slate-600">
                Showing the {recommendedList.length === 1 ? 'nearest' : '2 nearest'} shelters.
              </p>
            </div>

            {shelterLoading ? (
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3 text-base text-slate-700">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 shrink-0" />
                <span>Looking for the closest safe shelter...</span>
              </div>
            ) : topShelter ? (
              <div className="space-y-4">
                {/* Shelter Card */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-xl bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0">
                      <Home className="w-6 h-6 text-blue-700" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {shelterIndex === 0 && (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold uppercase">
                            Nearest
                          </span>
                        )}
                        <h3 className="text-lg font-bold text-slate-900 leading-snug">
                          {topShelter.name}
                        </h3>
                      </div>
                      <p className="text-base text-emerald-700 font-medium mt-1 flex items-center gap-2 flex-wrap">
                        <span>{topShelter.available_capacity} beds available · {topShelter.status}</span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold uppercase">
                          DEMO
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                    <div>
                      <div className="text-sm text-slate-500">Distance</div>
                      <div className="text-lg font-bold text-slate-900">
                        {activeRouteSummary?.total_distance_km ??
                          activeRouteSummary?.distance_km ??
                          topShelter.distance_km}{' '}
                        km
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500">Travel time</div>
                      <div className="text-lg font-bold text-slate-900">
                        ~{Math.round(
                          activeRouteSummary?.estimated_time_min ??
                            (topShelter.distance_km / 4) * 60
                        )}{' '}
                        mins
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 text-sm text-slate-600">
                    Route basis: <span className="text-slate-900 font-medium">Simplified road network (demo)</span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 text-base text-slate-700">
                    National Emergency Helpline:{' '}
                    <a
                      href="tel:112"
                      className="text-blue-700 underline font-semibold"
                    >
                      112
                    </a>
                  </div>
                </div>

                {/* Primary Button: Show safest route */}
                <button
                  onClick={() => onShowSafestRoute(topShelter)}
                  disabled={routingLoading}
                  className={`w-full min-h-[52px] px-5 py-3 text-white text-base font-semibold rounded-xl flex items-center justify-center gap-2.5 shadow-sm transition ${
                    routeMode === 'safe'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-blue-600 hover:bg-blue-700'
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
                    className="text-base text-slate-600 hover:text-slate-900 underline underline-offset-4 py-1 transition"
                  >
                    {routingLoading && routeMode === 'shortest'
                      ? 'Finding shortest route...'
                      : 'Show shortest route instead'}
                  </button>
                </div>

                {routeMode === 'shortest' && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-base">
                    Showing shortest distance path. Be careful — this path may cross waterlogged roads.
                  </div>
                )}

                {routeError && (
                  <div className="p-4 rounded-xl bg-red-50 border border-red-300 text-red-900 text-base">
                    {routeError}
                  </div>
                )}

                {/* Secondary actions */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  {recommendedList.length > 1 && (
                    <button
                      onClick={onNextShelter}
                      className="min-h-[48px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-base font-medium rounded-xl border border-slate-300 transition"
                    >
                      {shelterIndex === 0 ? 'See 2nd nearest' : 'Back to nearest'}
                    </button>
                  )}
                  <button
                    onClick={onStartOver}
                    className="min-h-[48px] px-4 py-2 text-slate-600 hover:text-slate-900 text-base font-medium underline underline-offset-4 flex items-center gap-1.5 transition ml-auto"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Start over</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
                <p className="text-base text-slate-800">
                  We could not find an open shelter nearby right now. Please call 112 or press the SOS button.
                </p>
                <button
                  onClick={onStartOver}
                  className="w-full min-h-[48px] px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-900 text-base font-medium rounded-xl transition"
                >
                  Start over
                </button>
              </div>
            )}
          </div>
        )}

        {/* ================= FOOTER: HOW CALCULATED + DISCLAIMER ================= */}
        <div className="pt-4 border-t border-slate-200 space-y-3">
          <button
            onClick={onOpenHowCalculated}
            className="w-full min-h-[48px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-base font-medium rounded-xl border border-slate-300 flex items-center justify-center gap-2 transition"
          >
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <span>How is this calculated?</span>
          </button>

          <div className="flex items-center justify-center gap-2 text-sm text-slate-600 text-center">
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold uppercase shrink-0">
              DEMO
            </span>
            <span>Model trained on Assam data; predictions are estimates.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
