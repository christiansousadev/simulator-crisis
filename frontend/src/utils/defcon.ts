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

// STORE SELECTOR FOR THE LEVEL ALONE: A PRIMITIVE, SO SUBSCRIBERS ONLY RE-RENDER WHEN IT CHANGES
export function selectDefconLevel(state: { telemetry: TelemetryState }): DefconLevel {
  return computeDefconLevel(state.telemetry);
}

// HOW THE OFFICE LIGHTING RIG REACTS TO EACH LEVEL, THE ONE RULE EVERY CONSUMER SHARES:
// 5 = nominal, 4 = faint amber pool over the vault, 3 = slow amber beacons, 2 and 1 = red alert
export type DefconLightingTier = "nominal" | "watch" | "warning" | "alert";

export function defconLightingTier(level: DefconLevel): DefconLightingTier {
  if (level <= 2) return "alert";
  if (level === 3) return "warning";
  if (level === 4) return "watch";
  return "nominal";
}

// WHETHER THE OFFICE-WIDE RED ALERT LIGHTING RIG SHOULD BE ACTIVE
export function isRedAlertLevel(level: DefconLevel): boolean {
  return level <= 2;
}
