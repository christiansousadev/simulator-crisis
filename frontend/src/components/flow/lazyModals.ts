import { lazy } from "react";

// loaders are exported separately so the title screen can warm the chunks while it sits idle
export const loadHallOfFame = () => import("../modals/HallOfFameModal");
export const loadScenarioSelect = () => import("../modals/ScenarioSelectModal");
export const loadDebrief = () => import("../modals/PostMatchDebriefModal");
export const loadSettings = () => import("../modals/SettingsModal");
export const loadCredits = () => import("../modals/CreditsModal");
export const loadPauseMenu = () => import("../modals/PauseMenuModal");
export const loadScenarioBuilder = () => import("../modals/ScenarioBuilderModal");
export const loadScenarioBriefing = () => import("../modals/ScenarioBriefingModal");
// the markdown renderer rides along with this chunk
export const loadPostMortem = () => import("../modals/PostMortemModal");
export const loadIncidentReplay = () => import("../modals/IncidentReplayModal");
// time-critical during a run: warmed as soon as the title is dismissed (see preloadGameplayChunks)
export const loadIncidentDetail = () => import("../modals/IncidentDetailModal");
export const loadLogTriage = () => import("../modals/LogTriageTerminal");

export const HallOfFameModal = lazy(loadHallOfFame);
export const ScenarioSelectModal = lazy(loadScenarioSelect);
export const PostMatchDebriefModal = lazy(loadDebrief);
export const SettingsModal = lazy(loadSettings);
export const CreditsModal = lazy(loadCredits);
export const PauseMenuModal = lazy(loadPauseMenu);
export const ScenarioBuilderModal = lazy(loadScenarioBuilder);
export const ScenarioBriefingModal = lazy(loadScenarioBriefing);
export const PostMortemModal = lazy(loadPostMortem);
export const IncidentReplayModal = lazy(loadIncidentReplay);
export const IncidentDetailModal = lazy(loadIncidentDetail);
export const LogTriageTerminal = lazy(loadLogTriage);

// warm order: what the title screen can open first, then what a run opens
const WARM_ORDER = [
  loadIncidentDetail,
  loadLogTriage,
  loadScenarioSelect,
  loadSettings,
  loadScenarioBriefing,
  loadPauseMenu,
  loadHallOfFame,
  loadCredits,
  loadScenarioBuilder,
  loadDebrief,
  loadPostMortem,
  loadIncidentReplay,
];

let warmed = false;

// FETCH THE LAZY MODAL CHUNKS WHEN THE BROWSER IS IDLE, SO THE FIRST OPEN HAS NO BLANK BEAT
export function preloadFlowChunks(): void {
  if (warmed) return;
  warmed = true;
  const run = () => {
    // sequential, never in parallel with the first paint of the title
    WARM_ORDER.reduce<Promise<unknown>>((chain, load) => chain.then(load), Promise.resolve()).catch(() => {
      // offline or blocked: the normal on-demand import will retry when a dialog opens
      warmed = false;
    });
  };
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (typeof idle === "function") idle(run, { timeout: 3000 });
  else setTimeout(run, 1200);
}

let gameplayWarmed = false;

// FETCH THE LIVE-INCIDENT DIALOGS IMMEDIATELY (NOT ON IDLE) ONCE THE TITLE IS DISMISSED: the first
// incident of a run can need them within seconds, and a timed decision must never wait on a chunk
export function preloadGameplayChunks(): void {
  if (gameplayWarmed) return;
  gameplayWarmed = true;
  Promise.all([loadIncidentDetail(), loadLogTriage()]).catch(() => {
    gameplayWarmed = false;
  });
}
