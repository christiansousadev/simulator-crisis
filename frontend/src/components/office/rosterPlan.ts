// pure planning rules for the hired-engineer roster in the office scene: who sits where, who is
// walking to the vault, who is in the lounge. no React and no timers here -- rosterStage.ts animates
// the plan, RosterDirector feeds it from telemetry.

import type { Engineer, Incident } from "../../types/game";
import { DESK_ORDER, RESERVE_SLOTS } from "./officeLayout";
import {
  NODE,
  OFFICE_GRAPH,
  WaypointGraph,
  rackStandNodeId,
  reserveSeatNodeId,
  seatNodeId,
} from "./waypointGraph";

export type EngineerIntent = "desk" | "incident" | "lounge";

// where an engineer's sprite is, in words -- drives mood, status text and the lounge props
export type WalkerPlace = "desk" | "reserve" | "server" | "lounge";

type EngineerForPlan = Pick<Engineer, "id" | "assigned_service_id" | "on_call_status" | "hired_at_tick">;

// incident statuses that mean "someone is physically working this service right now"
const WORKED_STATUSES: ReadonlySet<Incident["status"]> = new Set(["acknowledged", "mitigated"]);

// SERVICE IDS WITH AN INCIDENT THAT HAS BEEN PICKED UP, SORTED SO THE RESULT IS A STABLE KEY
export function workedServiceIds(incidents: readonly Pick<Incident, "service_id" | "status">[]): string[] {
  const ids = new Set<string>();
  for (const inc of incidents) if (WORKED_STATUSES.has(inc.status)) ids.add(inc.service_id);
  return [...ids].sort();
}

// WHAT AN ENGINEER SHOULD BE DOING: RESTING AND OFF-DUTY STAFF ARE IN THE LOUNGE, STAFF WHOSE SERVICE
// HAS A PICKED-UP INCIDENT ARE AT THE RACK, EVERYONE ELSE IS AT THEIR DESK
export function deriveIntent(engineer: EngineerForPlan, workedServices: ReadonlySet<string>): EngineerIntent {
  if (engineer.on_call_status === "resting" || engineer.on_call_status === "off_duty") return "lounge";
  if (engineer.assigned_service_id && workedServices.has(engineer.assigned_service_id)) return "incident";
  return "desk";
}

// SEAT EACH ENGINEER: THE FIRST ENGINEER ASSIGNED TO A SERVICE TAKES ITS DESK, EVERYONE ELSE (UNASSIGNED,
// A SECOND ENGINEER ON THE SAME SERVICE, A SERVICE WITHOUT A DESK) TAKES A RESERVE DESK IN ORDER.
// null = no seat left, the engineer waits in the lounge. oldest hire first, so seats never swap on refresh
export function assignSeats(engineers: readonly EngineerForPlan[]): Map<string, string | null> {
  const sorted = [...engineers].sort((a, b) => a.hired_at_tick - b.hired_at_tick || a.id.localeCompare(b.id));
  const seats = new Map<string, string | null>();
  const takenDesks = new Set<string>();
  let reserve = 0;
  for (const eng of sorted) {
    const serviceId = eng.assigned_service_id;
    if (serviceId && (DESK_ORDER as readonly string[]).includes(serviceId) && !takenDesks.has(serviceId)) {
      takenDesks.add(serviceId);
      seats.set(eng.id, seatNodeId(serviceId));
    } else if (reserve < RESERVE_SLOTS.length) {
      seats.set(eng.id, reserveSeatNodeId(reserve++));
    } else {
      seats.set(eng.id, null);
    }
  }
  return seats;
}

// lounge spots in the order they fill up; the coffee spot is the only one holding a mug
export const LOUNGE_SPOTS: ReadonlyArray<{ nodeId: string; mug: boolean }> = [
  { nodeId: NODE.loungeCoffee, mug: true },
  { nodeId: NODE.loungeSofaA, mug: false },
  { nodeId: NODE.loungeSofaB, mug: false },
  { nodeId: NODE.loungeTable, mug: false },
  { nodeId: NODE.loungeMid, mug: false },
];

export interface PlannedTarget {
  id: string;
  nodeId: string;
  place: WalkerPlace;
  mug: boolean;
  // the service whose desk this engineer works at, for click-to-select (null for reserve/lounge-only)
  serviceId: string | null;
}

// TURN THE ROSTER INTO ONE DESTINATION PER ENGINEER
export function planTargets(
  engineers: readonly EngineerForPlan[],
  workedServices: ReadonlySet<string>,
  graph: WaypointGraph = OFFICE_GRAPH
): PlannedTarget[] {
  const seats = assignSeats(engineers);
  const sorted = [...engineers].sort((a, b) => a.hired_at_tick - b.hired_at_tick || a.id.localeCompare(b.id));
  let loungeIndex = 0;
  const nextLoungeSpot = () => LOUNGE_SPOTS[Math.min(loungeIndex++, LOUNGE_SPOTS.length - 1)];

  return sorted.map((eng) => {
    const intent = deriveIntent(eng, workedServices);
    const seat = seats.get(eng.id) ?? null;
    const serviceId = eng.assigned_service_id;

    if (intent === "incident" && serviceId) {
      const stand = rackStandNodeId(serviceId);
      return { id: eng.id, nodeId: graph.nodes.has(stand) ? stand : NODE.serverRoomFront, place: "server", mug: false, serviceId };
    }
    if (intent === "desk" && seat) {
      const reserve = seat.startsWith("seat-reserve-");
      return { id: eng.id, nodeId: seat, place: reserve ? "reserve" : "desk", mug: false, serviceId: reserve ? null : serviceId };
    }
    const spot = nextLoungeSpot();
    return { id: eng.id, nodeId: spot.nodeId, place: "lounge", mug: spot.mug, serviceId: null };
  });
}

// the rendering host an engineer sprite is painted by. the scene paints back-to-front by layer, so a
// walking sprite belongs to the layer whose furniture is just behind it: three bands inside the
// engineering floor (split by world y, between the desk rows) and one inside the lounge
export type WalkerBand = "w0" | "w1" | "w2" | "lounge";

export function bandOf(x: number, y: number): WalkerBand {
  if (y >= 9.0 && x >= 8.2 && x <= 12.0) return "lounge";
  if (y < 2.9) return "w0";
  if (y < 5.3) return "w1";
  return "w2";
}

const SHIRTS = ["#2563eb", "#7c3aed", "#0891b2", "#059669", "#d97706", "#db2777", "#4f46e5", "#0d9488"];
const HAIRS = ["#2b1a12", "#6b4226", "#1c1c1c", "#8a5a2b", "#4a2e19", "#c2a15a"];
const SKINS = ["#f2c9a0", "#e0ac82", "#c68642", "#8d5524"];

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Appearance {
  shirtColor: string;
  hairColor: string;
  skinTone: string;
  glasses: boolean;
}

// A STABLE LOOK PER ENGINEER ID: SAME PERSON, SAME HOODIE, SESSION AFTER SESSION
export function appearanceFor(id: string): Appearance {
  const h = hashString(id);
  return {
    shirtColor: SHIRTS[h % SHIRTS.length],
    hairColor: HAIRS[(h >>> 4) % HAIRS.length],
    skinTone: SKINS[(h >>> 8) % SKINS.length],
    glasses: ((h >>> 12) & 3) === 0,
  };
}
