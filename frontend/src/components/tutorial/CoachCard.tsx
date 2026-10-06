import { Building2, CheckCircle2, Gauge, LucideIcon, PauseCircle, Radar, Search, Siren, Terminal, Wrench, X } from "lucide-react";
import { forwardRef, useEffect, useRef } from "react";
import { TutorialStepId } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";

const STEP_ICONS: Record<TutorialStepId, LucideIcon> = {
  welcome: Building2,
  rack: Radar,
  card: Siren,
  acknowledge: Siren,
  investigate: Terminal,
  findCause: Search,
  runbooks: Wrench,
  mitigate: Wrench,
  recap: CheckCircle2,
  governance: Gauge,
};

export interface RecapStats {
  mtta: string | null;
  mttr: string | null;
  spent: string | null;
}

export interface CoachCardProps {
  stepId: TutorialStepId;
  index: number;
  total: number;
  title: string;
  body: string;
  // short imperative of the action a waiting step expects
  action?: string;
  waiting: boolean;
  success: boolean;
  alreadyHeld: boolean;
  preparing: boolean;
  hint: string | null;
  recap: RecapStats | null;
  canBack: boolean;
  isLast: boolean;
  onBack: () => void;
  onNext: () => void;
  onLeave: () => void;
}

// THE FLOATING EXPLANATION BESIDE THE SPOTLIGHT. The caller keys it per step, so each step enters
// with a fresh fade; positioning lives in the wrapper (TutorialOverlay), not here.
const CoachCard = forwardRef<HTMLDivElement, CoachCardProps>(function CoachCard(props, ref) {
  const { stepId, index, total, title, body, action, waiting, success, alreadyHeld, preparing, hint, recap, canBack, isLast, onBack, onNext, onLeave } = props;
  const t = useTranslation();
  const StepIcon = STEP_ICONS[stepId];
  const primaryRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRoot = (el: HTMLDivElement | null) => {
    rootRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };
  const titleId = `tutorial-title-${stepId}`;

  // info steps put focus on the primary button so Enter just works; waiting steps keep it on the card
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const target = waiting ? rootRef.current : primaryRef.current;
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
    // once per step: the card is keyed by step
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const primaryLabel = isLast ? t.tutorial.finish : waiting ? t.tutorial.skipStep : t.tutorial.next;

  return (
    <div
      ref={setRoot}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="w-[min(23rem,calc(100vw-24px))] rounded-xl border border-slate-600/80 bg-slate-900/95 shadow-2xl backdrop-blur-md outline-none animate-modal-in"
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/70">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 tabular-nums">{t.tutorial.stepLabel(index + 1, total)}</span>
        <button
          type="button"
          onClick={onLeave}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700/70 transition-colors duration-fast"
          title={t.tutorial.leave}
          aria-label={t.tutorial.leave}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-4 pt-3 pb-2 flex gap-3">
        <div className="shrink-0 mt-0.5 h-9 w-9 rounded-full flex items-center justify-center bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
          <StepIcon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-extrabold font-heading tracking-wide text-white leading-tight">
            {title}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{body}</p>
        </div>
      </div>

      {recap && (
        <dl className="mx-4 mb-2 grid grid-cols-3 gap-1.5 text-center">
          {[
            { label: t.tutorial.recap.mtta, value: recap.mtta },
            { label: t.tutorial.recap.mttr, value: recap.mttr },
            { label: t.tutorial.recap.spent, value: recap.spent },
          ].map((stat) => (
            <div key={stat.label} className="rounded-md border border-slate-700 bg-slate-800/60 px-1.5 py-1.5">
              <dt className="text-[9px] font-bold uppercase tracking-wide text-slate-400 leading-tight">{stat.label}</dt>
              <dd className="mt-0.5 font-mono text-sm font-bold text-emerald-300 tabular-nums">{stat.value ?? t.tutorial.recap.notMeasured}</dd>
            </div>
          ))}
        </dl>
      )}

      {preparing && (
        <div className="mx-4 mb-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-300 animate-pulse">
          {t.tutorial.preparing}
        </div>
      )}

      {waiting && action && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-cyan-500/40 bg-cyan-950/50 px-3 py-1.5 text-xs font-bold text-cyan-200">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="motion-only absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
          </span>
          {t.tutorial.waitingFor(action)}
        </div>
      )}

      {success && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-emerald-500/50 bg-emerald-950/50 px-3 py-1.5 text-xs font-bold text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t.tutorial.done}
        </div>
      )}

      {!success && !waiting && alreadyHeld && (
        <div className="mx-4 mb-2 flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-950/40 px-3 py-1.5 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {t.tutorial.alreadyDone}
        </div>
      )}

      {hint && (
        <div className="mx-4 mb-2 rounded-md border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-semibold leading-snug text-amber-200">
          {hint}
        </div>
      )}

      <div className="flex items-center justify-center gap-1 pb-2" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-base ${i === index ? "w-5 bg-cyan-400" : i < index ? "w-1.5 bg-cyan-700" : "w-1.5 bg-slate-600"}`}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-2 text-[10px] font-semibold text-amber-400/90">
        <PauseCircle className="w-3 h-3" />
        {t.tutorial.pausedNotice}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 pb-4">
        <button type="button" onClick={onLeave} className="text-xs font-semibold text-slate-400 hover:text-slate-100 transition-colors duration-fast">
          {t.tutorial.leave}
        </button>
        <div className="flex items-center gap-2">
          {canBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-1.5 rounded-md text-xs font-bold text-slate-300 border border-slate-600 hover:bg-slate-800 transition-colors duration-fast"
            >
              {t.tutorial.back}
            </button>
          )}
          <button
            ref={primaryRef}
            type="button"
            onClick={onNext}
            disabled={preparing}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors duration-fast disabled:opacity-50 ${
              waiting ? "border border-slate-600 text-slate-300 hover:bg-slate-800" : "bg-cyan-500 hover:bg-cyan-400 text-slate-950"
            }`}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
});

export default CoachCard;
