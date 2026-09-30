import { Building2, Gauge, PauseCircle, Radar, Siren, Terminal, Wrench, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { playClickSound } from "../../utils/sound";

const STEP_KEYS = ["welcome", "spotIncident", "acknowledge", "investigate", "mitigate", "consequence", "governance"] as const;
type StepKey = (typeof STEP_KEYS)[number];
const TOTAL_STEPS = STEP_KEYS.length;
const GOVERNANCE_STEP_INDEX = STEP_KEYS.indexOf("governance");

const STEP_ICONS: Record<StepKey, typeof Building2> = {
  welcome: Building2,
  spotIncident: Radar,
  acknowledge: Siren,
  investigate: Terminal,
  mitigate: Wrench,
  consequence: Gauge,
  governance: Gauge,
};

// each step spotlights a real dom element by its data-tour attribute; welcome has no target
const STEP_TARGET_SELECTORS: Record<StepKey, string | null> = {
  welcome: null,
  spotIncident: '[data-tour="office-canvas"]',
  acknowledge: '[data-tour="bottom-dock"]',
  investigate: '[data-tour="bottom-dock"]',
  mitigate: '[data-tour="bottom-dock"]',
  consequence: '[data-tour="office-canvas"]',
  governance: '[data-tour="topbar-kpis"]',
};

// where the card should anchor so it never covers the element it is explaining
const STEP_CARD_POSITION: Record<StepKey, string> = {
  welcome: "items-center justify-center",
  spotIncident: "items-end justify-start p-6",
  acknowledge: "items-start justify-center pt-20",
  investigate: "items-start justify-center pt-20",
  mitigate: "items-start justify-center pt-20",
  consequence: "items-end justify-start p-6",
  governance: "items-end justify-center pb-24",
};

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

// SEVEN-STEP TUTORIAL WALKING THE PLAYER THROUGH A REAL INCIDENT LIFECYCLE (SPOT -> ACKNOWLEDGE ->
// INVESTIGATE -> MITIGATE -> CONSEQUENCE) WHENEVER ONE IS AVAILABLE, THEN GOVERNANCE. THE SIMULATION
// CLOCK IS PAUSED FOR THE ENTIRE DURATION SO NO STEP IS UNDERCUT BY TIME PASSING MID-EXPLANATION.
export default function OnboardingModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.onboardingOpen);
  const closeOnboarding = useGameStore((s) => s.closeOnboarding);
  const telemetry = useGameStore((s) => s.telemetry);
  const runAnimations = useGameStore((s) => s.runAnimations);
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [focusIncidentId, setFocusIncidentId] = useState<string | null>(null);

  const stepKey = STEP_KEYS[step];
  const focusIncident = telemetry.active_incidents.find((i) => i.id === focusIncidentId) ?? null;

  // pause the simulation clock for as long as the tutorial is open (guided first run or a manual
  // reopen from the help button alike), restoring whatever speed was active before it opened
  const preOnboardingSpeed = useRef<number | null>(null);
  useEffect(() => {
    if (!open) return;
    const currentMultiplier = telemetry.is_running ? Math.round(1 / telemetry.tick_rate_seconds) : 0;
    preOnboardingSpeed.current = currentMultiplier;
    if (currentMultiplier !== 0) api.pauseSimulation().catch(() => {});
    return () => {
      const restore = preOnboardingSpeed.current;
      if (restore && restore > 0) api.setSpeed(restore).catch(() => {});
    };
    // deliberately only re-runs when `open` flips -- telemetry is read once per open, not tracked
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // the backend only broadcasts a fresh telemetry frame as part of its own tick loop, which is
  // exactly what's paused above -- so acknowledging/investigating/mitigating a real incident
  // behind the spotlight would otherwise never visibly update while the tutorial is open. Poll
  // the plain state snapshot instead, only for as long as onboarding stays open.
  const setTelemetry = useGameStore((s) => s.setTelemetry);
  useEffect(() => {
    if (!open) return;
    const poll = () => {
      api.getState().then(setTelemetry).catch(() => {});
    };
    poll();
    const interval = setInterval(poll, 1200);
    return () => clearInterval(interval);
  }, [open, setTelemetry]);

  // lock onto the first active incident once the spotlight step is reached, so later steps keep
  // pointing at the same one even if its status changes along the way
  useEffect(() => {
    if (open && stepKey === "spotIncident" && !focusIncidentId) {
      const first = telemetry.active_incidents.find((i) => i.status === "active") ?? telemetry.active_incidents[0];
      if (first) setFocusIncidentId(first.id);
    }
  }, [open, stepKey, focusIncidentId, telemetry.active_incidents]);

  // advance automatically the moment the player takes the real action a step asks for -- the sim
  // clock is paused throughout, so nothing else can change this incident's state in the meantime
  useEffect(() => {
    if (!open || !focusIncident) return;
    if (stepKey === "acknowledge" && focusIncident.status !== "active") {
      setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
    } else if (stepKey === "investigate" && focusIncident.triage_solved) {
      setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
    } else if (stepKey === "mitigate" && runAnimations.some((a) => a.serviceId === focusIncident.service_id && a.kind === "mitigate")) {
      setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stepKey, focusIncident?.status, focusIncident?.triage_solved, runAnimations]);

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

  const StepIcon = STEP_ICONS[stepKey];
  const isLast = step === TOTAL_STEPS - 1;

  const handleClose = () => {
    playClickSound();
    setStep(0);
    setFocusIncidentId(null);
    closeOnboarding();
  };

  const handleNext = () => {
    playClickSound();
    if (isLast) {
      handleClose();
      return;
    }
    // no incident ever showed up to spotlight: skip the action-gated steps entirely rather than
    // asking the player to acknowledge/investigate/mitigate something that doesn't exist
    if (stepKey === "spotIncident" && !focusIncidentId) {
      setStep(GOVERNANCE_STEP_INDEX);
      return;
    }
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  };

  const handleBack = () => {
    playClickSound();
    setStep((s) => Math.max(0, s - 1));
  };

  const body = stepKey === "spotIncident" && !focusIncidentId ? t.onboarding.steps.spotIncident.waitingBody : t.onboarding.steps[stepKey].body;

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
        <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden pointer-events-auto animate-modal-in">
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
            <h2 className="text-lg font-extrabold font-heading text-white">{t.onboarding.steps[stepKey].title}</h2>
            <p className="text-sm text-slate-300 leading-relaxed">{body}</p>
          </div>

          <div className="flex items-center justify-center gap-1.5 pb-3">
            {STEP_KEYS.map((key, i) => (
              <span key={key} className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-sky-400" : "w-1.5 bg-slate-600"}`} />
            ))}
          </div>

          <div className="flex items-center justify-center gap-1.5 pb-4 text-[10px] font-semibold text-amber-400/90">
            <PauseCircle className="w-3 h-3" />
            {t.onboarding.pausedNotice}
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
