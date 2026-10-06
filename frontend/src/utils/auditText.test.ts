import { describe, expect, it } from "vitest";
import { TRANSLATIONS } from "../i18n/translations";
import { AuditLogEntry } from "../types/game";
import { auditDetailSummary, auditEventName, humanizeEnum } from "./auditText";

const dict = TRANSLATIONS.en;
const entry = (event_type: string, details: Record<string, unknown>): AuditLogEntry => ({
  id: "a",
  session_id: "s",
  timestamp: "2026-01-01T10:20:30",
  tick: 3,
  event_type,
  actor: "VP_OF_INFRA",
  details,
  compliance_flag: true,
});

describe("audit text", () => {
  it("names known events from the copy and humanizes unknown ones", () => {
    expect(auditEventName("RUNBOOK_EXECUTED", dict)).toBe("Runbook executed");
    expect(auditEventName("BRAND_NEW_EVENT", dict)).toBe("Brand new event");
    expect(humanizeEnum("A_B_C")).toBe("A b c");
  });

  it("summarizes details compactly instead of dumping JSON", () => {
    const text = auditDetailSummary(
      entry("RUNBOOK_EXECUTED", { amount: -1800, tech_debt_delta: -2, action: "Rollback Canary", service_id: "srv-auth", incident_id: "x" }),
      dict
    );
    expect(text).toBe(`−$${(1800).toLocaleString()} · TDI −2 · Rollback Canary · srv-auth`);
    expect(text).not.toContain("{");
  });

  it("returns an empty summary when there is nothing worth showing", () => {
    expect(auditDetailSummary(entry("INCIDENT_RAISED", {}), dict)).toBe("");
  });
});
