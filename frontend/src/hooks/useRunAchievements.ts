import { useEffect } from "react";
import { useFlowStore } from "../store/useFlowStore";
import { useGameStore } from "../store/useGameStore";
import { AchievementTracker, emptyAchievementTracker, trackAchievements } from "../utils/careerProgress";

// FEEDS useFlowStore.runAchievements: which achievements were unlocked during the current run,
// diffed from telemetry frames (the frame list itself is permanent career progress)
export function useRunAchievements() {
  useEffect(() => {
    let tracker: AchievementTracker = emptyAchievementTracker();
    // the pre-connection placeholder is not a real frame: seeding the baseline from it would
    // report the player's whole career as "unlocked this run"
    const placeholder = useGameStore.getState().telemetry;
    const feed = () => {
      const telemetry = useGameStore.getState().telemetry;
      if (telemetry === placeholder) return;
      const { achievements_unlocked, tick } = telemetry;
      const next = trackAchievements(tracker, achievements_unlocked ?? [], tick);
      if (next === tracker) return;
      const changed = next.gained !== tracker.gained;
      tracker = next;
      if (changed) useFlowStore.getState().setRunAchievements(next.gained);
    };
    feed();
    return useGameStore.subscribe(feed);
  }, []);
}
