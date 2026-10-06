import { describe, expect, it } from "vitest";
import type { Service } from "../../types/game";
import { classifyTransition, diffServiceStatuses, snapshotStatuses } from "./serviceTransitions";

const svc = (id: string, status: Service["status"]): Service => ({
  id,
  session_id: "s",
  name: id,
  tier: "standard",
  status,
  latency_ms: 50,
  error_rate: 0,
  dependencies: [],
});

describe("classifyTransition", () => {
  it("names each kind of change", () => {
    expect(classifyTransition("healthy", "degraded")).toBe("degrade");
    expect(classifyTransition("healthy", "down")).toBe("fail");
    expect(classifyTransition("degraded", "down")).toBe("fail");
    expect(classifyTransition("down", "healthy")).toBe("recover");
    expect(classifyTransition("degraded", "healthy")).toBe("recover");
    // a rack that is still hurt but calmer is not a recovery
    expect(classifyTransition("down", "degraded")).toBe("degrade");
  });

  it("is silent when nothing changed or the service is new", () => {
    expect(classifyTransition("down", "down")).toBeNull();
    expect(classifyTransition(undefined, "down")).toBeNull();
  });
});

describe("diffServiceStatuses", () => {
  it("emits nothing without a baseline, so loading mid-incident never replays a failure", () => {
    const { transitions, next } = diffServiceStatuses(null, [svc("a", "down")]);
    expect(transitions).toEqual([]);
    expect(next.get("a")).toBe("down");
  });

  it("reports every changed service once, with from and to", () => {
    const before = snapshotStatuses([svc("a", "healthy"), svc("b", "down"), svc("c", "healthy")]);
    const frame = [svc("a", "down"), svc("b", "healthy"), svc("c", "healthy")];
    const { transitions, next } = diffServiceStatuses(before, frame);
    expect(transitions).toEqual([
      { serviceId: "a", kind: "fail", from: "healthy", to: "down" },
      { serviceId: "b", kind: "recover", from: "down", to: "healthy" },
    ]);
    expect(next.get("a")).toBe("down");
    // feeding the new snapshot back in produces no repeat events
    expect(diffServiceStatuses(next, frame).transitions).toEqual([]);
  });

  it("ignores a service that was not in the previous frame", () => {
    const { transitions } = diffServiceStatuses(snapshotStatuses([svc("a", "healthy")]), [svc("a", "healthy"), svc("late", "down")]);
    expect(transitions).toEqual([]);
  });
});
