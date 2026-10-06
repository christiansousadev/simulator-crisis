import { describe, expect, it } from "vitest";
import {
  BREAKROOM_ORIGIN,
  DESK_ORDER,
  RESERVE_SLOTS,
  SERVER_DOOR_OFFSET,
  SERVER_ROOM_DOOR,
  SERVER_ROOM_ORIGIN,
  walkBlockers,
} from "./officeLayout";
import {
  NODE,
  OFFICE_GRAPH,
  OFFICE_WAYPOINT_EDGES,
  WALK_SPEED_TILES_PER_S,
  buildGraph,
  facingForMove,
  findPath,
  hopDurationMs,
  nearestHallNode,
  rackStandNodeId,
  reserveSeatNodeId,
  seatNodeId,
} from "./waypointGraph";

function pathLength(ids: string[]) {
  let total = 0;
  for (let i = 1; i < ids.length; i++) {
    const a = OFFICE_GRAPH.nodes.get(ids[i - 1])!;
    const b = OFFICE_GRAPH.nodes.get(ids[i])!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

describe("waypoint graph layout", () => {
  it("puts the server room door node on the real sliding door", () => {
    // ServerRoom draws the door at origin + SERVER_DOOR_OFFSET; the old node sat at (2.3, 8.6), in the boardroom hallway
    expect(SERVER_ROOM_DOOR).toEqual({ x: SERVER_ROOM_ORIGIN.x + SERVER_DOOR_OFFSET.x, y: SERVER_ROOM_ORIGIN.y + SERVER_DOOR_OFFSET.y });
    expect(SERVER_ROOM_DOOR).toEqual({ x: 3.9, y: 4.05 });
    const door = OFFICE_GRAPH.nodes.get(NODE.serverRoomDoor)!;
    expect(door.x).toBeCloseTo(3.9);
    expect(door.y).toBeCloseTo(4.05);
  });

  it("has a seat for every service desk and every reserve desk, and a rack stand for every rack", () => {
    for (const id of DESK_ORDER) {
      expect(OFFICE_GRAPH.nodes.get(seatNodeId(id))?.seat).toBe(true);
      expect(OFFICE_GRAPH.nodes.has(rackStandNodeId(id))).toBe(true);
    }
    RESERVE_SLOTS.forEach((_, i) => expect(OFFICE_GRAPH.nodes.get(reserveSeatNodeId(i))?.seat).toBe(true));
  });

  it("connects the reception entrance to every destination", () => {
    const destinations = [
      ...DESK_ORDER.map(seatNodeId),
      ...DESK_ORDER.map(rackStandNodeId),
      ...RESERVE_SLOTS.map((_, i) => reserveSeatNodeId(i)),
      NODE.loungeCoffee,
      NODE.loungeSofaA,
      NODE.loungeSofaB,
      NODE.loungeTable,
      NODE.serverRoomDoor,
    ];
    for (const id of destinations) {
      const path = findPath(OFFICE_GRAPH, NODE.entrance, id);
      expect(path.length, `no path to ${id}`).toBeGreaterThan(1);
      expect(path[0].id).toBe(NODE.entrance);
      expect(path[path.length - 1].id).toBe(id);
    }
  });

  it("walks to the vault through the real door, not around it", () => {
    const path = findPath(OFFICE_GRAPH, seatNodeId("srv-auth"), rackStandNodeId("srv-payment"));
    const ids = path.map((n) => n.id);
    expect(ids).toContain(NODE.serverRoomDoor);
    expect(ids.indexOf(NODE.serverRoomDoor)).toBeLessThan(ids.indexOf(rackStandNodeId("srv-payment")));
  });

  it("enters the lounge through its door", () => {
    const ids = findPath(OFFICE_GRAPH, seatNodeId("srv-search"), NODE.loungeCoffee).map((n) => n.id);
    expect(ids).toContain(NODE.loungeDoor);
    const door = OFFICE_GRAPH.nodes.get(NODE.loungeDoor)!;
    expect(door.y).toBeCloseTo(BREAKROOM_ORIGIN.y);
  });

  it("never routes a walking sprite through furniture", () => {
    const blockers = walkBlockers();
    const violations: string[] = [];
    for (const [fromId, toId] of OFFICE_WAYPOINT_EDGES) {
      const a = OFFICE_GRAPH.nodes.get(fromId)!;
      const b = OFFICE_GRAPH.nodes.get(toId)!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(2, Math.ceil(length / 0.05));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        for (const r of blockers) {
          if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) violations.push(`${fromId} -> ${toId} crosses ${r.label} at (${x.toFixed(2)}, ${y.toFixed(2)})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps every node inside the floor", () => {
    for (const node of OFFICE_GRAPH.nodes.values()) {
      expect(node.x).toBeGreaterThan(-0.5);
      expect(node.x).toBeLessThan(22.5);
      expect(node.y).toBeGreaterThan(-0.5);
      expect(node.y).toBeLessThan(14.5);
    }
  });
});

describe("findPath", () => {
  const graph = buildGraph(
    [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 2, y: 0 },
      { id: "c", x: 2, y: 2 },
      { id: "d", x: 0, y: 2 },
      { id: "island", x: 9, y: 9 },
    ],
    [
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
      ["a", "d"],
    ]
  );

  it("returns the shortest route", () => {
    expect(findPath(graph, "a", "c").map((n) => n.id)).toHaveLength(3);
    expect(findPath(graph, "a", "d").map((n) => n.id)).toEqual(["a", "d"]);
  });

  it("returns just the start when already there, and nothing when unreachable or unknown", () => {
    expect(findPath(graph, "a", "a").map((n) => n.id)).toEqual(["a"]);
    expect(findPath(graph, "a", "island")).toEqual([]);
    expect(findPath(graph, "a", "nope")).toEqual([]);
  });

  it("finds the shorter of two real routes", () => {
    const direct = findPath(OFFICE_GRAPH, seatNodeId("srv-auth"), seatNodeId("srv-payment")).map((n) => n.id);
    expect(pathLength(direct)).toBeLessThan(6);
  });
});

describe("nearestHallNode", () => {
  it("picks the closest walkable node and never a seat", () => {
    expect(nearestHallNode(3.9, 4.0)).toBe(NODE.serverRoomDoor);
    const near = nearestHallNode(10.4, 1.22);
    expect(OFFICE_GRAPH.nodes.get(near)?.seat).toBeFalsy();
  });
});

describe("movement helpers", () => {
  it("walks at a constant pace with a floor on very short hops", () => {
    expect(hopDurationMs({ x: 0, y: 0 }, { x: WALK_SPEED_TILES_PER_S, y: 0 })).toBe(1000);
    expect(hopDurationMs({ x: 0, y: 0 }, { x: 0.01, y: 0 })).toBeGreaterThanOrEqual(200);
  });

  it("faces by screen direction, keeping the old facing on a vertical-on-screen move", () => {
    expect(facingForMove({ x: 0, y: 0 }, { x: 2, y: 0 })).toBe("right");
    expect(facingForMove({ x: 0, y: 0 }, { x: 0, y: 2 })).toBe("left");
    expect(facingForMove({ x: 0, y: 0 }, { x: 1, y: 1 }, "left")).toBe("left");
  });
});
