import { AlertTriangle, LucideIcon, RotateCcw, ShieldHalf, Zap } from "lucide-react";
import { useTranslation } from "../i18n/useTranslation";
import { MitigationActionId, MitigationCategoryKey } from "../i18n/translations";
import { api } from "../services/api";
import { useGameStore } from "../store/useGameStore";
import { playCashSound, playClickSound, playKeyboardClatter } from "../utils/sound";

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

export type MitigationBlockReason = "cooldown" | "featureFreeze" | "budget" | null;

export interface RunbookState extends RunbookDef {
  cooldownProgress: number; // 0 (ready) .. 1 (just fired)
  onCooldown: boolean;
  readyInTicks: number;
  blockedReason: MitigationBlockReason;
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
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const triggerRunAnimation = useGameStore((s) => s.triggerRunAnimation);

  const runbooks: RunbookState[] = RUNBOOKS.map((rb) => {
    const lastFired = mitigationCooldowns[rb.actionId];
    const elapsed = lastFired !== undefined ? currentTick - lastFired : rb.cooldownTicks;
    const cooldownProgress = Math.max(0, Math.min(1, 1 - elapsed / rb.cooldownTicks));
    const onCooldown = cooldownProgress > 0;
    const readyInTicks = onCooldown ? Math.max(1, rb.cooldownTicks - elapsed) : 0;

    let blockedReason: MitigationBlockReason = null;
    if (onCooldown) blockedReason = "cooldown";
    else if (featureFreezeActive && rb.danger) blockedReason = "featureFreeze";
    else if (budget < rb.cost) blockedReason = "budget";

    return { ...rb, cooldownProgress, onCooldown, readyInTicks, blockedReason };
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
      playCashSound();
    } catch (err) {
      // surface the backend's actual reason (e.g. a cooldown-remaining message, a feature-freeze
      // or scenario restriction) instead of always claiming insufficient budget
      pushFloatingText(err instanceof Error && err.message ? err.message : t.mitigations.rejected, "danger");
    }
  };

  return { runbooks, execute };
}
