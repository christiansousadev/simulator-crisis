import { CheckCircle2, Circle, Target } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { translateObjective } from "../../i18n/dynamicContent";
import { useGameStore } from "../../store/useGameStore";

// compact, always-visible tracker for the active scenario's backend-computed objectives -- the
// opposite corner from ObjectiveHint so the two never collide. renders only `done`, exactly as
// computed by ScenarioEngine.objectives() server-side; never decides completion itself.
export default function ObjectiveTracker() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const hasActiveScenario = useGameStore((s) => s.telemetry.active_scenario !== null);
  const objectives = useGameStore((s) => s.scenarioObjectives);

  if (!hasActiveScenario || objectives.length === 0) return null;

  return (
    <div className="absolute top-3 right-3 z-30 flex flex-col gap-1 p-2.5 rounded-lg border border-slate-800/80 bg-slate-950/80 backdrop-blur-md shadow-lg max-w-[13rem]">
      <div className="flex items-center gap-1.5 text-slate-300 text-[10px] font-bold uppercase tracking-wide mb-0.5">
        <Target className="w-3 h-3 text-sky-400" />
        {t.objectiveTracker.header}
      </div>
      {objectives.map((o) => (
        <div key={o.id} className="flex items-start gap-1.5 text-[11px] leading-tight">
          {o.done ? (
            <CheckCircle2 className="w-3 h-3 mt-0.5 text-emerald-400 shrink-0" />
          ) : (
            <Circle className="w-3 h-3 mt-0.5 text-slate-500 shrink-0" />
          )}
          <span className={o.done ? "text-slate-500 line-through" : "text-slate-300"}>
            {translateObjective(o.id, o.description, language)}
          </span>
        </div>
      ))}
    </div>
  );
}
