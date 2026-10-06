import { describe, expect, it } from "vitest";
import type { InfrastructureNode } from "../types/game";
import { nodeCost, nodesForService, parseNodeConfig } from "./infraNodes";

const node = (id: string, node_type: InfrastructureNode["node_type"], config: unknown): InfrastructureNode => ({
  id,
  session_id: "s",
  node_type,
  grid_x: 0,
  grid_y: 0,
  status: "active",
  config_json: typeof config === "string" ? config : JSON.stringify(config),
});

describe("infrastructure node helpers", () => {
  it("knows what each module cost", () => {
    expect(nodeCost("redis_cache")).toBe(12_000);
    expect(nodeCost("kafka_queue")).toBe(20_000);
    expect(nodeCost("mystery")).toBe(0);
  });

  it("parses config_json and survives garbage", () => {
    expect(parseNodeConfig(node("a", "redis_cache", { target_service_id: "srv-auth", producer_service_id: null }))).toEqual({
      targetServiceId: "srv-auth",
      producerServiceId: null,
    });
    expect(parseNodeConfig(node("b", "redis_cache", "not json"))).toEqual({ targetServiceId: null, producerServiceId: null });
  });

  it("lists the nodes attached to a service, marking the producing end of a queue", () => {
    const nodes = [
      node("a", "redis_cache", { target_service_id: "srv-auth", producer_service_id: null }),
      node("b", "kafka_queue", { target_service_id: "srv-payment", producer_service_id: "srv-auth" }),
      node("c", "nginx_lb", { target_service_id: "srv-search", producer_service_id: null }),
    ];
    expect(nodesForService(nodes, "srv-auth").map((v) => [v.node.id, v.role])).toEqual([
      ["a", "target"],
      ["b", "producer"],
    ]);
    expect(nodesForService(nodes, "srv-notify")).toEqual([]);
  });
});
