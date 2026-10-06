// corridor waypoint graph and a* pathfinding for sprites moving across the isometric office.
// nodes are authored along the aisles, hallways and doorways the scene really has, so a sprite that
// follows an edge never clips through a desk, a rack or a sofa (waypointGraph.test.ts samples every
// edge against the furniture footprints in officeLayout.ts to keep that true).
//
// the graph is the movement layer for the hired-engineer roster (rosterStage.ts): engineers enter at
// the reception door, walk to their desk, to the vault when their service has an incident being
// worked, and to the lounge when resting.

import {
  BREAKROOM_ORIGIN,
  DESK_ORDER,
  DESK_SLOTS,
  GridPoint,
  RACK_ORDER,
  RESERVE_SLOTS,
  SEAT_OFFSET,
  SEAT_Z,
  SERVER_ROOM_DOOR,
  deskOrigin,
  rackOrigin,
} from "./officeLayout";

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  // elevation of a seated sprite above the floor (chair / sofa seat height)
  z?: number;
  // true for nodes a sprite sits down on instead of standing at
  seat?: boolean;
  // which way a sprite faces once it stops here (toward its monitor / the rack / the counter)
  face?: "left" | "right";
}

interface GraphEdge {
  to: string;
  weight: number;
}

export interface WaypointGraph {
  nodes: Map<string, GraphNode>;
  adjacency: Map<string, GraphEdge[]>;
}

// BUILD A BIDIRECTIONAL GRAPH FROM A NODE LIST AND AN EDGE LIST OF NODE ID PAIRS
export function buildGraph(nodes: GraphNode[], edges: Array<[string, string]>): WaypointGraph {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map<string, GraphEdge[]>();
  for (const id of nodeMap.keys()) adjacency.set(id, []);
  for (const [fromId, toId] of edges) {
    const from = nodeMap.get(fromId);
    const to = nodeMap.get(toId);
    if (!from || !to) continue;
    const weight = Math.hypot(to.x - from.x, to.y - from.y);
    adjacency.get(fromId)!.push({ to: toId, weight });
    adjacency.get(toId)!.push({ to: fromId, weight });
  }
  return { nodes: nodeMap, adjacency };
}

// node ids other modules refer to by name
export const NODE = {
  entrance: "entrance",
  receptionFront: "reception-front",
  receptionWest: "reception-west",
  hallEast: "hall-east",
  hallBay: "hall-bay",
  serverRoomDoor: "server-room-door",
  serverRoomFront: "server-room-front",
  loungeDoor: "lounge-door",
  loungeMid: "lounge-mid",
  loungeCoffee: "lounge-coffee",
  loungeTable: "lounge-table",
  loungeSofaA: "lounge-sofa-a",
  loungeSofaB: "lounge-sofa-b",
} as const;

export const seatNodeId = (serviceId: string) => `seat-${serviceId}`;
export const reserveSeatNodeId = (index: number) => `seat-reserve-${index}`;
export const rackStandNodeId = (serviceId: string) => `rack-front-${serviceId}`;

// aisles running across the engineering bay (world y), the vertical spine west of the desks (world x)
const AISLE_ROW_1_Y = 2.4;
const AISLE_ROW_2_Y = 4.9;
const AISLE_RESERVE_Y = 6.95;
const SPINE_X = 9.75;
const HALL_Y = 8.4;
const MID_ROAD_Y = 5.55;
const RACK_AISLE_Y = 3.5;

