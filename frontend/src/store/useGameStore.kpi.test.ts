import { beforeEach, describe, expect, it } from "vitest";
import { AuditLogEntry, TelemetryState } from "../types/game";
import { resetLocalSpendClaims, claimLocalSpend } from "../utils/localSpendClaims";
import { useGameStore } from "./useGameStore";

const audit = (id: string, event_type: string, details: Record<string, unknown>): AuditLogEntry => ({
  id,
  session_id: "s",
  timestamp: "2026-01-01T00:00:00",
  tick: 1,
  event_type,
  actor: "VP_OF_INFRA",
  details,
  compliance_flag: true,
});

function frame(over: Partial<TelemetryState>): TelemetryState {
  return { ...useGameStore.getState().telemetry, ...over };
}

describe("kpi events in the store", () => {
  beforeEach(() => {
    resetLocalSpendClaims();
    useGameStore.setState({ kpiEvents: [], budgetTrend: 0, floatingTexts: [], metricsHistory: [] });
    // seed the audit baseline with a clean frame
    useGameStore.getState().setTelemetry(frame({ session_id: "kpi-test", tick: 10, budget: 100000, recent_audits: [], active_incidents: [] }));
  });

  it("turns a new ledger entry into a labelled chip, separate from floating texts", () => {
    const before = useGameStore.getState().floatingTexts.length;
    useGameStore.getState().setTelemetry(
      frame({
        tick: 11,
        budget: 98200,
        recent_audits: [audit("a1", "UNATTENDED_ALERT_VIOLATION", { fine_amount: 1800, amount: -1800 })],
      })
    );
    const { kpiEvents, floatingTexts } = useGameStore.getState();
    expect(kpiEvents).toHaveLength(1);
    expect(kpiEvents[0]).toMatchObject({ kpi: "budget", amount: -1800 });
    // the existing fine toast still comes out, chips never replace or duplicate floating texts
    expect(floatingTexts.length).toBe(before + 1);
  });

  it("merges a burst of spends on the same kpi into one chip", () => {
    useGameStore.getState().setTelemetry(
      frame({
        tick: 11,
        budget: 95000,
        recent_audits: [
          audit("b1", "UNATTENDED_ALERT_VIOLATION", { amount: -1000 }),
          audit("b2", "UNATTENDED_ALERT_VIOLATION", { amount: -2000 }),
        ],
      })
    );
    const { kpiEvents } = useGameStore.getState();
    expect(kpiEvents).toHaveLength(1);
    expect(kpiEvents[0].amount).toBe(-3000);
    expect(kpiEvents[0].count).toBe(2);
  });

  it("does not draw a second chip for a spend the client already drew", () => {
    useGameStore.getState().pushKpiEvent("budget", -1800, "Rollback");
    claimLocalSpend("RUNBOOK_EXECUTED");
    useGameStore.getState().setTelemetry(
      frame({
        tick: 11,
        budget: 98200,
        recent_audits: [audit("c1", "RUNBOOK_EXECUTED", { action: "Rollback Canary", amount: -1800, tech_debt_delta: 0 })],
      })
    );
    const { kpiEvents } = useGameStore.getState();
    expect(kpiEvents).toHaveLength(1);
    expect(kpiEvents[0].amount).toBe(-1800);
    expect(kpiEvents[0].count).toBe(1);
  });

  it("shows plain passive burn as a per-tick trend instead of a chip", () => {
    useGameStore.getState().setTelemetry(frame({ tick: 11, budget: 99350, recent_audits: [] }));
    const { kpiEvents, budgetTrend } = useGameStore.getState();
    expect(kpiEvents).toHaveLength(0);
    expect(budgetTrend).toBe(-650);
  });

  it("records the real sla percentage in the metrics history", () => {
    useGameStore.getState().setTelemetry(frame({ tick: 12, sla_percentage: 98.7 }));
    const history = useGameStore.getState().metricsHistory;
    expect(history[history.length - 1].sla).toBe(98.7);
  });
});
