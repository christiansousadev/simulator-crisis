import { describe, expect, it } from "vitest";
import { TelemetryState } from "../types/game";
import { useGameStore } from "./useGameStore";

describe("useGameStore.setTelemetry", () => {
  it("fills in any field missing from a stale/out-of-date backend frame with a safe default", () => {
    // regression guard for the "Cannot read properties of undefined (reading 'length')" crash:
    // a backend that predates a newer telemetry field must never reach the rest of the app
    // with that field simply absent
    const staleFrame = { type: "TICK_BROADCAST", session_id: "x", tick: 5 } as unknown as TelemetryState;

    useGameStore.getState().setTelemetry(staleFrame);

    const { telemetry } = useGameStore.getState();
    expect(telemetry.infrastructure_nodes).toEqual([]);
    expect(telemetry.achievements_unlocked).toEqual([]);
    expect(telemetry.unlocked_cosmetics).toEqual([]);
    expect(telemetry.engineers).toEqual([]);
    // the frame's own real values still win over the defaults
    expect(telemetry.tick).toBe(5);
  });

  it("tracks a newly spawned incident into a floating text and does not duplicate resolved history", () => {
    useGameStore.setState({
      telemetry: { ...useGameStore.getState().telemetry, active_incidents: [] },
      resolvedHistory: [],
      floatingTexts: [],
    });

    const incident = {
      id: "inc-1",
      service_id: "srv-auth",
      severity: "P2_HIGH",
      status: "active",
    } as unknown as TelemetryState["active_incidents"][number];

    useGameStore.getState().setTelemetry({
      ...useGameStore.getState().telemetry,
      active_incidents: [incident],
    });

    expect(useGameStore.getState().floatingTexts.length).toBe(1);

    // the same incident resolving on the next frame moves it into resolvedHistory exactly once
    useGameStore.getState().setTelemetry({
      ...useGameStore.getState().telemetry,
      active_incidents: [],
    });

    expect(useGameStore.getState().resolvedHistory).toHaveLength(1);
    expect(useGameStore.getState().resolvedHistory[0].id).toBe("inc-1");
  });
});
