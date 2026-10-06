import { describe, expect, it } from "vitest";
import { defconLightingTier, isRedAlertLevel } from "./defcon";
import { getDayNumber, getDaylight, getHourOfDay, getNightIntensity, getTwilight, START_HOUR } from "./officeClock";

describe("officeClock", () => {
  it("opens the session at 08:00 on day 1", () => {
    expect(START_HOUR).toBe(8);
    expect(getHourOfDay(0)).toBe(8);
    expect(getDayNumber(0)).toBe(1);
  });

  it("rolls the day over at midnight of the displayed clock", () => {
    expect(getHourOfDay(15)).toBe(23);
    expect(getDayNumber(15)).toBe(1);
    expect(getHourOfDay(16)).toBe(0);
    expect(getDayNumber(16)).toBe(2);
    expect(getHourOfDay(40)).toBe(0);
    expect(getDayNumber(40)).toBe(3);
  });

  it("is bright at midday and dark in the small hours", () => {
    expect(getDaylight(13)).toBe(1);
    expect(getDaylight(2)).toBe(0);
    expect(getNightIntensity(2)).toBe(1);
    expect(getDaylight(8)).toBeGreaterThan(0.9);
  });

  it("is continuous: no jump larger than a few percent between neighbouring minutes", () => {
    let prev = getDaylight(0);
    for (let m = 1; m <= 24 * 60; m++) {
      const cur = getDaylight(m / 60);
      expect(Math.abs(cur - prev)).toBeLessThan(0.02);
      prev = cur;
    }
  });

  it("wraps around the 24h loop and stays within 0..1", () => {
    expect(getDaylight(25)).toBeCloseTo(getDaylight(1));
    for (let h = 0; h < 24; h += 0.25) {
      const d = getDaylight(h);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });

  it("has a warm twilight only around dawn and dusk", () => {
    expect(getTwilight(13)).toBe(0);
    expect(getTwilight(2)).toBe(0);
    expect(getTwilight(19)).toBeGreaterThan(0.4);
    expect(getTwilight(6.5)).toBeGreaterThan(0.4);
  });
});

describe("defcon lighting tiers", () => {
  it("maps each level to its lighting tier", () => {
    expect(defconLightingTier(5)).toBe("nominal");
    expect(defconLightingTier(4)).toBe("watch");
    expect(defconLightingTier(3)).toBe("warning");
    expect(defconLightingTier(2)).toBe("alert");
    expect(defconLightingTier(1)).toBe("alert");
  });

  it("only levels 2 and 1 are a red alert", () => {
    expect([5, 4, 3, 2, 1].map((l) => isRedAlertLevel(l as 1 | 2 | 3 | 4 | 5))).toEqual([false, false, false, true, true]);
  });
});
