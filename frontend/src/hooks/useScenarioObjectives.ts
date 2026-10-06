import { useEffect } from "react";
import { api } from "../services/api";
import { useGameStore } from "../store/useGameStore";

const POLL_MS = 2000;

// keeps the backend-computed scenario objective list fresh via a single polled interval, gated
// on a scenario actually being active -- one interval total, not one per objective/component, with
// cleanup guaranteed on unmount or when the scenario ends. the frontend never decides `done`
// itself, only renders whatever boolean the engine's ScenarioEngine.objectives() already computed.
export function useScenarioObjectives() {
  const hasActiveScenario = useGameStore((s) => s.telemetry.active_scenario !== null);
  const setScenarioObjectives = useGameStore((s) => s.setScenarioObjectives);

  useEffect(() => {
    if (!hasActiveScenario) {
      // only write when there is something to clear: a fresh [] every mount re-rendered subscribers
      if (useGameStore.getState().scenarioObjectives.length > 0) setScenarioObjectives([]);
      return;
    }

    let cancelled = false;
    const fetchObjectives = () => {
      // nobody is looking at a hidden tab, so skip the request instead of polling in the background
      if (typeof document !== "undefined" && document.hidden) return;
      api
        .getActiveScenario()
        .then((res) => {
          if (cancelled || !res.active || !res.objectives) return;
          // an unchanged list keeps its reference, so the tracker does not re-render every 2s
          const current = useGameStore.getState().scenarioObjectives;
          if (JSON.stringify(current) !== JSON.stringify(res.objectives)) setScenarioObjectives(res.objectives);
        })
        .catch(() => {
          // best-effort; the previous objective list stays on screen until the next successful poll
        });
    };

    fetchObjectives();
    const interval = setInterval(fetchObjectives, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasActiveScenario, setScenarioObjectives]);
}