function buildOfficeLayoutGraph(): { nodes: GraphNode[]; edges: Array<[string, string]> } {
  const nodes: GraphNode[] = [];
  const edges: Array<[string, string]> = [];
  const add = (node: GraphNode) => nodes.push(node);
  const link = (a: string, b: string) => edges.push([a, b]);

  // vertical spine just west of the desks, joining every aisle to the main hall
  add({ id: "a1-spine", x: SPINE_X, y: AISLE_ROW_1_Y });
  add({ id: "a2-spine", x: SPINE_X, y: AISLE_ROW_2_Y });
  add({ id: "mid-spine", x: SPINE_X, y: MID_ROAD_Y });
  add({ id: "a3-spine", x: SPINE_X, y: AISLE_RESERVE_Y });
  add({ id: NODE.hallBay, x: SPINE_X, y: HALL_Y });
  link("a1-spine", "a2-spine");
  link("a2-spine", "mid-spine");
  link("mid-spine", "a3-spine");
  link("a3-spine", NODE.hallBay);

  // assigned desks: row 1 (first three slots) is reached from aisle 1, row 2 from aisle 2
  let prevAisle1 = "a1-spine";
  let prevAisle2 = "a2-spine";
  DESK_ORDER.forEach((serviceId, i) => {
    const o = deskOrigin(DESK_SLOTS[i]);
    const cx = o.x + SEAT_OFFSET.x;
    const seatY = o.y + SEAT_OFFSET.y;
    const rowOne = i < 3;
    const aisleId = `aisle-${serviceId}`;
    const approachId = `approach-${serviceId}`;
    add({ id: aisleId, x: cx, y: rowOne ? AISLE_ROW_1_Y : AISLE_ROW_2_Y });
    add({ id: approachId, x: cx, y: seatY + 0.6 });
    add({ id: seatNodeId(serviceId), x: cx, y: seatY, z: SEAT_Z, seat: true, face: "right" });
    link(rowOne ? prevAisle1 : prevAisle2, aisleId);
    link(aisleId, approachId);
    link(approachId, seatNodeId(serviceId));
    if (rowOne) prevAisle1 = aisleId;
    else prevAisle2 = aisleId;
  });

  // reserve desks along the south of the bay, entered straight from the aisle in front of them
  let prevReserve = "a3-spine";
  RESERVE_SLOTS.forEach((slot, i) => {
    const o = deskOrigin(slot);
    const cx = o.x + SEAT_OFFSET.x;
    const aisleId = `aisle-reserve-${i}`;
    add({ id: aisleId, x: cx, y: AISLE_RESERVE_Y });
    add({ id: reserveSeatNodeId(i), x: cx, y: o.y + SEAT_OFFSET.y, z: SEAT_Z, seat: true, face: "right" });
    link(prevReserve, aisleId);
    link(aisleId, reserveSeatNodeId(i));
    prevReserve = aisleId;
  });

  // main hall to reception: a hall running east, then south along the open lane west of the turnstile
  add({ id: NODE.hallEast, x: 14.6, y: HALL_Y });
  add({ id: NODE.receptionWest, x: 14.6, y: 12.5 });
  add({ id: NODE.receptionFront, x: 17.8, y: 12.5 });
  add({ id: NODE.entrance, x: 18.2, y: 14.0 });
  link(NODE.hallBay, NODE.hallEast);
  link(NODE.hallEast, NODE.receptionWest);
  link(NODE.receptionWest, NODE.receptionFront);
  link(NODE.receptionFront, NODE.entrance);

  // lounge: in from the hall through the gap between the ping-pong table and the water cooler
  const b = BREAKROOM_ORIGIN;
  add({ id: NODE.loungeDoor, x: SPINE_X, y: b.y });
  add({ id: NODE.loungeMid, x: SPINE_X, y: b.y + 1.05 });
  add({ id: NODE.loungeCoffee, x: b.x + 2.45, y: b.y + 1.05, face: "right" });
  add({ id: NODE.loungeTable, x: b.x + 0.8, y: b.y + 1.05, face: "right" });
  add({ id: NODE.loungeSofaA, x: 9.6, y: b.y + 1.78, z: 0.2, seat: true, face: "left" });
  add({ id: NODE.loungeSofaB, x: 10.0, y: b.y + 1.78, z: 0.2, seat: true, face: "left" });
  link(NODE.hallBay, NODE.loungeDoor);
  link(NODE.loungeDoor, NODE.loungeMid);
  link(NODE.loungeMid, NODE.loungeCoffee);
  link(NODE.loungeMid, NODE.loungeTable);
  link(NODE.loungeMid, NODE.loungeSofaA);
  link(NODE.loungeMid, NODE.loungeSofaB);

  // the vault: down the mid-floor road to the real sliding door, then along the aisle in front of the racks
  add({ id: "mid-door", x: SERVER_ROOM_DOOR.x, y: MID_ROAD_Y });
  add({ id: NODE.serverRoomDoor, x: SERVER_ROOM_DOOR.x, y: SERVER_ROOM_DOOR.y });
  add({ id: NODE.serverRoomFront, x: SERVER_ROOM_DOOR.x, y: RACK_AISLE_Y });
  link("mid-spine", "mid-door");
  link("mid-door", NODE.serverRoomDoor);
  link(NODE.serverRoomDoor, NODE.serverRoomFront);
  // stands sorted by x so the aisle chain never doubles back over itself
  const stands = RACK_ORDER.map((serviceId, i) => ({ serviceId, x: rackOrigin(i).x + 0.275 })).sort((a, c) => a.x - c.x);
  const left = stands.filter((s) => s.x < SERVER_ROOM_DOOR.x);
  const right = stands.filter((s) => s.x >= SERVER_ROOM_DOOR.x);
  for (const group of [[...left].reverse(), right]) {
    let prevRack: string = NODE.serverRoomFront;
    for (const stand of group) {
      add({ id: rackStandNodeId(stand.serviceId), x: stand.x, y: RACK_AISLE_Y, face: "right" });
      link(prevRack, rackStandNodeId(stand.serviceId));
      prevRack = rackStandNodeId(stand.serviceId);
    }
  }

  return { nodes, edges };
}

