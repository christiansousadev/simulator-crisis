import { describe, expect, it } from "vitest";
import { MAX_DEBRIEF_MS, planDebrief, reachedStages } from "./debriefTimeline";

const full = { metricCount: 5, objectiveCount: 3, hasRecord: true, hasPrestige: true, hasAchievements: true, reduced: false };

describe("planDebrief", () => {
  it("orders the stages backdrop -> stamp -> metrics -> grade -> objectives -> record -> prestige -> achievements -> actions", () => {
    const plan = planDebrief(full);
    expect(plan.steps.map((s) => s.id)).toEqual(["backdrop", "stamp", "metrics", "grade", "objectives", "record", "prestige", "achievements", "actions"]);
    const times = plan.steps.map((s) => s.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times[0]).toBe(0);
  });

  it("never takes longer than the cap, even with many objectives", () => {
    const plan = planDebrief({ ...full, objectiveCount: 40, metricCount: 30 });
    expect(plan.totalMs).toBeLessThanOrEqual(MAX_DEBRIEF_MS);
    expect(plan.steps[plan.steps.length - 1].id).toBe("actions");
  });

  it("skips stages that have nothing to show", () => {
    const ids = planDebrief({ ...full, objectiveCount: 0, hasRecord: false, hasAchievements: false }).steps.map((s) => s.id);
    expect(ids).not.toContain("objectives");
    expect(ids).not.toContain("record");
    expect(ids).not.toContain("achievements");
    expect(ids).toContain("actions");
  });

  it("reduced motion shows the final state immediately", () => {
    const plan = planDebrief({ ...full, reduced: true });
    expect(plan.totalMs).toBe(0);
    expect(plan.steps.every((s) => s.at === 0)).toBe(true);
    expect(reachedStages(plan, 0).has("actions")).toBe(true);
  });

  it("reachedStages follows elapsed time", () => {
    const plan = planDebrief(full);
    expect(reachedStages(plan, 0).has("stamp")).toBe(false);
    expect(reachedStages(plan, Infinity).size).toBe(plan.steps.length);
  });
});
