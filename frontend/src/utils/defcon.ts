import { TelemetryState } from "../types/game";

export type DefconLevel = 1 | 2 | 3 | 4 | 5;

// MILITARY-STYLE THREAT LEVEL DERIVED PURELY FROM CURRENT TELEMETRY, NO SERVER STATE OF ITS OWN.
// 5 = nominal, 1 = imminent collapse (bankruptcy/breach knocking on the door).
export function computeDefconLevel(telemetry: TelemetryState): DefconLevel {
  const p1Count = telemetry.active_incidents.filter((i) => i.severity === "P1_CRITICAL").length;
  const p2Count = telemetry.active_incidents.filter((i) => i.severity === "P2_HIGH").length;

  if (telemetry.status === "bankrupted" || telemetry.budget < 15000 || telemetry.sla_percentage < 97) return 1;
  if (p1Count >= 2 || telemetry.status === "breached" || telemetry.sla_percentage < 99.0) return 2;
  if (p1Count >= 1 || telemetry.sla_percentage < 99.5) return 3;
  if (p2Count >= 1) return 4;
  return 5;
}

// WHETHER THE OFFICE-WIDE RED ALERT LIGHTING RIG SHOULD BE ACTIVE
export function isRedAlertActive(telemetry: TelemetryState): boolean {
  return telemetry.status === "breached" || telemetry.active_incidents.some((i) => i.severity === "P1_CRITICAL");
}
