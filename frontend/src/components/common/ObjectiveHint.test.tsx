import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useGameStore } from "../../store/useGameStore";
import { TelemetryState } from "../../types/game";
import { useNextObjectiveKey } from "./ObjectiveHint";

// builds a full TelemetryState from a "healthy new game" baseline, overridden per test
function telemetryFixture(overrides: Partial<TelemetryState>): TelemetryState {
  return {
    ...useGameStore.getState().telemetry,
    active_incidents: [],
    engineers: [],
    purchased_upgrades: [],
    infrastructure_nodes: [],
    achievements_unlocked: [],
    budget: 250000,
    tick: 0,
    ...overrides,
  };
}

function setTelemetry(overrides: Partial<TelemetryState>) {
  useGameStore.setState({ telemetry: telemetryFixture(overrides) });
}

describe("useNextObjectiveKey", () => {
  it("prioritizes acknowledging an active incident above everything else", () => {
    setTelemetry({
      active_incidents: [{ status: "active" } as TelemetryState["active_incidents"][number]],
      engineers: [], // would otherwise suggest hireEngineer
    });
    const { result } = renderHook(() => useNextObjectiveKey());
    expect(result.current).toBe("acknowledgeIncident");
  });

  it("suggests hiring an engineer once there is no active incident and no roster yet", () => {
    setTelemetry({ active_incidents: [], engineers: [] });
    const { result } = renderHook(() => useNextObjectiveKey());
    expect(result.current).toBe("hireEngineer");
  });

  it("suggests buying an upgrade once staffed and affordable, before build mode or achievements", () => {
    setTelemetry({
      engineers: [{} as TelemetryState["engineers"][number]],
      purchased_upgrades: [],
      budget: 20000,
    });
    const { result } = renderHook(() => useNextObjectiveKey());
    expect(result.current).toBe("buyUpgrade");
  });

  it("does not suggest an upgrade the player cannot yet afford", () => {
    setTelemetry({
      engineers: [{} as TelemetryState["engineers"][number]],
      purchased_upgrades: [],
      budget: 500,
      infrastructure_nodes: [],
      tick: 0,
    });
    const { result } = renderHook(() => useNextObjectiveKey());
    expect(result.current).toBeNull();
  });

  it("returns null once every early-game milestone has been reached", () => {
    setTelemetry({
      active_incidents: [],
      engineers: [{} as TelemetryState["engineers"][number]],
      purchased_upgrades: ["apm_tracing"],
      infrastructure_nodes: [{} as TelemetryState["infrastructure_nodes"][number]],
      achievements_unlocked: ["first_blood"],
      tick: 100,
    });
    const { result } = renderHook(() => useNextObjectiveKey());
    expect(result.current).toBeNull();
  });
});
