import { TRANSLATIONS } from "../i18n/translations";
import { api } from "../services/api";
import { useFlowStore } from "../store/useFlowStore";
import { useGameStore } from "../store/useGameStore";
import { ActiveScenario, CustomScenarioConfig, DifficultyId } from "../types/game";
import { playReadySound, playUiConfirmSound } from "./sound";
import { simPause } from "./simPause";

// the sandbox is not a backend scenario; the briefing card is told apart by this synthetic id
export const SANDBOX_BRIEFING_ID = "sandbox" as unknown as ActiveScenario["scenario_id"];

export interface LaunchOptions {
  // undefined / null = the open-ended sandbox
  scenarioId?: string | null;
  difficulty: DifficultyId;
  // text for the progress overlay ("Deploying <name>...")
  label: string;
  // quick restarts (pause menu) go straight back to work instead of through the briefing card
  skipBriefing?: boolean;
}

interface RunPlan {
  label: string;
  reset: () => Promise<unknown>;
  // the briefing to show when the backend reports no active scenario (sandbox, custom)
  fallbackBriefing: ActiveScenario | null;
  skipBriefing?: boolean;
}

// SHARED BODY OF EVERY WAY INTO A RUN: progress overlay -> backend reset -> briefing card (which
// holds the simulation until "Begin")
async function runLaunch(plan: RunPlan): Promise<boolean> {
  const game = useGameStore.getState();
  useFlowStore.getState().setDeploying(plan.label);
  playUiConfirmSound();
  try {
    await plan.reset();
    // reset restarts the tick loop on its own; a still-active hold (title, pause menu) must win,
    // and whatever the old game's run state was no longer applies to the fresh one
    simPause.rebase({ running: true });
    await simPause.enforce();

    let briefing: ActiveScenario | null = null;
    if (!plan.skipBriefing) {
      try {
        const active = await api.getActiveScenario();
        if (active.active && active.scenario_id && active.elapsed_ticks !== undefined && active.duration_ticks !== undefined) {
          briefing = {
            scenario_id: active.scenario_id,
            elapsed_ticks: active.elapsed_ticks,
            duration_ticks: active.duration_ticks,
            completed: active.completed ?? false,
            outcome: active.outcome ?? null,
            objectives: active.objectives ?? [],
          };
        }
      } catch {
        // the briefing is a nicety; the run itself already started
      }
      if (!briefing) briefing = plan.fallbackBriefing;
    }

    // briefing first: the pause holds must overlap (briefing joins before title/menu leave) so the
    // fresh run never ticks in the gap between them
    if (briefing) game.openScenarioBriefing(briefing);
    game.closeScenarioBuilder();
    game.closeScenarioSelect();
    game.closePauseMenu();
    if (useGameStore.getState().titleScreenVisible) game.hideTitleScreen();
    if (!briefing) useFlowStore.getState().announceShiftStarted();
    playReadySound();
    return true;
  } catch (err) {
    const lang = useGameStore.getState().language;
    const message = err instanceof Error && err.message ? err.message : TRANSLATIONS[lang].flow.launchFailed;
    useGameStore.getState().pushFloatingText(message, "danger");
    return false;
  } finally {
    useFlowStore.getState().setDeploying(null);
  }
}

// SCENARIO SELECT, DEBRIEF "PLAY AGAIN", PAUSE-MENU RESTART
export function launchScenario(opts: LaunchOptions): Promise<boolean> {
  return runLaunch({
    label: opts.label,
    reset: () => api.resetSimulation(opts.scenarioId ?? undefined, opts.difficulty),
    fallbackBriefing: opts.scenarioId
      ? null
      : { scenario_id: SANDBOX_BRIEFING_ID, elapsed_ticks: 0, duration_ticks: 720, completed: false, outcome: null, objectives: [] },
    skipBriefing: opts.skipBriefing,
  });
}

// THE SCENARIO BUILDER'S "TEST SCENARIO"
export function launchCustomScenario(config: CustomScenarioConfig, label: string): Promise<boolean> {
  return runLaunch({
    label,
    reset: () => api.loadCustomScenario(config),
    fallbackBriefing: {
      scenario_id: "custom",
      elapsed_ticks: 0,
      duration_ticks: config.duration_ticks,
      completed: false,
      outcome: null,
      objectives: [],
    },
  });
}
