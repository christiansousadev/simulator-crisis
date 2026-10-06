// pure status-transition logic for the office scene. the backend only ever sends the current status
// of each service; the scene wants to stage the CHANGE (a rack failing, a rack coming back), so this
// diffs one frame against the previous one. useServiceTransitions turns the result into run-animations.

import type { Service, ServiceStatus } from "../../types/game";

export type ServiceTransitionKind = "degrade" | "fail" | "recover";

export interface ServiceTransition {
  serviceId: string;
  kind: ServiceTransitionKind;
  from: ServiceStatus;
  to: ServiceStatus;
}

// how long each staged transition stays in the store before it is dismissed (ms). the fx layers read
// these to decide how long to keep their own overlays mounted
export const TRANSITION_TTL_MS: Record<ServiceTransitionKind, number> = {
  degrade: 1400,
  fail: 1800,
  recover: 2000,
};

export type StatusSnapshot = ReadonlyMap<string, ServiceStatus>;

export function snapshotStatuses(services: readonly Service[]): Map<string, ServiceStatus> {
  return new Map(services.map((s) => [s.id, s.status]));
}

// CLASSIFY ONE STATUS CHANGE. no event when nothing changed, or when the service was not in the
// previous frame (first sighting: a page load that lands mid-incident must not replay a failure)
export function classifyTransition(from: ServiceStatus | undefined, to: ServiceStatus): ServiceTransitionKind | null {
  if (from === undefined || from === to) return null;
  if (to === "down") return "fail";
  if (to === "degraded") return "degrade";
  return "recover";
}

// DIFF A FRAME OF SERVICES AGAINST THE PREVIOUS STATUS SNAPSHOT (null = no baseline yet, emit nothing)
export function diffServiceStatuses(
  previous: StatusSnapshot | null,
  services: readonly Service[]
): { transitions: ServiceTransition[]; next: Map<string, ServiceStatus> } {
  const next = snapshotStatuses(services);
  if (!previous) return { transitions: [], next };
  const transitions: ServiceTransition[] = [];
  for (const svc of services) {
    const from = previous.get(svc.id);
    const kind = classifyTransition(from, svc.status);
    if (kind && from) transitions.push({ serviceId: svc.id, kind, from, to: svc.status });
  }
  return { transitions, next };
}
