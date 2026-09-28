// corridor waypoint graph and a* pathfinding for sprites moving across the isometric office
// nodes are authored along the office's existing walkway guides and doorway gaps so every
// edge follows a path the architecture already declares as walkable
//
// NOTE: as of the frontend hardening pass that added this note, this module (and its consumer,
// PathfindingEmployee.tsx) is not imported anywhere else in frontend/src -- hired engineers
// (EngineerRosterPanel.tsx / telemetry.engineers) have no visible representation in the office
// scene; EngineeringFloor.tsx renders a fixed desk per service_id plus decorative filler sprites
// regardless of roster state. This is a deliberately unwired, complete building block, not
// abandoned/forgotten code -- wiring a hired engineer's walk-to-desk animation, or removing this
// module if the feature is intentionally descoped, is a scoped product decision left open on
// purpose (see audits/docs/implementations/09_VISUAL_POLISH_AND_HUD_CONSISTENCY_SPEC.md).

export interface GraphNode {
  id: string;
  x: number;
  y: number;
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

export const OFFICE_WAYPOINT_NODES: GraphNode[] = [
  { id: "engineering-hall-1", x: 10.5, y: 8.4 },
  { id: "engineering-hall-2", x: 13.0, y: 8.4 },
  { id: "central-junction", x: 8.6, y: 8.4 },
  { id: "server-room-door", x: 2.3, y: 8.6 },
  { id: "server-room-interior", x: 3.0, y: 2.0 },
  { id: "breakroom-junction", x: 8.6, y: 9.5 },
  { id: "breakroom-coffee-machine", x: 9.5, y: 10.2 },
  { id: "boardroom-door", x: 8.6, y: 10.95 },
  { id: "reception-junction", x: 13.5, y: 8.4 },
];

const OFFICE_WAYPOINT_EDGES: Array<[string, string]> = [
  ["engineering-hall-1", "engineering-hall-2"],
  ["engineering-hall-1", "central-junction"],
  ["central-junction", "server-room-door"],
  ["server-room-door", "server-room-interior"],
  ["central-junction", "breakroom-junction"],
  ["breakroom-junction", "breakroom-coffee-machine"],
  ["breakroom-junction", "boardroom-door"],
  ["central-junction", "reception-junction"],
];

export const OFFICE_GRAPH = buildGraph(OFFICE_WAYPOINT_NODES, OFFICE_WAYPOINT_EDGES);

// FIND THE FIXED HALL JUNCTION NODE NEAREST A GIVEN WORLD POINT, USED TO PLUG DESKS INTO THE GRAPH
export function nearestHallNode(x: number, y: number): string {
  let bestId = OFFICE_WAYPOINT_NODES[0].id;
  let bestDist = Infinity;
  for (const node of OFFICE_WAYPOINT_NODES) {
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
