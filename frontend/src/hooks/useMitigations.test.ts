import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "../store/useGameStore";
import { Incident, Service, TelemetryState } from "../types/game";
import { useMitigations } from "./useMitigations";

const service = (id: string, over: Partial<Service> = {}): Service =>
  ({ id, name: id, tier: "standard", status: "healthy", latency_ms: 40, error_rate: 0.001, dependencies: [], ...over }) as Service;

const incident = (over: Partial<Incident>): Incident =>
  ({ id: "inc-1", service_id: "srv-auth", status: "active", severity: "P2_HIGH", triage_solved: false, ...over }) as Incident;

function setTelemetry(over: Partial<TelemetryState>) {
  useGameStore.setState({
    telemetry: {
      ...useGameStore.getState().telemetry,
      tick: 20,
      budget: 50000,
      mitigation_cooldowns: {},
      feature_freeze_active: false,
      purchased_upgrades: [],
      active_incidents: [],
      active_scenario: null,
      services: [service("srv-auth"), service("srv-payment")],
      ...over,
    },
  });
}

const byId = (runbooks: ReturnType<typeof useMitigations>["runbooks"], id: string) => runbooks.find((r) => r.actionId === id)!;

describe("useMitigations", () => {
  beforeEach(() => setTelemetry({}));

  it("lets the hotfix through a feature freeze when the target service has an open incident", () => {
    setTelemetry({ feature_freeze_active: true, active_incidents: [incident({})] });
    const { result } = renderHook(() => useMitigations("srv-auth"));
    expect(byId(result.current.runbooks, "emergency_patch").blockedReason).toBeNull();
  });

  it("blocks the hotfix during a freeze on a service that only looks unwell", () => {
    setTelemetry({
      feature_freeze_active: true,
      services: [service("srv-auth", { status: "degraded" }), service("srv-payment")],
    });
    const { result } = renderHook(() => useMitigations("srv-auth"));
    expect(byId(result.current.runbooks, "emergency_patch").blockedReason).toBe("featureFreeze");
    // non-hotfix runbooks are not frozen
    expect(byId(result.current.runbooks, "rollback").blockedReason).toBeNull();
  });

  it("blocks every runbook on a healthy service with no open incident", () => {
    const { result } = renderHook(() => useMitigations("srv-auth"));
    expect(result.current.runbooks.every((r) => r.blockedReason === "noIncident")).toBe(true);
  });

  it("blocks the provider services during a third-party outage", () => {
    setTelemetry({
      active_scenario: { scenario_id: "third_party_outage" } as TelemetryState["active_scenario"],
      active_incidents: [incident({ service_id: "srv-payment" })],
    });
    const { result } = renderHook(() => useMitigations("srv-payment"));
    expect(byId(result.current.runbooks, "rollback").blockedReason).toBe("providerOutage");
  });

  it("shows the effective price: ci/cd halves rollback and a solved triage discounts further", () => {
    setTelemetry({
      purchased_upgrades: ["automated_cicd"],
      active_incidents: [incident({ triage_solved: true, triage_accuracy: 1 })],
    });
    const { result } = renderHook(() => useMitigations("srv-auth"));
    const rollback = byId(result.current.runbooks, "rollback");
    expect(rollback.listCost).toBe(1800);
    expect(rollback.cost).toBe(450);
    expect(rollback.discounted).toBe(true);
    expect(rollback.discountSources).toEqual(["cicd", "triage"]);
  });

  it("reports how much cash is missing when the budget is the blocker", () => {
    setTelemetry({ budget: 1000, active_incidents: [incident({})] });
    const { result } = renderHook(() => useMitigations("srv-auth"));
    const rollback = byId(result.current.runbooks, "rollback");
    expect(rollback.blockedReason).toBe("budget");
    expect(rollback.missingCash).toBe(800);
  });
});
