import type { Service } from "../../types/game";

export const GRAPH_WIDTH = 1000;
export const GRAPH_HEIGHT = 520;
export const NODE_WIDTH = 168;
export const NODE_HEIGHT = 84;

export interface GraphNode {
  id: string;
  layer: number;
  x: number;
  y: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

// LAYERED LAYOUT: a service sits one column right of its deepest dependency (upstream on the left,
// the edge arrow pointing from the dependency TOWARD the dependent -- the cascade direction). Unknown
// dependency ids are ignored and cycles are cut instead of recursing forever.
export function layoutServiceGraph(services: ReadonlyArray<Pick<Service, "id" | "dependencies">>): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const byId = new Map(services.map((s) => [s.id, s]));
  const depth = new Map<string, number>();
  const visiting = new Set<string>();

  const resolve = (id: string): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const deps = (byId.get(id)?.dependencies ?? []).filter((d) => byId.has(d) && d !== id);
    const layer = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(resolve));
    visiting.delete(id);
    depth.set(id, layer);
    return layer;
  };
  services.forEach((s) => resolve(s.id));

  const columns = new Map<number, string[]>();
  for (const s of services) {
    const layer = depth.get(s.id) ?? 0;
    columns.set(layer, [...(columns.get(layer) ?? []), s.id]);
  }
  const layerCount = Math.max(1, columns.size);
  const nodes: GraphNode[] = [];
  const colWidth = (GRAPH_WIDTH - NODE_WIDTH) / Math.max(1, layerCount - 1);
  for (const [layer, ids] of columns) {
    const rowHeight = GRAPH_HEIGHT / ids.length;
    ids.forEach((id, row) => {
      nodes.push({
        id,
        layer,
        x: layerCount === 1 ? (GRAPH_WIDTH - NODE_WIDTH) / 2 : layer * colWidth,
        y: row * rowHeight + (rowHeight - NODE_HEIGHT) / 2,
      });
    });
  }

  const edges: GraphEdge[] = [];
  for (const s of services) {
    for (const dep of s.dependencies) {
      if (byId.has(dep) && dep !== s.id) edges.push({ from: dep, to: s.id });
    }
  }
  return { nodes, edges };
}
