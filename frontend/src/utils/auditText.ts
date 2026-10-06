import type { Translations } from "../i18n/translations";
import type { AuditLogEntry } from "../types/game";

// FALLBACK FOR AN EVENT TYPE THE COPY DOES NOT KNOW YET: "SOME_NEW_EVENT" -> "Some new event"
export function humanizeEnum(raw: string): string {
  const text = raw.toLowerCase().replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function auditEventName(eventType: string, dict: Translations): string {
  return dict.hud.ledger.events[eventType] ?? humanizeEnum(eventType);
}

const num = (value: unknown): number | null => {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) ? n : null;
};

// SHORT, HUMAN-READABLE SUMMARY OF AN AUDIT ENTRY'S DETAILS ("-$1,800 · TDI -2 · srv-auth") instead of
// dumping the raw JSON; the raw record stays available as the row's tooltip
export function auditDetailSummary(audit: AuditLogEntry, dict: Translations): string {
  const d = audit.details ?? {};
  const parts: string[] = [];

  const amount = num(d.amount);
  if (amount) parts.push(`${amount < 0 ? "−" : "+"}$${Math.round(Math.abs(amount)).toLocaleString()}`);

  const tdi = num(d.tech_debt_delta);
  if (tdi) parts.push(`TDI ${tdi > 0 ? "+" : "−"}${Math.abs(Math.round(tdi))}`);

  const happiness = num(d.happiness_delta);
  if (happiness) parts.push(`${dict.topbar.morale} ${happiness > 0 ? "+" : "−"}${Math.abs(Math.round(happiness))}`);

  const reputation = num(d.reputation_delta);
  if (reputation) parts.push(`${dict.governance.reputationLabel} ${reputation > 0 ? "+" : "−"}${Math.abs(Math.round(reputation))}`);

  const upgradeId = typeof d.upgrade_id === "string" ? (d.upgrade_id as keyof Translations["upgrades"]["actions"]) : null;
  const upgradeName = upgradeId ? dict.upgrades.actions[upgradeId]?.name : undefined;
  if (upgradeName) parts.push(upgradeName);
  else if (typeof d.action === "string") parts.push(d.action);

  const service = d.service_id ?? d.target_service_id;
  if (typeof service === "string") parts.push(service);
  if (typeof d.core_competency === "string") parts.push(d.core_competency);

  return parts.join(" · ");
}
