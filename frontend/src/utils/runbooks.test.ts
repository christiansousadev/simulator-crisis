import { describe, expect, it } from "vitest";
import { Incident } from "../types/game";
import { effectiveRunbookPrice, isProviderOutageBlocked, openIncidentFor, runbookBlockedReason, serviceNeedsRunbook } from "./runbooks";

const solved = { triage_solved: true, triage_accuracy: 1 };

describe("effectiveRunbookPrice", () => {
  it("charges the list price when nothing discounts it", () => {
    const p = effectiveRunbookPrice({ actionId: "scale_replicas", listCost: 3200, listTechDebtDelta: 1, purchasedUpgrades: [] });
    expect(p).toMatchObject({ cost: 3200, techDebtDelta: 1, discounted: false, sources: [] });
  });

  it("halves rollback (and truncates its tech debt) with automated ci/cd", () => {
    const p = effectiveRunbookPrice({ actionId: "rollback", listCost: 1800, listTechDebtDelta: -3, purchasedUpgrades: ["automated_cicd"] });
    expect(p.cost).toBe(900);
    expect(p.techDebtDelta).toBe(-1);
    expect(p.sources).toEqual(["cicd"]);
    // other runbooks are not touched by that upgrade
    const other = effectiveRunbookPrice({ actionId: "circuit_breaker", listCost: 800, listTechDebtDelta: 3, purchasedUpgrades: ["automated_cicd"] });
    expect(other.cost).toBe(800);
  });

  it("applies the triage discount scaled by accuracy, stacking with ci/cd", () => {
    const full = effectiveRunbookPrice({ actionId: "circuit_breaker", listCost: 800, listTechDebtDelta: 3, purchasedUpgrades: [], incident: solved });
    expect(full.cost).toBe(400);
    const partial = effectiveRunbookPrice({
      actionId: "rollback",
      listCost: 1800,
      listTechDebtDelta: -2,
      purchasedUpgrades: ["automated_cicd"],
      incident: { triage_solved: true, triage_accuracy: 0.56 },
    });
    expect(partial.cost).toBeCloseTo(900 * (1 - 0.5 * 0.56));
    expect(partial.discounted).toBe(true);
    expect(partial.sources).toEqual(["cicd", "triage"]);
  });

  it("ignores an accuracy that is not backed by a solved triage", () => {
    const p = effectiveRunbookPrice({
      actionId: "rollback",
      listCost: 1800,
      listTechDebtDelta: -2,
      purchasedUpgrades: [],
      incident: { triage_solved: false, triage_accuracy: 0.9 },
    });
    expect(p.cost).toBe(1800);
  });
});

describe("runbookBlockedReason (hotfix gating)", () => {
  const base = { onCooldown: false, danger: true, featureFreezeActive: true, targetHasOpenIncident: false, budget: 50000, effectiveCost: 500 };

  it("blocks a hotfix during a freeze when the target has no open incident", () => {
    expect(runbookBlockedReason(base)).toBe("featureFreeze");
  });

  it("lets a hotfix through a freeze when it remediates an open incident", () => {
    expect(runbookBlockedReason({ ...base, targetHasOpenIncident: true })).toBeNull();
  });

  it("never freezes non-hotfix runbooks and still reports cooldown and budget", () => {
    expect(runbookBlockedReason({ ...base, danger: false })).toBeNull();
    expect(runbookBlockedReason({ ...base, onCooldown: true })).toBe("cooldown");
    expect(runbookBlockedReason({ ...base, targetHasOpenIncident: true, budget: 100 })).toBe("budget");
  });
});

describe("openIncidentFor", () => {
  const inc = (id: string, service_id: string, status: Incident["status"]) => ({ id, service_id, status }) as Incident;
  it("finds the first active or acknowledged incident on the service only", () => {
    const list = [inc("1", "a", "resolved"), inc("2", "a", "acknowledged"), inc("3", "b", "active")];
    expect(openIncidentFor("a", list)?.id).toBe("2");
    expect(openIncidentFor("c", list)).toBeUndefined();
    expect(openIncidentFor(null, list)).toBeUndefined();
  });
});

describe("server-mirrored runbook locks", () => {
  const base = { onCooldown: false, danger: false, featureFreezeActive: false, targetHasOpenIncident: false, budget: 50000, effectiveCost: 500 };

  it("blocks runbooks on a healthy service with no incident", () => {
    expect(runbookBlockedReason({ ...base, serviceNeedsRunbook: false })).toBe("noIncident");
    expect(runbookBlockedReason({ ...base, serviceNeedsRunbook: true })).toBeNull();
  });

  it("treats an unhealthy service as needing a runbook even without an incident", () => {
    expect(serviceNeedsRunbook({ status: "healthy", latency_ms: 40, error_rate: 0.001 }, false)).toBe(false);
    expect(serviceNeedsRunbook({ status: "degraded", latency_ms: 40, error_rate: 0.001 }, false)).toBe(true);
    expect(serviceNeedsRunbook({ status: "healthy", latency_ms: 400, error_rate: 0.001 }, false)).toBe(true);
    expect(serviceNeedsRunbook({ status: "healthy", latency_ms: 40, error_rate: 0.001 }, true)).toBe(true);
  });

  it("locks the provider services during a third-party outage", () => {
    expect(isProviderOutageBlocked("third_party_outage", "srv-payment")).toBe(true);
    expect(isProviderOutageBlocked("third_party_outage", "srv-auth")).toBe(false);
    expect(isProviderOutageBlocked("ddos_global", "srv-payment")).toBe(false);
    expect(runbookBlockedReason({ ...base, providerOutage: true, serviceNeedsRunbook: true })).toBe("providerOutage");
  });
});
