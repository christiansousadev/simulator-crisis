import { describe, expect, it } from "vitest";
import { Incident } from "../types/game";
import { accruedSurcharge, surchargePerTick, wrongAttemptsOf } from "./incidentSurcharge";

const base: Incident = {
  id: "inc-1",
  session_id: "s",
  service_id: "svc",
  severity: "P1_CRITICAL",
  title: "t",
  root_cause: null,
  mtta_seconds: 0,
  mttr_seconds: 0,
  status: "active",
  created_tick: 0,
  acknowledged_tick: null,
  resolved_tick: null,
  triage_solved: false,
};

describe("surcharge", () => {
  it("mirrors the backend per-tick formula", () => {
    expect(surchargePerTick("P1_CRITICAL", 0)).toBe(800);
    expect(surchargePerTick("P1_CRITICAL", 10)).toBeCloseTo(800 * Math.pow(1.8, 1.3), 6);
    expect(surchargePerTick("P4_LOW", 0)).toBe(40);
  });

  it("prefers the figure on the wire, otherwise estimates", () => {
    expect(accruedSurcharge({ ...base, accrued_surcharge: 1234.5 } as Incident, 5)).toBe(1234.5);
    expect(accruedSurcharge(base, 0)).toBe(0);
    expect(accruedSurcharge(base, 2)).toBeCloseTo(800 + surchargePerTick("P1_CRITICAL", 1), 6);
  });

  it("reads recorded wrong triage attempts defensively", () => {
    expect(wrongAttemptsOf({ ...base, triage_wrong_attempts: 3 } as Incident)).toBe(3);
    expect(wrongAttemptsOf(base)).toBe(0);
    expect(wrongAttemptsOf(null)).toBe(0);
  });
});
