import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { deriveMusicMode, isTerminalStatus } from "../utils/audioMode";
import { computeDefconLevel } from "../utils/defcon";
import {
  MusicTension,
  setMusicDefcon,
  setMusicMode,
  setMusicTension,
  startAmbientMusic,
  unlockAudio,
} from "../utils/sound";

// STARTS THE MUSIC ENGINE ON THE FIRST CLICK OR KEYPRESS, THEN KEEPS ITS MODE (MENU / GAME / PAUSED),
// TENSION AND DEFCON LAYERS IN SYNC WITH THE GAME
export function useBackgroundMusic() {
  const activeIncidentCount = useGameStore((s) => s.telemetry.active_incidents.length);
  const featureFreezeActive = useGameStore((s) => s.telemetry.feature_freeze_active);
  const status = useGameStore((s) => s.telemetry.status);
  const isRunning = useGameStore((s) => s.telemetry.is_running);
  const titleScreenVisible = useGameStore((s) => s.titleScreenVisible);
  const pauseMenuOpen = useGameStore((s) => s.pauseMenuOpen);
  const defcon = useGameStore((s) => computeDefconLevel(s.telemetry));

  useEffect(() => {
    // browsers require a user gesture before an audiocontext may produce sound
    const handleFirstGesture = () => {
      unlockAudio();
      startAmbientMusic();
      window.removeEventListener("pointerdown", handleFirstGesture);
      window.removeEventListener("keydown", handleFirstGesture);
    };
    window.addEventListener("pointerdown", handleFirstGesture);
    window.addEventListener("keydown", handleFirstGesture);
    return () => {
      window.removeEventListener("pointerdown", handleFirstGesture);
      window.removeEventListener("keydown", handleFirstGesture);
    };
  }, []);

  useEffect(() => {
    // settingsOpen is deliberately not a music input: the bed stays unmuffled so the music slider is audible
    setMusicMode(deriveMusicMode({ titleScreenVisible, pauseMenuOpen, settingsOpen: false, isRunning, status }));
  }, [titleScreenVisible, pauseMenuOpen, isRunning, status]);

  useEffect(() => {
    setMusicDefcon(defcon);
  }, [defcon]);

  useEffect(() => {
    if (isTerminalStatus(status)) return;
    let tension: MusicTension = "calm";
    if (featureFreezeActive || activeIncidentCount >= 3) tension = "critical";
    else if (activeIncidentCount >= 1) tension = "tense";
    setMusicTension(tension);
  }, [activeIncidentCount, featureFreezeActive, status]);
}
