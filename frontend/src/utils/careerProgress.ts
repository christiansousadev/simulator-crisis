import { CareerRecord, CareerSummary, DifficultyId } from "../types/game";

// prestige needed for each operator rank, mirrors backend _calculate_operator_rank (api/v1/career.py).
// The backend also promotes by achievement count, so the bar is "prestige toward the next
// threshold", which can lag the rank label for a player promoted through achievements.
export const RANK_PRESTIGE_THRESHOLDS = [0, 50, 150, 300, 500] as const;

export interface RankProgress {
  // index of the highest threshold reached
  tier: number;
  floor: number;
  // null at the top rank
  next: number | null;
  // 0..1 progress between floor and next (1 at the top rank)
  fraction: number;
}

export function rankProgress(prestige: number): RankProgress {
  let tier = 0;
  RANK_PRESTIGE_THRESHOLDS.forEach((threshold, idx) => {
    if (prestige >= threshold) tier = idx;
  });
  const floor = RANK_PRESTIGE_THRESHOLDS[tier];
  const next = tier + 1 < RANK_PRESTIGE_THRESHOLDS.length ? RANK_PRESTIGE_THRESHOLDS[tier + 1] : null;
  const fraction = next === null ? 1 : Math.min(1, Math.max(0, (prestige - floor) / (next - floor)));
  return { tier, floor, next, fraction };
}

export interface RunPrestige {
  earned: number;
  before: number;
  after: number;
}

// PRESTIGE THIS RUN EARNED. The API has no per-run field on the summary, so it is derived: the
// newest career record is this run (when its outcome matches), and lifetime prestige in the summary
// already includes it. Null when either piece is missing.
export function deriveRunPrestige(
  latest: CareerRecord | undefined,
  summary: CareerSummary | null,
  victory: boolean
): RunPrestige | null {
  if (!latest || !summary) return null;
  if ((latest.outcome === "victory") !== victory) return null;
  const earned = Math.max(0, latest.prestige_earned ?? 0);
  const after = summary.lifetime_prestige;
  return { earned, after, before: Math.max(0, after - earned) };
}

// BEST PREVIOUS RUN FOR THE SAME SCENARIO + DIFFICULTY, EXCLUDING THE RECORD JUST SAVED (index 0)
export function findPreviousBest(records: CareerRecord[], scenarioId: string | null, difficulty: DifficultyId): CareerRecord | null {
  if (records.length <= 1) return null;
  const candidates = records.slice(1).filter((r) => {
    const sameScenario = scenarioId ? r.scenario_id === scenarioId : r.scenario_id === null || r.scenario_id === "sandbox";
    return sameScenario && (r.difficulty ?? "standard") === difficulty;
  });
  if (candidates.length === 0) return null;
  return candidates.reduce((best, curr) => {
    if (curr.outcome === "victory" && best.outcome !== "victory") return curr;
    if (curr.outcome !== "victory" && best.outcome === "victory") return best;
    if (curr.final_sla_percentage > best.final_sla_percentage) return curr;
    if (curr.days_survived > best.days_survived) return curr;
    return best;
  }, candidates[0]);
}

export function isNewPersonalRecord(finalSla: number, victory: boolean, previousBest: CareerRecord | null): boolean {
  if (!previousBest) return false;
  return finalSla - previousBest.final_sla_percentage > 0.05 || (victory && previousBest.outcome !== "victory");
}

// ACHIEVEMENTS UNLOCKED SINCE THE RUN STARTED. The telemetry list is permanent career progress,
// so "new this run" is tracked by diffing frames: the first frame is the baseline, a tick
// regression (reset) starts over.
export interface AchievementTracker {
  baseline: string[] | null;
  lastTick: number;
  gained: string[];
}

export function emptyAchievementTracker(): AchievementTracker {
  return { baseline: null, lastTick: 0, gained: [] };
}

export function trackAchievements(prev: AchievementTracker, unlocked: string[], tick: number): AchievementTracker {
  const reset = tick < prev.lastTick;
  if (prev.baseline === null || reset) return { baseline: [...unlocked], lastTick: tick, gained: [] };
  const known = new Set([...prev.baseline, ...prev.gained]);
  const fresh = unlocked.filter((id) => !known.has(id));
  if (fresh.length === 0 && tick === prev.lastTick) return prev;
  return { baseline: prev.baseline, lastTick: tick, gained: fresh.length ? [...prev.gained, ...fresh] : prev.gained };
}
