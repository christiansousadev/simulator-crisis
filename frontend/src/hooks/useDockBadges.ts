import { useEffect, useState } from "react";
import { countAffordableUpgrades } from "../components/dock/upgradeCatalog";
import { useGameStore } from "../store/useGameStore";
import { HIGH_STRESS_THRESHOLD } from "../utils/kpiBands";

export interface DockBadges {
  incidents: number;
  roster: number;
  upgrades: number;
  achievements: number;
}

// PER-TAB ACTIVITY COUNTS FOR THE DOCK: open incidents, stressed engineers, upgrades the cash can buy
// right now, and achievements unlocked since the achievements tab was last looked at. Every input
// is a primitive selector, so the dock only re-renders when a count actually changes.
export function useDockBadges(achievementsVisible: boolean): DockBadges {
  const incidents = useGameStore((s) => s.telemetry.active_incidents.length);
  const roster = useGameStore((s) => s.telemetry.engineers.filter((e) => e.stress_index >= HIGH_STRESS_THRESHOLD).length);
  const upgrades = useGameStore((s) => countAffordableUpgrades(s.telemetry.budget, s.telemetry.purchased_upgrades));
  const unlocked = useGameStore((s) => s.telemetry.achievements_unlocked);
  const tick = useGameStore((s) => s.telemetry.tick);

  // ids the player has already seen. null until the first real frame, so loading a run that already
  // has achievements does not light the badge up
  const [seen, setSeen] = useState<Set<string> | null>(null);

  useEffect(() => {
    setSeen((prev) => {
      if (prev === null) return tick > 0 || unlocked.length === 0 ? new Set(unlocked) : null;
      if (achievementsVisible) return unlocked.every((id) => prev.has(id)) ? prev : new Set(unlocked);
      // a reset can shrink the list: forget ids that are gone
      return [...prev].every((id) => unlocked.includes(id)) ? prev : new Set([...prev].filter((id) => unlocked.includes(id)));
    });
  }, [unlocked, tick, achievementsVisible]);

  const achievements = seen ? unlocked.filter((id) => !seen.has(id)).length : 0;
  return { incidents, roster, upgrades, achievements };
}