const LAYOUT = buildOfficeLayoutGraph();
export const OFFICE_WAYPOINT_NODES: GraphNode[] = LAYOUT.nodes;
export const OFFICE_WAYPOINT_EDGES: Array<[string, string]> = LAYOUT.edges;

export const OFFICE_GRAPH = buildGraph(OFFICE_WAYPOINT_NODES, OFFICE_WAYPOINT_EDGES);

// FIND THE WAYPOINT NEAREST A GIVEN WORLD POINT, USED TO PLUG ARBITRARY POSITIONS INTO THE GRAPH
export function nearestHallNode(x: number, y: number, candidates: GraphNode[] = OFFICE_WAYPOINT_NODES): string {
  let bestId = candidates[0].id;
  let bestDist = Infinity;
  for (const node of candidates) {
    if (node.seat) continue;
    const dist = Math.hypot(node.x - x, node.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = node.id;
    }
  }
  return bestId;
}

// A* SHORTEST PATH OVER THE WAYPOINT GRAPH, RETURNS THE ORDERED LIST OF NODES TO WALK THROUGH
export function findPath(graph: WaypointGraph, startId: string, goalId: string): GraphNode[] {
  const start = graph.nodes.get(startId);
  const goal = graph.nodes.get(goalId);
  if (!start || !goal) return [];
  if (startId === goalId) return [start];

  const heuristic = (a: GraphNode, b: GraphNode) => Math.hypot(b.x - a.x, b.y - a.y);
  const openSet = new Set([startId]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startId, 0]]);
  const fScore = new Map<string, number>([[startId, heuristic(start, goal)]]);

  while (openSet.size > 0) {
    let current = "";
    let bestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }

    if (current === goalId) {
      const path: GraphNode[] = [graph.nodes.get(current)!];
      let cursor = current;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        path.unshift(graph.nodes.get(cursor)!);
      }
      return path;
    }

    openSet.delete(current);
    for (const edge of graph.adjacency.get(current) ?? []) {
      const tentativeG = (gScore.get(current) ?? Infinity) + edge.weight;
      if (tentativeG < (gScore.get(edge.to) ?? Infinity)) {
        cameFrom.set(edge.to, current);
        gScore.set(edge.to, tentativeG);
        fScore.set(edge.to, tentativeG + heuristic(graph.nodes.get(edge.to)!, goal));
        openSet.add(edge.to);
      }
    }
  }
  // no path found: caller falls back to rendering at the start node rather than teleporting blindly
  return [];
}

// walking speed in grid tiles per second, and the shortest hop worth animating
export const WALK_SPEED_TILES_PER_S = 1.5;
const MIN_HOP_MS = 220;

// HOW LONG A SPRITE TAKES TO WALK ONE EDGE AT A CONSTANT SPEED (A CONSTANT SPEED READS AS WALKING, NOT HOPPING)
export function hopDurationMs(from: GridPoint, to: GridPoint, speed = WALK_SPEED_TILES_PER_S): number {
  return Math.max(MIN_HOP_MS, Math.round((Math.hypot(to.x - from.x, to.y - from.y) / speed) * 1000));
}

// WHICH WAY A SPRITE FACES WHEN IT MOVES FROM ONE WORLD POINT TO ANOTHER. in the isometric
// projection screen-x grows with (x - y); a move with no screen-x change keeps the previous facing
export function facingForMove(from: GridPoint, to: GridPoint, fallback: "left" | "right" = "right"): "left" | "right" {
  const screenDx = to.x - to.y - (from.x - from.y);
  if (Math.abs(screenDx) < 1e-6) return fallback;
  return screenDx < 0 ? "left" : "right";
}
