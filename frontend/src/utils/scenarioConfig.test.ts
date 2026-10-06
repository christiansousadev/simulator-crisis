import { describe, expect, it } from "vitest";
import { decodeChallengeCode, DEFAULT_CUSTOM_CONFIG, encodeChallengeCode, validateConfig } from "./scenarioConfig";

describe("validateConfig", () => {
  it("accepts the default configuration", () => {
    expect(validateConfig(DEFAULT_CUSTOM_CONFIG)).toEqual([]);
  });
  it("flags every value the backend would reject", () => {
    const errors = validateConfig({
      duration_ticks: 5,
      hazard_multiplier: 25,
      budget_floor: 250_000,
      chaos_injections: [
        { at_tick: 60, service_id: "srv-auth" },
        { at_tick: 3, service_id: "srv-unknown" },
      ],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "duration" },
        { field: "hazard" },
        { field: "budgetFloor" },
        { field: "injectionTick", index: 0 },
        { field: "injectionService", index: 1 },
      ])
    );
  });
});

describe("starting conditions", () => {
  const base = DEFAULT_CUSTOM_CONFIG;
  it("treats both fields as optional", () => {
    expect(validateConfig({ ...base, starting_budget: undefined, starting_tech_debt: undefined })).toEqual([]);
  });
  it("accepts values inside the backend bounds", () => {
    expect(validateConfig({ ...base, starting_budget: 400_000, starting_tech_debt: 60 })).toEqual([]);
    expect(validateConfig({ ...base, starting_budget: 1_000, budget_floor: 0, starting_tech_debt: 0 })).toEqual([]);
    expect(validateConfig({ ...base, starting_budget: 2_000_000, starting_tech_debt: 100 })).toEqual([]);
  });
  it("rejects a starting budget outside 1,000..2,000,000", () => {
    expect(validateConfig({ ...base, starting_budget: 999 })).toEqual([{ field: "startingBudgetRange" }]);
    expect(validateConfig({ ...base, starting_budget: 2_000_001 })).toEqual([{ field: "startingBudgetRange" }]);
  });
  it("rejects a starting budget at or below the budget floor, like the backend", () => {
    expect(validateConfig({ ...base, budget_floor: 50_000, starting_budget: 50_000 })).toEqual([{ field: "startingBudgetFloor" }]);
    expect(validateConfig({ ...base, budget_floor: 50_000, starting_budget: 50_001 })).toEqual([]);
  });
  it("rejects tech debt outside 0..100 or fractional", () => {
    expect(validateConfig({ ...base, starting_tech_debt: -1 })).toEqual([{ field: "startingTechDebt" }]);
    expect(validateConfig({ ...base, starting_tech_debt: 101 })).toEqual([{ field: "startingTechDebt" }]);
    expect(validateConfig({ ...base, starting_tech_debt: 12.5 })).toEqual([{ field: "startingTechDebt" }]);
  });
});

describe("challenge codes", () => {
  it("round-trips a config and rejects garbage", () => {
    const cfg = { ...DEFAULT_CUSTOM_CONFIG, chaos_injections: [{ at_tick: 12, service_id: "srv-search" }] };
    expect(decodeChallengeCode(encodeChallengeCode(cfg))).toEqual(cfg);
    expect(decodeChallengeCode("not base64!!")).toBeNull();
    expect(decodeChallengeCode(btoa(JSON.stringify({ nope: 1 })))).toBeNull();
  });

  it("round-trips the optional starting conditions", () => {
    const cfg = { ...DEFAULT_CUSTOM_CONFIG, starting_budget: 420_000, starting_tech_debt: 0 };
    expect(decodeChallengeCode(encodeChallengeCode(cfg))).toEqual(cfg);
  });
  it("leaves the starting conditions out of the code when they are unset", () => {
    const code = encodeChallengeCode({ ...DEFAULT_CUSTOM_CONFIG, starting_budget: undefined });
    const json = JSON.parse(atob(code)) as Record<string, unknown>;
    expect(Object.keys(json)).toEqual(["duration_ticks", "hazard_multiplier", "budget_floor", "chaos_injections"]);
  });
  it("still decodes an old code that predates the starting conditions", () => {
    const old = btoa(JSON.stringify({ duration_ticks: 90, hazard_multiplier: 2, budget_floor: 10000, chaos_injections: [{ at_tick: 5, service_id: "srv-auth" }] }));
    const decoded = decodeChallengeCode(old);
    expect(decoded).toEqual({ duration_ticks: 90, hazard_multiplier: 2, budget_floor: 10000, chaos_injections: [{ at_tick: 5, service_id: "srv-auth" }] });
    expect(decoded && "starting_budget" in decoded).toBe(false);
  });
  it("treats null starting fields as unset and rejects non-numeric ones", () => {
    const base = { duration_ticks: 60, hazard_multiplier: 1, budget_floor: 0, chaos_injections: [] };
    expect(decodeChallengeCode(btoa(JSON.stringify({ ...base, starting_budget: null })))).toEqual(base);
    expect(decodeChallengeCode(btoa(JSON.stringify({ ...base, starting_budget: "lots" })))).toBeNull();
    expect(decodeChallengeCode(btoa(JSON.stringify({ ...base, starting_tech_debt: {} })))).toBeNull();
  });
});
