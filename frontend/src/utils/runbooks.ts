import { Incident } from "../types/game";

// pure runbook rules, mirroring app.engine.simulator.apply_mitigation so the hud shows the price
// the server will really charge and blocks exactly what the server blocks.

// formulas.TRIAGE_COST_DISCOUNT_MAX
export const TRIAGE_COST_DISCOUNT_MAX = 0.5;
// upgrade that halves rollback's base cost and tech debt penalty
export const CICD_UPGRADE_ID = "automated_cicd";

const OPEN_STATUSES: Incident["status"][] = ["active", "acknowledged"];

// THE FIRST OPEN INCIDENT ON A SERVICE, i.e. the one the server prices the runbook against
export function openIncidentFor(serviceId: string | null, incidents: Incident[]): Incident | undefined {
  if (!serviceId) return undefined;
  return incidents.find((i) => i.service_id === serviceId && OPEN_STATUSES.includes(i.status));
}

export interface EffectiveRunbookInput {
  actionId: string;
  listCost: number;
  listTechDebtDelta: number;
  purchasedUpgrades: string[];
  incident?: Pick<Incident, "triage_solved" | "triage_accuracy"> | null;
}

export interface EffectiveRunbookPrice {
  cost: number;
  techDebtDelta: number;
  discounted: boolean;
  // which discounts applied, for tooltips
  sources: ("cicd" | "triage")[];
}

export function effectiveRunbookPrice(input: EffectiveRunbookInput): EffectiveRunbookPrice {
  let cost = input.listCost;
  let techDebtDelta = input.listTechDebtDelta;
  const sources: EffectiveRunbookPrice["sources"] = [];

  if (input.actionId === "rollback" && input.purchasedUpgrades.includes(CICD_UPGRADE_ID)) {
    cost *= 0.5;
    // the server truncates toward zero (python int())
    techDebtDelta = Math.trunc(techDebtDelta * 0.5);
    sources.push("cicd");
  }

  const accuracy = input.incident?.triage_solved ? Number(input.incident.triage_accuracy ?? 0) : 0;
  if (accuracy > 0) {
    cost *= 1 - TRIAGE_COST_DISCOUNT_MAX * Math.min(1, accuracy);
    sources.push("triage");
  }

  return { cost, techDebtDelta, discounted: cost < input.listCost - 0.005, sources };
}

export type RunbookBlockReason = "cooldown" | "providerOutage" | "noIncident" | "featureFreeze" | "budget" | null;

// simulator.HEALTHY_LATENCY_CEILING_MS / HEALTHY_ERROR_RATE_CEILING
const HEALTHY_LATENCY_CEILING_MS = 150;
const HEALTHY_ERROR_RATE_CEILING = 0.01;
// services whose runbooks the third-party-outage scenario rejects until the provider recovers
// (the scenario ends the moment the provider recovers, so "scenario active" means "still down")
const THIRD_PARTY_PROVIDER_SERVICES = ["srv-payment", "srv-notify"];

interface ServiceLike {
  status: string;
  latency_ms: number;
  error_rate: number;
}

// MIRRORS simulator._service_needs_runbook: an open incident, or a service that is visibly unwell
export function serviceNeedsRunbook(service: ServiceLike | undefined, hasOpenIncident: boolean): boolean {
  if (hasOpenIncident) return true;
  if (!service) return false;
  return (
    service.status !== "healthy" ||
    service.latency_ms > HEALTHY_LATENCY_CEILING_MS ||
    service.error_rate > HEALTHY_ERROR_RATE_CEILING
  );
}

export function isProviderOutageBlocked(scenarioId: string | null | undefined, serviceId: string | null): boolean {
  return scenarioId === "third_party_outage" && !!serviceId && THIRD_PARTY_PROVIDER_SERVICES.includes(serviceId);
}

export interface BlockedReasonInput {
  onCooldown: boolean;
  danger: boolean;
  featureFreezeActive: boolean;
  // does the target service have an active/acknowledged incident right now
  targetHasOpenIncident: boolean;
  budget: number;
  effectiveCost: number;
  // third-party outage scenario rejects this service's runbooks (default false)
  providerOutage?: boolean;
  // false when the service has no incident and looks healthy (default true)
  serviceNeedsRunbook?: boolean;
}

// SAME ORDER AS simulator.apply_mitigation: cooldown, scenario lock, "no open incident", the
// feature freeze (which lets a hotfix through when it remediates an open incident), then budget
export function runbookBlockedReason(input: BlockedReasonInput): RunbookBlockReason {
  if (input.onCooldown) return "cooldown";
  if (input.providerOutage) return "providerOutage";
  if (input.serviceNeedsRunbook === false) return "noIncident";
  if (input.featureFreezeActive && input.danger && !input.targetHasOpenIncident) return "featureFreeze";
  if (input.budget < input.effectiveCost) return "budget";
  return null;
}
