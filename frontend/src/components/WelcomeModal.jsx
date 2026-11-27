import React, { useState } from 'react';
import { MapPin, ShieldCheck, Navigation, X, ArrowRight } from 'lucide-react';

const SCREENS = [
  {
    icon: MapPin,
    color: 'bg-blue-600',
    title: '1. Allow location',
    description:
      'Share where you are or tap your spot on the map so we can check flood danger right around you.'
  },
  {
    icon: ShieldCheck,
    color: 'bg-amber-600',
    title: '2. See how safe your area is',
    description:
      'Get a clear safety alert in plain words and color — Low, Moderate, or High flood risk.'
  },
  {
    icon: Navigation,
    color: 'bg-emerald-600',
    title: '3. Follow the safe route',
    description:
      'Find the nearest dry shelter and follow directions that go around flooded roads.'
  }
];

export default function WelcomeModal({ isOpen, onClose }) {
  const [step, setStep] = useState(0);

  if (!isOpen) return null;

  const current = SCREENS[step];
  const Icon = current.icon;
  const isLast = step === SCREENS.length - 1;

  const handleNext = () => {
    if (isLast) {
      onClose();
      setStep(0);
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    onClose();
    setStep(0);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 relative">
        {/* Skip / Close */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-base font-medium transition"
          aria-label="Skip welcome guide"
        >
          Skip
        </button>

        {/* Step Indicator Dots */}
        <div className="flex items-center gap-2 mb-6">
          {SCREENS.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 rounded-full transition-all ${
                idx === step ? 'w-8 bg-blue-500' : 'w-2 bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className={`w-14 h-14 rounded-2xl ${current.color} flex items-center justify-center mb-5 shadow-lg`}>
          <Icon className="w-7 h-7 text-white" />
        </div>

        {/* Content (min 16px) */}
        <h2 className="text-2xl font-bold text-white mb-3">{current.title}</h2>
        <p className="text-base text-slate-300 leading-relaxed mb-8">
          {current.description}
        </p>

        {/* Action Button (min 48px tall) */}
        <button
          onClick={handleNext}
          className="w-full min-h-[48px] px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white text-base font-semibold rounded-xl flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/25"
        >
          <span>{isLast ? 'Get Started' : 'Next'}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
