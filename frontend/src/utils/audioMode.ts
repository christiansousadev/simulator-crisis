// pure helpers mapping the app state to what the audio engine should be doing

import type { MusicMode } from "./musicEngine";

export interface AudioAppState {
  titleScreenVisible: boolean;
  pauseMenuOpen: boolean;
  settingsOpen: boolean;
  isRunning: boolean;
  status: string;
}

export function isTerminalStatus(status: string): boolean {
  return status === "bankrupted" || status === "victory";
}

// menu theme on the title, the muffled bed whenever the simulation is stopped, the full bed otherwise
export function deriveMusicMode(s: AudioAppState): MusicMode {
  if (s.titleScreenVisible) return "menu";
  if (s.pauseMenuOpen || !s.isRunning || isTerminalStatus(s.status)) return "paused";
  return "game";
}

// the looping alarms only sound while the game is truly in play: not on the title, not paused,
// not behind a menu and not after the run has ended
export function isGameplayActive(s: AudioAppState): boolean {
  return !s.titleScreenVisible && !s.pauseMenuOpen && !s.settingsOpen && s.isRunning && !isTerminalStatus(s.status);
}
