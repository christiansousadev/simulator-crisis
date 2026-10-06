import type { HudCopy } from "../i18n/hud";
import type { Translations } from "../i18n/translations";
import type { AuditLogEntry } from "../types/game";
import type { KpiEventInput } from "./kpiEvents";

// the backend names runbooks by display name in the audit details ("Rollback Canary"); map back to
// the id so the chip label follows the current language
function runbookLabel(name: unknown, dict: Translations): string {
  const raw = String(name ?? "");
  const lower = raw.toLowerCase();
  const id = lower.includes("rollback")
    ? "rollback"
    : lower.includes("replica")
    ? "scale_replicas"
    : lower.includes("circuit")
    ? "circuit_breaker"
    : lower.includes("hotfix") || lower.includes("patch")
    ? "emergency_patch"
    : null;
  return id ? dict.mitigations.actions[id].name : raw;
}

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// TRANSLATE ONE NEWLY-SEEN LEDGER ENTRY INTO THE KPI CHIPS IT CAUSED. `consume` tells whether the
// client already drew the cash chip for this audit type when the player clicked.
export function auditKpiInputs(
  audit: AuditLogEntry,
  dict: Translations,
  consume: (auditType: string) => boolean
): KpiEventInput[] {
  const hud: HudCopy = dict.hud;
  const d = audit.details ?? {};
  const out: KpiEventInput[] = [];
  const cash = (amount: number, label: string, claimable = false) => {
    if (!amount) return;
    if (claimable && consume(audit.event_type)) return;
    out.push({ kpi: "budget", amount, label });
  };

  switch (audit.event_type) {
    case "RUNBOOK_EXECUTED": {
      const label = runbookLabel(d.action, dict);
      cash(d.amount !== undefined ? num(d.amount) : -num(d.cost), label, true);
      const tdi = num(d.tech_debt_delta);
      if (tdi) out.push({ kpi: "techDebt", amount: tdi, label });
      break;
    }
    case "UPGRADE_PURCHASED": {
      const id = String(d.upgrade_id ?? "") as keyof Translations["upgrades"]["actions"];
      cash(d.amount !== undefined ? num(d.amount) : -num(d.cost), dict.upgrades.actions[id]?.name ?? "", true);
      break;
    }
    case "ENGINEER_HIRED":
      cash(d.amount !== undefined ? num(d.amount) : -num(d.cost), hud.chip.hire, true);
      break;
    case "INFRASTRUCTURE_NODE_PLACED":
      cash(num(d.amount), hud.chip.infrastructure);
      break;
    case "UNATTENDED_ALERT_VIOLATION":
      cash(d.amount !== undefined ? num(d.amount) : -num(d.fine_amount), hud.chip.fine);
      break;
    case "SLA_BREACH_EMERGENCY_SANCTION":
      cash(num(d.amount), hud.chip.sanction);
      break;
    case "AI_AUDITOR_VERDICT_APPLIED":
      cash(num(d.amount), hud.chip.auditor);
      break;
    case "DILEMMA_RESOLVED":
      cash(num(d.budget_delta), hud.chip.cab);
      if (num(d.tech_debt_delta)) out.push({ kpi: "techDebt", amount: num(d.tech_debt_delta), label: hud.chip.cab });
      if (num(d.happiness_delta)) out.push({ kpi: "morale", amount: num(d.happiness_delta), label: hud.chip.cab });
      if (num(d.reputation_delta)) out.push({ kpi: "reputation", amount: num(d.reputation_delta), label: hud.chip.cab });
      break;
    default:
      // any other audited cash movement still deserves a chip, just with a generic cause
      cash(num(d.amount), hud.chip.ledger);
  }
  return out;
}
