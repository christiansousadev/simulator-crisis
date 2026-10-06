import { describe, expect, it } from "vitest";
import { CABINET_COLOR, clockHandAngles, deskScreenColor, isNightHour, ledPatternFor, ledPhaseMs } from "./officeLifeUtils";

describe("ledPhaseMs", () => {
  it("is deterministic per rack and led", () => {
    expect(ledPhaseMs("srv-auth", 1, 3200)).toBe(ledPhaseMs("srv-auth", 1, 3200));
  });

  it("is a negative delay inside one period and differs between leds and racks", () => {
    const phases = new Set<number>();
    for (const id of ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"]) {
      for (let i = 0; i < 3; i++) {
        const p = ledPhaseMs(id, i, 3200);
        expect(p).toBeLessThanOrEqual(0);
        expect(p).toBeGreaterThan(-3200);
        phases.add(p);
      }
    }
    // 15 leds must not all blink in phase
    expect(phases.size).toBeGreaterThan(10);
  });
});

describe("led and cabinet by status", () => {
  it("breathes when healthy, stutters when degraded, stays solid when down", () => {
    expect(ledPatternFor("healthy")).toBe("breathe");
    expect(ledPatternFor("degraded")).toBe("stutter");
    expect(ledPatternFor("down")).toBe("solid");
  });
  it("tints the cabinet differently per status", () => {
    expect(new Set(Object.values(CABINET_COLOR)).size).toBe(3);
  });
});

describe("clockHandAngles", () => {
  it("puts the hour hand where the game hour is", () => {
    expect(clockHandAngles(0).hour).toBe(0);
    expect(clockHandAngles(3).hour).toBe(90);
    expect(clockHandAngles(12).hour).toBe(0);
    expect(clockHandAngles(18).hour).toBe(180);
    expect(clockHandAngles(23).minute).toBe(0);
  });
  it("wraps negative and large hours", () => {
    expect(clockHandAngles(27).hour).toBe(90);
    expect(clockHandAngles(-1).hour).toBe(330);
  });
});

describe("isNightHour", () => {
  it("matches the day phases used by the lighting", () => {
    expect(isNightHour(23)).toBe(true);
    expect(isNightHour(2)).toBe(true);
    expect(isNightHour(12)).toBe(false);
  });
});

describe("deskScreenColor", () => {
  const base = { status: "healthy" as const, investigating: false, mitigating: false, engineerPresent: false };
  it("is dark with nobody at a healthy desk and lit when somebody works there", () => {
    expect(deskScreenColor(base)).toBeNull();
    expect(deskScreenColor({ ...base, engineerPresent: true })).toBe("#38bdf8");
  });
  it("shows the incident state on the monitors", () => {
    expect(deskScreenColor({ ...base, status: "down" })).toBe("#ef4444");
    expect(deskScreenColor({ ...base, mitigating: true })).toBe("#10b981");
    expect(deskScreenColor({ ...base, investigating: true })).toBe("#f59e0b");
  });
});
