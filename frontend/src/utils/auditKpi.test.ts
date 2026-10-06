import { afterEach, describe, expect, it } from "vitest";
import { TRANSLATIONS } from "../i18n/translations";
import { AuditLogEntry } from "../types/game";
import { auditKpiInputs } from "./auditKpi";
import { claimLocalSpend, consumeLocalSpend, resetLocalSpendClaims } from "./localSpendClaims";

const dict = TRANSLATIONS.en;
const audit = (event_type: string, details: Record<string, unknown>): AuditLogEntry => ({
  id: "a",
  session_id: "s",
  timestamp: "2026-01-01T00:00:00",
  tick: 1,
  event_type,
  actor: "VP_OF_INFRA",
  details,
  compliance_flag: true,
});

afterEach(() => resetLocalSpendClaims());

describe("auditKpiInputs", () => {
  it("turns a runbook into a cash chip and a tech debt chip labelled with the runbook", () => {
    const out = auditKpiInputs(
      audit("RUNBOOK_EXECUTED", { action: "Rollback Canary", amount: -1800, cost: 1800, tech_debt_delta: -2 }),
      dict,
      () => false
    );
    expect(out).toEqual([
      { kpi: "budget", amount: -1800, label: "Rollback Canary" },
      { kpi: "techDebt", amount: -2, label: "Rollback Canary" },
    ]);
  });

  it("skips the cash chip when the client already drew it, but keeps the tech debt one", () => {
    claimLocalSpend("RUNBOOK_EXECUTED");
    const out = auditKpiInputs(
      audit("RUNBOOK_EXECUTED", { action: "Hotfix Prod Live", amount: -500, tech_debt_delta: 8 }),
      dict,
      consumeLocalSpend
    );
    expect(out.map((e) => e.kpi)).toEqual(["techDebt"]);
    // the claim is single-use
    expect(consumeLocalSpend("RUNBOOK_EXECUTED")).toBe(false);
  });

  it("spreads a CAB decision over every kpi it moved", () => {
    const out = auditKpiInputs(
      audit("DILEMMA_RESOLVED", { budget_delta: 5000, tech_debt_delta: 4, happiness_delta: -3, reputation_delta: 2 }),
      dict,
      () => false
    );
    expect(out.map((e) => [e.kpi, e.amount])).toEqual([
      ["budget", 5000],
      ["techDebt", 4],
      ["morale", -3],
      ["reputation", 2],
    ]);
  });

  it("charges the fine for an unattended alert and ignores events with no cash movement", () => {
    const fine = auditKpiInputs(audit("UNATTENDED_ALERT_VIOLATION", { fine_amount: 2500, amount: -2500 }), dict, () => false);
    expect(fine).toEqual([{ kpi: "budget", amount: -2500, label: "Fine" }]);
    expect(auditKpiInputs(audit("INCIDENT_RAISED", {}), dict, () => false)).toEqual([]);
  });
});
