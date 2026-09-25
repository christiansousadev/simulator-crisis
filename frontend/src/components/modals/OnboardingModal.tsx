import { Building2, Gauge, Radar, Siren, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { playClickSound } from "../../utils/sound";

const STEP_ICONS = [Building2, Radar, Siren, Gauge];
const STEP_KEYS = ["welcome", "topology", "crisis", "governance"] as const;
const TOTAL_STEPS = STEP_KEYS.length;

// each step spotlights a real dom element by its data-tour attribute; welcome has no target
const STEP_TARGET_SELECTORS: Record<(typeof STEP_KEYS)[number], string | null> = {
  welcome: null,
  topology: '[data-tour="office-canvas"]',
  crisis: '[data-tour="bottom-dock"]',
  governance: '[data-tour="topbar-kpis"]',
};

// where the card should anchor so it never covers the element it is explaining
const STEP_CARD_POSITION: Record<(typeof STEP_KEYS)[number], string> = {
  welcome: "items-center justify-center",
  topology: "items-end justify-start p-6",
  crisis: "items-start justify-center pt-20",
  governance: "items-end justify-center pb-24",
};

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// FOUR-STEP FIRST-TIME TUTORIAL WALKING THE PLAYER THROUGH MISSION, TOPOLOGY, CRISIS AND GOVERNANCE
export default function OnboardingModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.onboardingOpen);
  const closeOnboarding = useGameStore((s) => s.closeOnboarding);
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  const stepKey = STEP_KEYS[step];

  // track the real position of the highlighted ui element for the current step, live
  useEffect(() => {
    if (!open) return;
    const selector = STEP_TARGET_SELECTORS[stepKey];
    if (!selector) {
      setSpotlight(null);
      return;
    }
    const updateRect = () => {
      const el = document.querySelector(selector);
      if (!el) {
        setSpotlight(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      setSpotlight({ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 });
    };
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [open, stepKey]);

  if (!open) return null;

  const StepIcon = STEP_ICONS[step];
  const isLast = step === TOTAL_STEPS - 1;

  const handleClose = () => {
    playClickSound();
    setStep(0);
    closeOnboarding();
  };

  const handleNext = () => {
    playClickSound();
    if (isLast) {
      handleClose();
    } else {
      setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
    }
  };

  const handleBack = () => {
    playClickSound();
    setStep((s) => Math.max(0, s - 1));
  };

  return (
    <>
      {/* spotlight layer: a transparent hole (via an oversized box-shadow) over the real ui element,
          falling back to a flat dim backdrop on the welcome step, which has no target */}
      {spotlight ? (
        <div
          className="fixed z-[89] pointer-events-none rounded-lg transition-all duration-300"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.82)",
            border: "2px solid #38bdf8",
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[89] bg-slate-950/80 backdrop-blur-sm pointer-events-none" />
      )}

      <div className={`fixed inset-0 z-[90] flex pointer-events-none p-4 ${STEP_CARD_POSITION[stepKey]}`}>
        <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/60">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {t.onboarding.stepLabel(step + 1, TOTAL_STEPS)}
            </span>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-100 transition-colors" title={t.onboarding.skip}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 flex flex-col items-center text-center gap-3">
            <div className="p-3 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <StepIcon className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-extrabold text-white">{t.onboarding.steps[stepKey].title}</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{t.onboarding.steps[stepKey].body}</p>
          </div>

          <div className="flex items-center justify-center gap-1.5 pb-4">
            {STEP_KEYS.map((key, i) => (
              <span key={key} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-sky-400" : "w-1.5 bg-slate-600"}`} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 px-5 pb-5">
            <button onClick={handleClose} className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors">
              {t.onboarding.skip}
            </button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  onClick={handleBack}
                  className="px-3 py-1.5 rounded-md text-xs font-bold text-slate-300 border border-slate-600 hover:bg-slate-800 transition-colors"
                >
                  {t.onboarding.back}
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-4 py-1.5 rounded-md text-xs font-bold bg-sky-500 hover:bg-sky-600 text-white transition-colors"
              >
                {isLast ? t.onboarding.getStarted : t.onboarding.next}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
