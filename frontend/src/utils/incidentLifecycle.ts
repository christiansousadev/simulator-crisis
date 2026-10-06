import { Incident } from "../types/game";

// the five visible stages of an incident card, in order. presentation only: derived from the
// backend status plus the client-side "mitigate" animation, never sent to the server.
export const LIFECYCLE_STEPS = ["new", "acknowledged", "investigated", "mitigating", "resolved"] as const;
export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];

export function lifecycleIndex(incident: Pick<Incident, "status" | "triage_solved">, isMitigating: boolean): number {
  if (incident.status === "resolved" || incident.status === "mitigated") return 4;
  if (isMitigating) return 3;
  if (incident.triage_solved) return 2;
  if (incident.status === "acknowledged") return 1;
  return 0;
}

export type NextAction = "acknowledge" | "investigate" | "chooseRunbook" | "none";

// THE ONE THING THE PLAYER SHOULD DO NEXT: Acknowledge -> Investigate logs -> Choose runbook
export function nextIncidentAction(incident: Pick<Incident, "status" | "triage_solved">): NextAction {
  if (incident.status === "active") return "acknowledge";
  if (incident.status === "acknowledged") return incident.triage_solved ? "chooseRunbook" : "investigate";
  return "none";
}
