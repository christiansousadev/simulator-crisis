import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAB_WINDOW_TICKS,
  deadlineFraction,
  deadlineTone,
  isFavorable,
  outcomeFromAudit,
  projectMeters,
  remainingSeconds,
  remainingTicks,
  shouldCountdownBeep,
  smoothRemainingTicks,
  windowTotalTicks,
} from "./cabDeadline";

describe("cab deadline units", () => {
  it("never reports negative ticks", () => {
    expect(remainingTicks(40, 30)).toBe(10);
    expect(remainingTicks(40, 55)).toBe(0);
  });

  it("converts ticks to whole seconds using the tick rate, rounding up", () => {
    expect(remainingSeconds(10, 1)).toBe(10);
    expect(remainingSeconds(10, 0.5)).toBe(5); // 2x game speed
    expect(remainingSeconds(3, 0.1)).toBe(1);
    expect(remainingSeconds(7, 0.2)).toBe(2);
    expect(remainingSeconds(1, 0.01)).toBe(1); // never shows 0s while the window is open
    expect(remainingSeconds(0, 1)).toBe(0);
  });

  it("falls back to 1 s per tick for a missing or invalid rate", () => {
    expect(remainingSeconds(4, 0)).toBe(4);
    expect(remainingSeconds(4, undefined as unknown as number)).toBe(4);
  });
});

describe("smooth remaining", () => {
  it("glides within a tick but never past the next one", () => {
    expect(smoothRemainingTicks(10, 0, 1)).toBe(10);
    expect(smoothRemainingTicks(10, 500, 1)).toBeCloseTo(9.5);
    expect(smoothRemainingTicks(10, 5000, 1)).toBeGreaterThan(9);
  });

  it("scales with the tick rate", () => {
    expect(smoothRemainingTicks(10, 250, 0.5)).toBeCloseTo(9.5);
  });

  it("holds still while the game is paused and at zero", () => {
    expect(smoothRemainingTicks(10, 700, 1, false)).toBe(10);
    expect(smoothRemainingTicks(0, 700, 1)).toBe(0);
  });
});

describe("fraction and tone", () => {
  it("clamps the fraction", () => {
    expect(deadlineFraction(15, 30)).toBe(0.5);
    expect(deadlineFraction(40, 30)).toBe(1);
    expect(deadlineFraction(5, 0)).toBe(0);
  });

  it("goes blue, then amber, then red", () => {
    expect(deadlineTone(0.9, 27)).toBe("calm");
    expect(deadlineTone(0.45, 13)).toBe("warn");
    expect(deadlineTone(0.15, 4)).toBe("critical");
  });

  it("is red in the last five seconds even for a long window", () => {
    expect(deadlineTone(0.9, 5)).toBe("critical");
  });

  it("uses the default window when the offer tick is unknown", () => {
    expect(windowTotalTicks(60, null)).toBe(DEFAULT_CAB_WINDOW_TICKS);
    expect(windowTotalTicks(60, 30)).toBe(30);
    expect(windowTotalTicks(60, 60)).toBe(1);
  });
});

describe("countdown beep", () => {
  it("beeps once per second in the final five", () => {
    expect(shouldCountdownBeep(6, 7)).toBe(false);
    expect(shouldCountdownBeep(5, 6)).toBe(true);
    expect(shouldCountdownBeep(5, 5)).toBe(false);
    expect(shouldCountdownBeep(1, 2)).toBe(true);
    expect(shouldCountdownBeep(0, 1)).toBe(false);
  });
});

describe("meter projection", () => {
  const current = { budget: 10000, techDebt: 95, morale: 3, reputation: 50 };

  it("applies the deltas with the engine's clamps", () => {
    expect(projectMeters(current, { budget: -2500, techDebt: 12, morale: -10, reputation: 5 })).toEqual({
      budget: 7500,
      techDebt: 100,
      morale: 0,
      reputation: 55,
    });
  });

  it("treats lower tech debt as favorable", () => {
    expect(isFavorable("techDebt", -3)).toBe(true);
    expect(isFavorable("budget", -3)).toBe(false);
    expect(isFavorable("morale", 2)).toBe(true);
  });
});

describe("dilemma outcome detection", () => {
  const details = { dilemma_id: "d1", choice_id: "c2", auto_resolved: true, budget_delta: -500, tech_debt_delta: 4, happiness_delta: -2, reputation_delta: 0 };

  it("tells an expired dilemma from an explicit choice", () => {
    expect(outcomeFromAudit(details)?.kind).toBe("expired");
    expect(outcomeFromAudit({ ...details, auto_resolved: false })?.kind).toBe("explicit");
  });

  it("reads the applied deltas and tolerates junk", () => {
    expect(outcomeFromAudit(details)?.deltas).toEqual({ budget: -500, techDebt: 4, morale: -2, reputation: 0 });
    expect(outcomeFromAudit({ budget_delta: "x" })?.deltas.budget).toBe(0);
    expect(outcomeFromAudit(undefined)).toBeNull();
  });
});
