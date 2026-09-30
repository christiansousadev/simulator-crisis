// derives a richer, presentation-only incident state machine from the backend's coarser
// IncidentStatus (active|acknowledged|mitigated|resolved) plus client-local signals already
// tracked in the zustand store (triage terminal open, a mitigate run-animation in flight).
// Never sent by or round-tripped to the backend -- purely how the UI narrates progress.

import { Incident } from "../types/game";

export type IncidentPipelineStatus = "new" | "acknowledged" | "investigating" | "mitigating" | "resolved";

export interface PipelineContext {
  /** the log-triage terminal is currently open for this incident */
  isInvestigating: boolean;
  /** a "mitigate" run-animation is currently playing on this incident's service */
  isMitigating: boolean;
}

export function deriveIncidentPipelineStatus(incident: Incident, ctx: PipelineContext): IncidentPipelineStatus {
  if (incident.status === "resolved" || incident.status === "mitigated") return "resolved";
  if (ctx.isMitigating) return "mitigating";
  if (incident.status === "active") return ctx.isInvestigating ? "investigating" : "new";
  // status === "acknowledged": already reconciled root cause counts as mid-investigation too,
  // since the terminal only needs reopening to view it, not to make further progress
  if (ctx.isInvestigating || incident.triage_solved) return "investigating";
  return "acknowledged";
}
