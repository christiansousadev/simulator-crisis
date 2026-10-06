import { Check } from "lucide-react";
import { memo } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { LIFECYCLE_STEPS } from "../../utils/incidentLifecycle";

interface IncidentLifecycleTrackProps {
  // index into LIFECYCLE_STEPS of the stage the incident is in now
  index: number;
  className?: string;
}

// FIVE-STEP PROGRESS TRACK: New -> Acknowledged -> Investigated -> Mitigating -> Resolved. Done
// steps are filled, the current one is highlighted and named, upcoming ones stay quiet. Each
// segment fills through a color transition, so a status change reads as progress, not a swap.
export default memo(function IncidentLifecycleTrack({ index, className = "" }: IncidentLifecycleTrackProps) {
  const t = useTranslation();
  const labels = t.hud.incidents.steps;

  return (
    <ol aria-label={t.hud.incidents.lifecycleLabel} className={`flex items-center gap-1 ${className}`}>
      {LIFECYCLE_STEPS.map((step, i) => {
        const done = i < index;
        const current = i === index;
        const resolved = step === "resolved" && current;
        return (
          <li
            key={step}
            aria-current={current ? "step" : undefined}
            className={`flex items-center gap-1 ${current ? "min-w-0" : "shrink-0"}`}
          >
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors duration-slow ${
                done || resolved
                  ? "border-emerald-400 bg-emerald-400 text-slate-950"
                  : current
                  ? "border-amber-300 bg-amber-300/20 text-amber-200"
                  : "border-slate-700 bg-slate-900 text-transparent"
              }`}
            >
              {done || resolved ? <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden /> : <span className="h-1 w-1 rounded-full bg-current" />}
              <span className="sr-only">{labels[step]}</span>
            </span>
            {current && <span className="truncate text-micro font-bold uppercase tracking-wide text-slate-200">{labels[step]}</span>}
            {i < LIFECYCLE_STEPS.length - 1 && (
              <span className={`h-px w-2.5 shrink-0 transition-colors duration-slow ${done ? "bg-emerald-400/70" : "bg-slate-700"}`} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
});
