// STAGED REVEAL OF THE POST-MATCH DEBRIEF. The planner is pure: it only decides WHEN each stage
// starts, so the sequence can be unit-tested without timers, and the component just schedules it.

export type DebriefStageId =
  | "backdrop"
  | "stamp"
  | "metrics"
  | "grade"
  | "objectives"
  | "record"
  | "prestige"
  | "achievements"
  | "actions";

export interface DebriefStep {
  id: DebriefStageId;
  // ms after the debrief opened
  at: number;
}

export interface DebriefPlanInput {
  metricCount: number;
  objectiveCount: number;
  hasRecord: boolean;
  hasPrestige: boolean;
  hasAchievements: boolean;
  // reduced motion: everything is shown at once
  reduced: boolean;
}

export interface DebriefPlan {
  steps: DebriefStep[];
  totalMs: number;
}

// the whole show must never keep the player waiting longer than this
export const MAX_DEBRIEF_MS = 3000;

const METRIC_STAGGER_MS = 90;
const OBJECTIVE_STAGGER_MS = 140;

export function planDebrief(input: DebriefPlanInput): DebriefPlan {
  const ids: DebriefStageId[] = ["backdrop", "stamp", "metrics", "grade", "objectives", "record", "prestige", "achievements", "actions"];
  const present = (id: DebriefStageId) => {
    if (id === "objectives") return input.objectiveCount > 0;
    if (id === "record") return input.hasRecord;
    if (id === "prestige") return input.hasPrestige;
    if (id === "achievements") return input.hasAchievements;
    return true;
  };

  if (input.reduced) {
    return { steps: ids.filter(present).map((id) => ({ id, at: 0 })), totalMs: 0 };
  }

  // how long each stage occupies before the next one may start
  const holdMs: Record<DebriefStageId, number> = {
    backdrop: 350,
    stamp: 550,
    metrics: Math.max(1, input.metricCount) * METRIC_STAGGER_MS + 450,
    grade: 350,
    objectives: Math.min(700, input.objectiveCount * OBJECTIVE_STAGGER_MS + 200),
    record: 300,
    prestige: 450,
    achievements: 300,
    actions: 0,
  };

  const raw: DebriefStep[] = [];
  let cursor = 0;
  for (const id of ids) {
    if (!present(id)) continue;
    raw.push({ id, at: cursor });
    cursor += holdMs[id];
  }
  const totalMs = raw[raw.length - 1].at;
  // squeeze (never stretch) so the actions always show up within the cap
  const scale = totalMs > MAX_DEBRIEF_MS ? MAX_DEBRIEF_MS / totalMs : 1;
  const steps = raw.map((s) => ({ id: s.id, at: Math.round(s.at * scale) }));
  return { steps, totalMs: steps[steps.length - 1].at };
}

// STAGES THAT HAVE STARTED BY `elapsedMs`; Infinity means "skipped": everything
export function reachedStages(plan: DebriefPlan, elapsedMs: number): Set<DebriefStageId> {
  return new Set(plan.steps.filter((s) => s.at <= elapsedMs).map((s) => s.id));
}
