import { describe, expect, it } from "vitest";
import { CareerRecord, CareerSummary } from "../types/game";
import {
  deriveRunPrestige,
  emptyAchievementTracker,
  findPreviousBest,
  isNewPersonalRecord,
  rankProgress,
  trackAchievements,
} from "./careerProgress";

const record = (patch: Partial<CareerRecord>): CareerRecord => ({
  id: "r",
  player_id: "p",
  scenario_id: null,
  difficulty: "standard",
  outcome: "victory",
  days_survived: 30,
  final_sla_percentage: 99.5,
  final_budget: 1000,
  prestige_earned: 40,
  final_tech_debt: 10,
  final_reputation: 50,
  incidents_total: 5,
  incidents_resolved: 5,
  scenario_outcome: null,
  objectives: null,
  ...patch,
});
const summary = { lifetime_prestige: 120 } as CareerSummary;

describe("rankProgress", () => {
  it("reports the tier, the next threshold and the fraction towards it", () => {
    expect(rankProgress(0)).toMatchObject({ tier: 0, next: 50, fraction: 0 });
    expect(rankProgress(100)).toMatchObject({ tier: 1, floor: 50, next: 150, fraction: 0.5 });
    expect(rankProgress(900)).toMatchObject({ tier: 4, next: null, fraction: 1 });
  });
});

describe("deriveRunPrestige", () => {
  it("derives before/after from the newest record and the lifetime total", () => {
    expect(deriveRunPrestige(record({}), summary, true)).toEqual({ earned: 40, before: 80, after: 120 });
  });
  it("is null when the newest record is not this run or data is missing", () => {
    expect(deriveRunPrestige(record({ outcome: "bankrupted" }), summary, true)).toBeNull();
    expect(deriveRunPrestige(undefined, summary, true)).toBeNull();
    expect(deriveRunPrestige(record({}), null, true)).toBeNull();
  });
});

describe("previous best and records", () => {
  const records = [
    record({ id: "now", final_sla_percentage: 99.9 }),
    record({ id: "old-low", final_sla_percentage: 98 }),
    record({ id: "old-high", final_sla_percentage: 99.2 }),
    record({ id: "other", scenario_id: "black_friday_rush", final_sla_percentage: 99.99 }),
  ];
  it("excludes the record just saved and other scenarios", () => {
    expect(findPreviousBest(records, null, "standard")?.id).toBe("old-high");
    expect(findPreviousBest(records.slice(0, 1), null, "standard")).toBeNull();
  });
  it("flags a record only against a previous best", () => {
    expect(isNewPersonalRecord(99.9, true, record({ final_sla_percentage: 99.2 }))).toBe(true);
    expect(isNewPersonalRecord(99.2, true, record({ final_sla_percentage: 99.2 }))).toBe(false);
    expect(isNewPersonalRecord(99.9, true, null)).toBe(false);
  });
});

describe("trackAchievements", () => {
  it("treats the first frame as the baseline, then collects new unlocks", () => {
    let t = trackAchievements(emptyAchievementTracker(), ["a"], 5);
    expect(t.gained).toEqual([]);
    t = trackAchievements(t, ["a", "b"], 6);
    expect(t.gained).toEqual(["b"]);
    t = trackAchievements(t, ["a", "b", "c"], 7);
    expect(t.gained).toEqual(["b", "c"]);
  });
  it("starts over when the tick regresses (a new run)", () => {
    let t = trackAchievements(emptyAchievementTracker(), [], 10);
    t = trackAchievements(t, ["x"], 11);
    expect(t.gained).toEqual(["x"]);
    t = trackAchievements(t, ["x"], 0);
    expect(t.gained).toEqual([]);
  });
});
