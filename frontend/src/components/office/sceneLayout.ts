import { project } from "./isoMath";
import type { IncidentSeverity, Service } from "../../types/game";

// where the office zones sit, shared by the scene, the camera, the lighting and the minimap

export const SERVER_ROOM_ORIGIN = { x: 0.5, y: 0.5 };
export const ENGINEERING_ORIGIN = { x: 9.9, y: 0.5 };
export const BOARDROOM_ORIGIN = { x: 0.5, y: 9.0 };
export const BREAKROOM_ORIGIN = { x: 8.2, y: 9.0 };
export const RECEPTION_ORIGIN = { x: 17.0, y: 11.2 };

export const SERVER_ROOM_SIZE = { width: 7.4, depth: 3.6 };
export const ENGINEERING_SIZE = { width: 12.0, depth: 7.5 };
export const BOARDROOM_SIZE = { width: 7.0, depth: 4.5 };
export const BREAKROOM_SIZE = { width: 7.5, depth: 4.5 };
export const RECEPTION_MAT_ORIGIN = { x: RECEPTION_ORIGIN.x - 0.3, y: RECEPTION_ORIGIN.y - 0.3 };
export const RECEPTION_MAT_SIZE = { width: 2.6, depth: 2.4 };

// single continuous floor bounds, covering every zone plus generous walkway space
export const FLOOR = { minX: -0.5, minY: -0.5, maxX: 22.5, maxY: 14.5 };
export const WALL_HEIGHT = 2.8;

// the world is drawn on a ~23 x 15 grid in the minimap
export const MAP_GRID = { width: 23, depth: 15 };

// fixed zoom/pan anchor, roughly the visual centre of the whole floor plan
export const CAMERA_ORIGIN = project(11, 7, 0);

// engineering desks sit at these offsets from the bay origin (mirrors EngineeringFloor's slots)
const DESK_ORDER = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"];
const DESK_SLOTS = [
  { x: 0, y: 0 },
  { x: 2.5, y: 0 },
  { x: 5.0, y: 0 },
  { x: 1.2, y: 2.6 },
  { x: 3.7, y: 2.6 },
];

export function deskGridPosition(serviceId: string, serviceIds: string[]): { x: number; y: number } | null {
  const ordered = [...DESK_ORDER.filter((id) => serviceIds.includes(id)), ...serviceIds.filter((id) => !DESK_ORDER.includes(id))];
  const slot = DESK_SLOTS[ordered.indexOf(serviceId)];
  return slot ? { x: ENGINEERING_ORIGIN.x + slot.x + 0.4, y: ENGINEERING_ORIGIN.y + slot.y + 0.4 } : null;
}

const SEVERITY_RANK: Record<IncidentSeverity, number> = { P1_CRITICAL: 4, P2_HIGH: 3, P3_MEDIUM: 2, P4_LOW: 1 };

// WORST FAILING RACK: highest incident severity first, then a DOWN service over a degraded one.
// Returns null when nothing is failing, so the caller can fall back to the vault centre.
export function pickCrisisServiceId(
  services: ReadonlyArray<Pick<Service, "id" | "status">>,
  incidents: ReadonlyArray<{ service_id: string; severity: IncidentSeverity }>
): string | null {
  let best: { id: string; score: number } | null = null;
  for (const service of services) {
    let sev = -1;
    for (const incident of incidents) {
      if (incident.service_id === service.id) sev = Math.max(sev, SEVERITY_RANK[incident.severity] ?? 0);
    }
    const statusScore = service.status === "down" ? 2 : service.status === "degraded" ? 1 : 0;
    if (sev < 0 && statusScore === 0) continue;
    const score = (sev + 1) * 10 + statusScore;
    if (!best || score > best.score) best = { id: service.id, score };
  }
  return best?.id ?? null;
}
