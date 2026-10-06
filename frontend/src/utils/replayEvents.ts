// HUMAN-READABLE PRESENTATION OF LEDGER EVENTS FOR THE INCIDENT REPLAY TIMELINE

export type ReplayTone = "critical" | "warning" | "success" | "info";
export type ReplayIconKey =
  | "alert"
  | "bell"
  | "search"
  | "target"
  | "wrench"
  | "shield"
  | "gavel"
  | "bot"
  | "zap"
  | "check"
  | "users"
  | "dot";

interface Meta {
  tone: ReplayTone;
  icon: ReplayIconKey;
}

const META: Record<string, Meta> = {
  INCIDENT_RAISED: { tone: "critical", icon: "alert" },
  INCIDENT_ACKNOWLEDGED: { tone: "info", icon: "bell" },
  INVESTIGATION_STARTED: { tone: "info", icon: "search" },
  ROOT_CAUSE_IDENTIFIED: { tone: "success", icon: "target" },
  RUNBOOK_EXECUTED: { tone: "success", icon: "wrench" },
  UNATTENDED_ALERT_VIOLATION: { tone: "critical", icon: "shield" },
  SLA_BREACH_EMERGENCY_SANCTION: { tone: "critical", icon: "shield" },
  AI_AUDITOR_INTERVIEW_TURN: { tone: "info", icon: "bot" },
  AI_AUDITOR_VERDICT_APPLIED: { tone: "warning", icon: "bot" },
  DILEMMA_OFFERED: { tone: "warning", icon: "gavel" },
  DILEMMA_RESOLVED: { tone: "info", icon: "gavel" },
  ELEVATED_RISK_WINDOW_OPENED: { tone: "warning", icon: "alert" },
  CHAOS_STRIKE: { tone: "critical", icon: "zap" },
  DDOS_ATTACK_DETECTED: { tone: "critical", icon: "zap" },
  DEPLOYMENT_REGRESSION_DETECTED: { tone: "critical", icon: "alert" },
  SECOND_REGRESSION_WAVE: { tone: "critical", icon: "alert" },
  THIRD_PARTY_PROVIDER_OUTAGE: { tone: "critical", icon: "zap" },
  THIRD_PARTY_PROVIDER_RECOVERED: { tone: "success", icon: "check" },
  PATIENT_ZERO_IDENTIFIED: { tone: "info", icon: "target" },
  FEATURE_FREEZE_ENGAGED: { tone: "warning", icon: "shield" },
  FEATURE_FREEZE_LIFTED: { tone: "success", icon: "shield" },
  SHIFT_ROTATED: { tone: "info", icon: "users" },
  SYSTEM_RESTORED: { tone: "success", icon: "check" },
};

// unknown event types still get a sensible node: non-compliant rows read as warnings
export function replayEventMeta(eventType: string, complianceFlag: boolean): Meta {
  return META[eventType] ?? { tone: complianceFlag ? "info" : "warning", icon: "dot" };
}

// "SOME_EVENT_TYPE" -> "Some event type", the fallback when a translation is missing
export function prettifyEventType(eventType: string): string {
  const spaced = eventType.toLowerCase().replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : eventType;
}

export function eventLabel(eventType: string, names: Record<string, string>): string {
  return names[eventType] ?? prettifyEventType(eventType);
}

// "VP_OF_INFRA" -> "VP of infra"-style readability without a translation table
export function prettifyActor(actor: string): string {
  return actor.replace(/_/g, " ");
}
