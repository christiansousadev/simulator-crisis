// shared incident-impact math, used by both the incident card and the incident detail modal so
// the two never disagree about active duration, breach countdown or blast radius.

import { Incident, Service } from "../types/game";

// ticks until an unacknowledged incident triggers the regulatory breach fine, mirrors
// app.engine.formulas' unattended-alert escalation window on the backend
export const REGULATORY_BREACH_TICK = 12;

export function ticksToRegulatoryBreach(incident: Incident): number {
  return Math.max(0, REGULATORY_BREACH_TICK - incident.mtta_seconds);
}

export function isBreachImminent(incident: Incident): boolean {
  return incident.status === "active" && ticksToRegulatoryBreach(incident) <= 3;
}

export function activeDurationTicks(incident: Incident, currentTick: number): number {
  return Math.max(0, currentTick - incident.created_tick);
}

// "blast radius": other services in the topology that declare this one as a dependency --
// i.e. what actually goes down/degrades if this incident isn't handled in time
export function countDependents(service: Service | undefined, allServices: Service[]): number {
  if (!service) return 0;
  return allServices.filter((s) => s.dependencies.includes(service.id)).length;
}
