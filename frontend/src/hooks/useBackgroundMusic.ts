import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { MusicTension, setMusicTension, startAmbientMusic } from "../utils/sound";

// STARTS THE AMBIENT MUSIC LOOP ON THE FIRST CLICK OR KEYPRESS, THEN RETUNES ITS TENSION LIVE
export function useBackgroundMusic() {
  const activeIncidentCount = useGameStore((s) => s.telemetry.active_incidents.length);
  const featureFreezeActive = useGameStore((s) => s.telemetry.feature_freeze_active);
  const status = useGameStore((s) => s.telemetry.status);

  useEffect(() => {
    // browsers require a user gesture before an audiocontext may produce sound
    const handleFirstGesture = () => {
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
    if (status === "bankrupted" || status === "victory") return;
    let tension: MusicTension = "calm";
    if (featureFreezeActive || activeIncidentCount >= 3) tension = "critical";
    else if (activeIncidentCount >= 1) tension = "tense";
    setMusicTension(tension);
  }, [activeIncidentCount, featureFreezeActive, status]);
}
