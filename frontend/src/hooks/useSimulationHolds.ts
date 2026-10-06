import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { simPause } from "../utils/simPause";

// WHICH SCREENS PAUSE THE SIMULATION WHILE THEY ARE OPEN. Pure so the mapping is unit-testable.
export function pauseReasons(state: {
  titleScreenVisible: boolean;
  pauseMenuOpen: boolean;
  scenarioBriefingOpen: boolean;
}): string[] {
  const reasons: string[] = [];
  if (state.titleScreenVisible) reasons.push("title");
  if (state.pauseMenuOpen) reasons.push("pause-menu");
  if (state.scenarioBriefingOpen) reasons.push("briefing");
  return reasons;
}

// KEEPS THE BACKEND ENGINE PAUSED UNDER THE TITLE SCREEN, THE PAUSE MENU AND THE SCENARIO
// BRIEFING, AND PUTS THE PRE-OPEN RUN STATE BACK WHEN THE LAST OF THEM CLOSES
export function useSimulationHolds() {
  const titleScreenVisible = useGameStore((s) => s.titleScreenVisible);
  const pauseMenuOpen = useGameStore((s) => s.pauseMenuOpen);
  const scenarioBriefingOpen = useGameStore((s) => s.scenarioBriefing !== null);
  // wait for the socket: before it connects there may be no backend to talk to at all
  const connected = useGameStore((s) => s.connected);

  useEffect(() => {
    if (!connected) return;
    void simPause.sync(pauseReasons({ titleScreenVisible, pauseMenuOpen, scenarioBriefingOpen }));
  }, [connected, titleScreenVisible, pauseMenuOpen, scenarioBriefingOpen]);
}
