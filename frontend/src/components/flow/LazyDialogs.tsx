import { useGameStore } from "../../store/useGameStore";
import LazyModalHost from "./LazyModalHost";
import {
  CreditsModal,
  IncidentDetailModal,
  IncidentReplayModal,
  LogTriageTerminal,
  PauseMenuModal,
  PostMortemModal,
  ScenarioBriefingModal,
  ScenarioBuilderModal,
  SettingsModal,
} from "./lazyModals";

// THE CODE-SPLIT DIALOGS THAT ARE NOT NEEDED FOR THE FIRST PAINT. Each dialog still reads its own
// store state and runs its own enter/exit animation (usePresence / Modal): the host only decides when
// the chunk is first needed and keeps it mounted afterwards, so closing still animates out. This
// component subscribes to the open flags (booleans), so the heavy App tree does not re-render on them.
export default function LazyDialogs() {
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const closeSettings = useGameStore((s) => s.closeSettings);
  const creditsOpen = useGameStore((s) => s.creditsOpen);
  const closeCredits = useGameStore((s) => s.closeCredits);
  const pauseMenuOpen = useGameStore((s) => s.pauseMenuOpen);
  const closePauseMenu = useGameStore((s) => s.closePauseMenu);
  const builderOpen = useGameStore((s) => s.scenarioBuilderOpen);
  const closeBuilder = useGameStore((s) => s.closeScenarioBuilder);
  const briefingOpen = useGameStore((s) => s.scenarioBriefing !== null);
  const closeBriefing = useGameStore((s) => s.closeScenarioBriefing);
  const postMortemOpen = useGameStore((s) => s.postMortem !== null);
  const closePostMortem = useGameStore((s) => s.closePostMortem);
  const detailOpen = useGameStore((s) => s.selectedIncident !== null);
  const closeDetail = useGameStore((s) => s.closeIncidentDetail);
  const triageOpen = useGameStore((s) => s.triageIncidentId !== null);
  const closeTriage = useGameStore((s) => s.closeTriageTerminal);
  const replayOpen = useGameStore((s) => s.replayIncidentId !== null);
  const closeReplay = useGameStore((s) => s.closeIncidentReplay);

  return (
    <>
      {/* live-incident dialogs: preloaded when the title is dismissed (preloadGameplayChunks) */}
      <LazyModalHost open={detailOpen} onCancel={closeDetail}>
        <IncidentDetailModal />
      </LazyModalHost>
      <LazyModalHost open={triageOpen} onCancel={closeTriage}>
        <LogTriageTerminal />
      </LazyModalHost>
      <LazyModalHost open={settingsOpen} onCancel={closeSettings}>
        <SettingsModal />
      </LazyModalHost>
      <LazyModalHost open={creditsOpen} onCancel={closeCredits}>
        <CreditsModal />
      </LazyModalHost>
      <LazyModalHost open={builderOpen} onCancel={closeBuilder}>
        <ScenarioBuilderModal />
      </LazyModalHost>
      {/* closing the briefing (also when its chunk fails) simply begins the shift */}
      <LazyModalHost open={briefingOpen} onCancel={closeBriefing}>
        <ScenarioBriefingModal />
      </LazyModalHost>
      <LazyModalHost open={pauseMenuOpen} onCancel={closePauseMenu}>
        <PauseMenuModal />
      </LazyModalHost>
      <LazyModalHost open={postMortemOpen} onCancel={closePostMortem}>
        <PostMortemModal />
      </LazyModalHost>
      <LazyModalHost open={replayOpen} onCancel={closeReplay}>
        <IncidentReplayModal />
      </LazyModalHost>
    </>
  );
}
