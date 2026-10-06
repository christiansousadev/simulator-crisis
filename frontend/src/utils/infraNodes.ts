import type { InfrastructureNode, InfrastructureNodeType } from "../types/game";

// what each module cost when placed (mirrors app.engine.infrastructure.INFRASTRUCTURE_CATALOG; the
// node record itself carries no price, and the backend never refunds)
export const INFRA_NODE_COST: Record<InfrastructureNodeType, number> = {
  redis_cache: 12_000,
  kafka_queue: 20_000,
  db_read_replica: 16_000,
  nginx_lb: 9_000,
};

export function nodeCost(nodeType: string): number {
  return INFRA_NODE_COST[nodeType as InfrastructureNodeType] ?? 0;
}

export interface NodeConfig {
  targetServiceId: string | null;
  producerServiceId: string | null;
}

// config_json is a server-written JSON string; a malformed one just means "attached to nothing"
export function parseNodeConfig(node: Pick<InfrastructureNode, "config_json">): NodeConfig {
  try {
    const raw = JSON.parse(node.config_json) as { target_service_id?: unknown; producer_service_id?: unknown } | null;
    return {
      targetServiceId: typeof raw?.target_service_id === "string" ? raw.target_service_id : null,
      producerServiceId: typeof raw?.producer_service_id === "string" ? raw.producer_service_id : null,
    };
  } catch {
    return { targetServiceId: null, producerServiceId: null };
  }
}

export interface PlacedNodeView {
  node: InfrastructureNode;
  // "producer" = the selected service is the producing end of a queue, not the service it protects
  role: "target" | "producer";
}

// THE PLACED NODES ATTACHED TO A SERVICE (AS PROTECTED TARGET OR AS A QUEUE'S PRODUCER), OLDEST FIRST
export function nodesForService(nodes: readonly InfrastructureNode[], serviceId: string): PlacedNodeView[] {
  const views: PlacedNodeView[] = [];
  for (const node of nodes) {
    const { targetServiceId, producerServiceId } = parseNodeConfig(node);
    if (targetServiceId === serviceId) views.push({ node, role: "target" });
    else if (producerServiceId === serviceId) views.push({ node, role: "producer" });
  }
  return views;
}
