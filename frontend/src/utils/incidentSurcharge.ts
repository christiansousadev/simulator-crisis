import { Incident, IncidentSeverity } from "../types/game";

// mirrors formulas.incident_surcharge: the per-tick budget drain of an open incident, which grows
// non-linearly with how long it stays open
const SEVERITY_BASE_SURCHARGE: Record<IncidentSeverity, number> = {
  P1_CRITICAL: 800,
  P2_HIGH: 250,
  P3_MEDIUM: 100,
  P4_LOW: 40,
};
const SURCHARGE_GROWTH_RATE = 0.08;
const SURCHARGE_EXPONENT = 1.3;

export function surchargePerTick(severity: IncidentSeverity, elapsedTicks: number): number {
  const base = SEVERITY_BASE_SURCHARGE[severity] ?? SEVERITY_BASE_SURCHARGE.P4_LOW;
  return base * Math.pow(1 + SURCHARGE_GROWTH_RATE * Math.max(0, elapsedTicks), SURCHARGE_EXPONENT);
}

// the backend tracks the exact accrued figure on the wire; fall back to an estimate only when an
// older frame does not carry it
export function accruedSurcharge(incident: Incident, elapsedTicks: number): number {
  const wire = (incident as Incident & { accrued_surcharge?: unknown }).accrued_surcharge;
  if (typeof wire === "number" && Number.isFinite(wire)) return wire;
  let total = 0;
  for (let k = 0; k < elapsedTicks; k++) total += surchargePerTick(incident.severity, k);
  return total;
}

// wrong triage picks already recorded server-side (survives closing and reopening the terminal)
export function wrongAttemptsOf(incident: Incident | null | undefined): number {
  const raw = (incident as (Incident & { triage_wrong_attempts?: unknown }) | null | undefined)?.triage_wrong_attempts;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
}
