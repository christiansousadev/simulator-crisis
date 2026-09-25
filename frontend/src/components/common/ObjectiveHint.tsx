import { Lightbulb, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";

// DERIVE THE SINGLE HIGHEST-PRIORITY NEXT ACTION FROM CURRENT TELEMETRY, OR NONE FOR AN EXPERIENCED PLAYER
export function useNextObjectiveKey(): string | null {
  const telemetry = useGameStore((s) => s.telemetry);

  return useMemo(() => {
    const unacknowledged = telemetry.active_incidents.some((i) => i.status === "active");
    if (unacknowledged) return "acknowledgeIncident";
    if (telemetry.engineers.length === 0) return "hireEngineer";
    if (telemetry.purchased_upgrades.length === 0 && telemetry.budget >= 9000) return "buyUpgrade";
    if (telemetry.infrastructure_nodes.length === 0 && telemetry.budget >= 12000 && telemetry.tick > 20) return "tryBuildMode";
    if (telemetry.achievements_unlocked.length === 0 && telemetry.tick > 40) return "earnAchievement";
    return null;
  }, [telemetry]);
}

// SMALL DISMISSIBLE HINT BANNER SUGGESTING THE NEXT MEANINGFUL ACTION FOR A NEW PLAYER
export default function ObjectiveHint() {
  const t = useTranslation();
  const objectiveKey = useNextObjectiveKey();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!objectiveKey || dismissed === objectiveKey) return null;

  return (
    <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-400/40 bg-slate-900/90 backdrop-blur shadow-lg max-w-xs animate-pop-in">
      <Lightbulb className="w-4 h-4 text-amber-400 shrink-0" />
      <p className="text-[11px] text-amber-100 leading-tight flex-1">{t.objectiveHints[objectiveKey as keyof typeof t.objectiveHints]}</p>
      <button onClick={() => setDismissed(objectiveKey)} className="text-slate-500 hover:text-slate-300 shrink-0">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
