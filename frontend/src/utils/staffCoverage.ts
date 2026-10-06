import type { Engineer } from "../types/game";
import { SERVICE_IDS } from "./scenarioConfig";

// the competencies a hire can pick, in button order (mirrors app.engine.staff.CORE_COMPETENCIES)
export const HIRE_COMPETENCIES = ["auth", "payments", "gateway", "db"] as const;
export type HireCompetency = (typeof HIRE_COMPETENCIES)[number];

// nearest competency per service (mirrors app.engine.staff.SERVICE_COMPETENCY_MAP); "db" matches none
const SERVICE_COMPETENCY: Record<string, HireCompetency> = {
  "srv-auth": "auth",
  "srv-payment": "payments",
  "srv-api-gw": "gateway",
  "srv-search": "gateway",
  "srv-notify": "gateway",
};

// mirrors formulas.SPECIALIST_MISMATCH_BASE_QUALITY: the quality ceiling of an off-specialty assignment
export const MISMATCH_QUALITY = 0.45;

export function competencyForService(serviceId: string): HireCompetency | null {
  return SERVICE_COMPETENCY[serviceId] ?? null;
}

export function isSpecialistMatch(competency: string, serviceId: string): boolean {
  return SERVICE_COMPETENCY[serviceId] === competency;
}

// SERVICES NO ENGINEER IS ASSIGNED TO, IN CANONICAL ORDER
export function uncoveredServiceIds(engineers: readonly Pick<Engineer, "assigned_service_id">[]): string[] {
  const covered = new Set(engineers.map((e) => e.assigned_service_id));
  return SERVICE_IDS.filter((id) => !covered.has(id));
}

export interface HireTarget {
  serviceId: string;
  competency: HireCompetency;
}

// THE PRE-SELECTED HIRE: THE FIRST SERVICE WITH NO ENGINEER WHOSE COMPETENCY MATCHES IT. When every
// service already has someone, it falls back to the first service so the form is never empty.
export function defaultHireTarget(engineers: readonly Pick<Engineer, "assigned_service_id">[]): HireTarget {
  const serviceId = uncoveredServiceIds(engineers).find((id) => competencyForService(id) !== null) ?? SERVICE_IDS[0];
  return { serviceId, competency: competencyForService(serviceId) ?? "auth" };
}

// PICKING A SERVICE RE-ALIGNS THE SPECIALTY TO ITS MATCH (the player can still change it afterwards)
export function targetForService(serviceId: string, current: HireCompetency): HireTarget {
  return { serviceId, competency: competencyForService(serviceId) ?? current };
}

// WHAT EACH ROSTER ROW SHOWS: the service this engineer is assigned to, or null for a reserve desk
export function coveredServiceId(engineer: Pick<Engineer, "assigned_service_id">): string | null {
  return engineer.assigned_service_id && (SERVICE_IDS as readonly string[]).includes(engineer.assigned_service_id)
    ? engineer.assigned_service_id
    : null;
}
