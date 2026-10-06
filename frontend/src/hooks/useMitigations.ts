import { AlertTriangle, LucideIcon, RotateCcw, ShieldHalf, Zap } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "../i18n/useTranslation";
import { MitigationActionId, MitigationCategoryKey } from "../i18n/translations";
import { api } from "../services/api";
import { useGameStore } from "../store/useGameStore";
import { claimLocalSpend } from "../utils/localSpendClaims";
import { effectiveRunbookPrice, isProviderOutageBlocked, openIncidentFor, runbookBlockedReason, RunbookBlockReason, serviceNeedsRunbook } from "../utils/runbooks";
import { playCashSound, playClickSound, playErrorSound, playKeyboardClatter } from "../utils/sound";

export interface RunbookDef {
  actionId: MitigationActionId;
  cost: number;
  techDebtDelta: number;
  cooldownTicks: number;
  category: MitigationCategoryKey;
  icon: LucideIcon;
  danger?: boolean;
}

// mirrors app.engine.formulas.MITIGATION_CATALOG on the backend; display copy lives in i18n.
// `danger` mirrors the backend's "hotfix" category -- the one a feature freeze locks out.
export const RUNBOOKS: RunbookDef[] = [
  { actionId: "rollback", cost: 1800, techDebtDelta: -2, cooldownTicks: 3, category: "deployment", icon: RotateCcw },
  { actionId: "scale_replicas", cost: 3200, techDebtDelta: 1, cooldownTicks: 4, category: "compute", icon: Zap },
  { actionId: "circuit_breaker", cost: 800, techDebtDelta: 3, cooldownTicks: 5, category: "resilience", icon: ShieldHalf },
  { actionId: "emergency_patch", cost: 500, techDebtDelta: 8, cooldownTicks: 6, category: "emergency", icon: AlertTriangle, danger: true },
];

export type MitigationBlockReason = RunbookBlockReason;

export interface RunbookState extends RunbookDef {
  // `cost` and `techDebtDelta` are the EFFECTIVE values the server will charge; the catalog
  // price is kept in `listCost`/`listTechDebtDelta` so the ui can strike it through
  listCost: number;
  listTechDebtDelta: number;
  discounted: boolean;
  discountSources: ("cicd" | "triage")[];
  cooldownProgress: number; // 0 (ready) .. 1 (just fired)
  onCooldown: boolean;
  readyInTicks: number;
  blockedReason: MitigationBlockReason;
  // cash still missing when the budget is the blocker
  missingCash: number;
}

// shared runbook catalog + live cooldown/afford state + execution, reused by the dock's
// mitigation panel and the incident detail modal's embedded quick-mitigate block so both agree on
// cost, cooldown math and error handling instead of drifting apart. `targetServiceId` may be null
// (no service selected yet); runbooks still compute cooldown/budget state, just always blocked.
export function useMitigations(targetServiceId: string | null) {
  const t = useTranslation();
  const budget = useGameStore((s) => s.telemetry.budget);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const mitigationCooldowns = useGameStore((s) => s.telemetry.mitigation_cooldowns);
  const featureFreezeActive = useGameStore((s) => s.telemetry.feature_freeze_active);
  const purchasedUpgrades = useGameStore((s) => s.telemetry.purchased_upgrades);
  const activeIncidents = useGameStore((s) => s.telemetry.active_incidents);
  const scenarioId = useGameStore((s) => s.telemetry.active_scenario?.scenario_id ?? null);
  const targetService = useGameStore((s) => (targetServiceId ? s.telemetry.services.find((x) => x.id === targetServiceId) : undefined));
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const triggerRunAnimation = useGameStore((s) => s.triggerRunAnimation);
  const pushKpiEvent = useGameStore((s) => s.pushKpiEvent);

  // the incident the server will price and gate this runbook against (first open one on the service)
  const targetIncident = useMemo(() => openIncidentFor(targetServiceId, activeIncidents), [targetServiceId, activeIncidents]);

  const runbooks: RunbookState[] = RUNBOOKS.map((rb) => {
    const lastFired = mitigationCooldowns[rb.actionId];
    const elapsed = lastFired !== undefined ? currentTick - lastFired : rb.cooldownTicks;
    const cooldownProgress = Math.max(0, Math.min(1, 1 - elapsed / rb.cooldownTicks));
    const onCooldown = cooldownProgress > 0;
    const readyInTicks = onCooldown ? Math.max(1, rb.cooldownTicks - elapsed) : 0;

    const price = effectiveRunbookPrice({
      actionId: rb.actionId,
      listCost: rb.cost,
      listTechDebtDelta: rb.techDebtDelta,
      purchasedUpgrades,
      incident: targetIncident,
    });

    const blockedReason = runbookBlockedReason({
      onCooldown,
      danger: !!rb.danger,
      featureFreezeActive,
      targetHasOpenIncident: !!targetIncident,
      providerOutage: isProviderOutageBlocked(scenarioId, targetServiceId),
      serviceNeedsRunbook: serviceNeedsRunbook(targetService, !!targetIncident),
      budget,
      effectiveCost: price.cost,
    });

    return {
      ...rb,
      cost: Math.round(price.cost),
      techDebtDelta: price.techDebtDelta,
      listCost: rb.cost,
      listTechDebtDelta: rb.techDebtDelta,
      discounted: price.discounted,
      discountSources: price.sources,
      cooldownProgress,
      onCooldown,
      readyInTicks,
      blockedReason,
      missingCash: blockedReason === "budget" ? Math.max(1, Math.ceil(price.cost - budget)) : 0,
    };
  });

  const execute = async (rb: RunbookState) => {
    if (!targetServiceId || rb.blockedReason) return;
    playClickSound();
    playKeyboardClatter();
    const copy = t.mitigations.actions[rb.actionId];
    try {
      await api.executeMitigation(rb.actionId, targetServiceId);
      triggerRunAnimation(targetServiceId, "mitigate");
      pushFloatingText(`-$${rb.cost.toLocaleString()} :: ${copy.name}`, "info");
      // chip now; the matching audit entry arrives a tick later and must not draw it twice
      claimLocalSpend("RUNBOOK_EXECUTED");
      pushKpiEvent("budget", -rb.cost, copy.name);
      playCashSound();
    } catch (err) {
      // surface the backend's actual reason (e.g. a cooldown-remaining message, a feature-freeze
      // or scenario restriction) instead of always claiming insufficient budget
      playErrorSound();
      pushFloatingText(err instanceof Error && err.message ? err.message : t.mitigations.rejected, "danger");
    }
  };

  return { runbooks, execute };
}
