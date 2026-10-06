import { Lightbulb, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { TelemetryState } from "../../types/game";

// THE SINGLE HIGHEST-PRIORITY NEXT ACTION FOR A NEW PLAYER, OR NULL FOR AN EXPERIENCED ONE. Pure over
// telemetry so it can run as a store selector and hand back a plain string.
export function deriveObjectiveKey(telemetry: TelemetryState): string | null {
  const unacknowledged = telemetry.active_incidents.some((i) => i.status === "active");
  if (unacknowledged) return "acknowledgeIncident";
  if (telemetry.engineers.length === 0) return "hireEngineer";
  if (telemetry.purchased_upgrades.length === 0 && telemetry.budget >= 9000) return "buyUpgrade";
  if (telemetry.infrastructure_nodes.length === 0 && telemetry.budget >= 12000 && telemetry.tick > 20) return "tryBuildMode";
  if (telemetry.achievements_unlocked.length === 0 && telemetry.tick > 40) return "earnAchievement";
  return null;
}

// selecting the derived key (a string) instead of the whole telemetry object means this only
// re-renders when the suggestion itself changes, not on every tick
export function useNextObjectiveKey(): string | null {
  return useGameStore((s) => deriveObjectiveKey(s.telemetry));
}

// SMALL DISMISSIBLE HINT BANNER SUGGESTING THE NEXT MEANINGFUL ACTION FOR A NEW PLAYER
export default function ObjectiveHint() {
  const t = useTranslation();
  const objectiveKey = useNextObjectiveKey();
  const [dismissed, setDismissed] = useState<string | null>(null);

  if (!objectiveKey || dismissed === objectiveKey) return null;

  return (
    <div
      role="status"
      className="absolute bottom-3 left-3 z-20 flex max-w-xs items-center gap-2 rounded-lg border border-amber-400/40 bg-slate-900/90 px-3 py-2 shadow-lg backdrop-blur animate-pop-in"
    >
      <Lightbulb className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <p className="flex-1 text-caption leading-tight text-amber-100">
        {t.objectiveHints[objectiveKey as keyof typeof t.objectiveHints]}
      </p>
      <button
        type="button"
        onClick={() => setDismissed(objectiveKey)}
        aria-label={t.hud.common.dismiss}
        className="shrink-0 text-slate-400 transition-colors hover:text-slate-200"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}
