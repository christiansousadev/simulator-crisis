import { CheckCircle2, Circle, Target, XCircle } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { translateObjective } from "../../i18n/dynamicContent";
import { useGameStore } from "../../store/useGameStore";

// compact, always-visible tracker for the active scenario's backend-computed objectives -- the
// opposite corner from ObjectiveHint so the two never collide. renders only `done` / `failed`,
// exactly as computed by ScenarioEngine.objectives() server-side; never decides completion itself.
export default memo(function ObjectiveTracker() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const hasActiveScenario = useGameStore((s) => s.telemetry.active_scenario !== null);
  const objectives = useGameStore((s) => s.scenarioObjectives);

  const ref = useRef<HTMLDivElement>(null);
  const visible = hasActiveScenario && objectives.length > 0;

  // publish our height so the incident alert stack (same corner) can sit below us, never on top
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!visible || !el) {
      root.style.setProperty("--objective-tracker-h", "0px");
      return;
    }
    const publish = () => root.style.setProperty("--objective-tracker-h", `${Math.ceil(el.offsetHeight) + 8}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty("--objective-tracker-h", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      role="status"
      aria-label={t.objectiveTracker.header}
      className="absolute right-3 top-3 z-hud flex max-w-[13rem] flex-col gap-1 rounded-lg border border-slate-800/80 bg-slate-950/80 p-2.5 shadow-lg backdrop-blur-md"
    >
      <div className="mb-0.5 flex items-center gap-1.5 font-heading text-xs font-bold uppercase tracking-wider text-slate-300">
        <Target className="h-3 w-3 text-sky-400" aria-hidden />
        {t.objectiveTracker.header}
      </div>
      {objectives.map((o) => (
        <div key={o.id} className="flex items-start gap-1.5 text-caption leading-tight">
          {o.done ? (
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" aria-label={t.objectiveTracker.done} />
          ) : o.failed ? (
            <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-rose-400" aria-hidden />
          ) : (
            <Circle className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" aria-label={t.objectiveTracker.pending} />
          )}
          <span className={o.done ? "text-slate-400 line-through" : o.failed ? "text-rose-300" : "text-slate-200"}>
            {translateObjective(o.id, o.description, language)}
          </span>
        </div>
      ))}
    </div>
  );
});
