import { Rocket, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useFlowStore } from "../../store/useFlowStore";
import { useGameStore } from "../../store/useGameStore";
import { getDayNumber, getHourOfDay } from "../../utils/officeClock";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { usePresence } from "../../hooks/usePresence";
import "../flow/flow.css";

// how long the wipe line and the "shift started" banner stay mounted
const WIPE_MS = 750;
const BANNER_MS = 2600;

// THE LAYER THAT STITCHES SCREENS TOGETHER: a wipe line when the title gives way to the office,
// a progress veil while a scenario deploys, and the "shift started" banner. Every piece is
// pointer-events-none, so it can never swallow a click, even mid-animation.
export default function ScreenTransition() {
  const t = useTranslation();
  const reduced = useReducedMotion();
  const deploying = useFlowStore((s) => s.deploying);
  const titleLeavingSeq = useFlowStore((s) => s.titleLeavingSeq);
  const shiftBannerSeq = useFlowStore((s) => s.shiftBannerSeq);

  const veil = usePresence(deploying, 220);

  // transient pieces keyed by their sequence number and removed by timers
  const [wipeSeq, setWipeSeq] = useState(0);
  const [banner, setBanner] = useState<{ seq: number; text: string } | null>(null);
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    if (titleLeavingSeq === 0 || reduced) return;
    setWipeSeq(titleLeavingSeq);
    const timer = setTimeout(() => setWipeSeq(0), WIPE_MS);
    return () => clearTimeout(timer);
  }, [titleLeavingSeq, reduced]);

  useEffect(() => {
    if (shiftBannerSeq === 0) return;
    // the clock is read once, when the banner appears, so it never ticks under the player's eyes
    const tick = useGameStore.getState().telemetry.tick;
    const text = tRef.current.flow.shiftStarted(getDayNumber(tick), `${getHourOfDay(tick).toString().padStart(2, "0")}:00`);
    setBanner({ seq: shiftBannerSeq, text });
    const timer = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(timer);
  }, [shiftBannerSeq]);

  return (
    <>
      {wipeSeq !== 0 && (
        <div key={wipeSeq} aria-hidden="true" className="motion-only fixed inset-0 z-system pointer-events-none overflow-hidden">
          <div className="flow-wipe-line absolute inset-y-0 left-0 w-full" />
        </div>
      )}

      {veil.mounted && veil.data && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed inset-0 z-system pointer-events-none flex items-center justify-center bg-slate-950/70 backdrop-blur-[2px] ${
            veil.closing ? "animate-backdrop-out" : "animate-backdrop-in"
          }`}
        >
          <div className="w-72 max-w-[80vw] flex flex-col items-center gap-3 text-center">
            <Rocket className="w-6 h-6 text-sky-400" aria-hidden="true" />
            <p className="font-heading font-bold tracking-wide text-slate-100 text-lg">{t.flow.deploying(veil.data.label)}</p>
            <div className="relative h-1 w-full overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
              <div className="flow-progress-run absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-sky-500 to-cyan-300" />
            </div>
          </div>
        </div>
      )}

      {banner && (
        <div className="fixed inset-x-0 top-20 z-system pointer-events-none flex justify-center px-4">
          <div
            key={banner.seq}
            role="status"
            aria-live="polite"
            className="flow-banner flex items-center gap-2.5 rounded-xl border border-sky-400/40 bg-slate-900/90 px-5 py-2.5 shadow-2xl backdrop-blur-md"
          >
            <Radio className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span className="font-heading font-bold tracking-wider text-sm text-slate-100 uppercase">{banner.text}</span>
          </div>
        </div>
      )}
    </>
  );
}
