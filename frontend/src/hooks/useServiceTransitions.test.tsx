import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSITION_TTL_MS } from "../components/office/serviceTransitions";
import { useGameStore } from "../store/useGameStore";
import type { Service } from "../types/game";
import { useServiceTransitions } from "./useServiceTransitions";

const svc = (id: string, status: Service["status"]): Service => ({
  id,
  session_id: "s",
  name: id,
  tier: "critical",
  status,
  latency_ms: 40,
  error_rate: 0,
  dependencies: [],
});

describe("useServiceTransitions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ runAnimations: [] });
  });
  afterEach(() => vi.useRealTimers());

  const kinds = () => useGameStore.getState().runAnimations.map((a) => `${a.serviceId}:${a.kind}`);

  it("emits fail then recover run-animations as a service goes down and comes back, and retires them after their ttl", () => {
    const { rerender } = renderHook(({ services }) => useServiceTransitions(services), {
      initialProps: { services: [svc("srv-a", "healthy")] },
    });
    // the first frame is only the baseline
    expect(kinds()).toEqual([]);

    rerender({ services: [svc("srv-a", "down")] });
    expect(kinds()).toEqual(["srv-a:fail"]);

    act(() => {
      vi.advanceTimersByTime(TRANSITION_TTL_MS.fail + 1);
    });
    expect(kinds()).toEqual([]);

    rerender({ services: [svc("srv-a", "healthy")] });
    expect(kinds()).toEqual(["srv-a:recover"]);
    act(() => {
      vi.advanceTimersByTime(TRANSITION_TTL_MS.recover + 1);
    });
    expect(kinds()).toEqual([]);
  });

  it("emits a degrade for a healthy service that starts struggling", () => {
    const { rerender } = renderHook(({ services }) => useServiceTransitions(services), {
      initialProps: { services: [svc("srv-a", "healthy"), svc("srv-b", "healthy")] },
    });
    rerender({ services: [svc("srv-a", "healthy"), svc("srv-b", "degraded")] });
    expect(kinds()).toEqual(["srv-b:degrade"]);
  });

  it("does not replay anything when a service list loads already failing", () => {
    renderHook(() => useServiceTransitions([svc("srv-a", "down")]));
    expect(kinds()).toEqual([]);
  });
});
