import { AlertTriangle, LucideIcon, RotateCcw, ShieldHalf, Zap } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { MitigationActionId, MitigationCategoryKey } from "../../i18n/translations";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { playCashSound, playClickSound, playKeyboardClatter } from "../../utils/sound";
import CooldownButton from "../common/CooldownButton";

interface RunbookDef {
  actionId: MitigationActionId;
  cost: number;
  techDebtDelta: number;
  cooldownTicks: number;
  category: MitigationCategoryKey;
  icon: LucideIcon;
  danger?: boolean;
}

// mirrors app.engine.formulas.MITIGATION_CATALOG on the backend; display copy lives in i18n
const RUNBOOKS: RunbookDef[] = [
  { actionId: "rollback", cost: 1800, techDebtDelta: -2, cooldownTicks: 3, category: "deployment", icon: RotateCcw },
  { actionId: "scale_replicas", cost: 3200, techDebtDelta: 1, cooldownTicks: 4, category: "compute", icon: Zap },
  { actionId: "circuit_breaker", cost: 800, techDebtDelta: 3, cooldownTicks: 5, category: "resilience", icon: ShieldHalf },
  { actionId: "emergency_patch", cost: 500, techDebtDelta: 8, cooldownTicks: 6, category: "emergency", icon: AlertTriangle, danger: true },
];

// MANAGEMENT ACTION DECK: RUNBOOK DIRECTIVES TARGETING THE SELECTED SERVICE
export default function MitigationsPanel() {
  const t = useTranslation();
  const selectedServiceId = useGameStore((s) => s.selectedServiceId);
  const budget = useGameStore((s) => s.telemetry.budget);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const mitigationCooldowns = useGameStore((s) => s.telemetry.mitigation_cooldowns);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const triggerRunAnimation = useGameStore((s) => s.triggerRunAnimation);

  const handleRunbook = async (rb: RunbookDef) => {
    if (!selectedServiceId) return;
    playClickSound();
    playKeyboardClatter();
    const copy = t.mitigations.actions[rb.actionId];
    try {
      await api.executeMitigation(rb.actionId, selectedServiceId);
      triggerRunAnimation(selectedServiceId, "mitigate");
      pushFloatingText(`-$${rb.cost.toLocaleString()} :: ${copy.name}`, "info");
      playCashSound();
    } catch (err) {
      // surface the backend's actual reason (e.g. a cooldown-remaining message, a feature-freeze
      // or scenario restriction) instead of always claiming insufficient budget -- see api.ts's
      // request(), which already throws Error(body.detail) for exactly this purpose
      pushFloatingText(err instanceof Error && err.message ? err.message : t.mitigations.rejected, "danger");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-slate-400">
        {t.mitigations.targetLabel(selectedServiceId ?? t.common.none)}
      </div>

      <div className="flex-1 overflow-y-auto p-2 pt-1 grid grid-cols-4 gap-1.5">
        {RUNBOOKS.map((rb) => {
          const Icon = rb.icon;
          const copy = t.mitigations.actions[rb.actionId];
          const disabled = !selectedServiceId || budget < rb.cost;
          // sourced from the server's own cooldown state (telemetry.mitigation_cooldowns) rather
          // than component-local state, so it can never desync from what apply_mitigation
          // actually enforces -- e.g. across a session reset, which zeroes both `tick` and the
          // server's cooldown map together, or a page reload, which has no local state to lose
          const lastFired = mitigationCooldowns[rb.actionId];
          const elapsed = lastFired !== undefined ? currentTick - lastFired : rb.cooldownTicks;
          const cooldownProgress = Math.max(0, Math.min(1, 1 - elapsed / rb.cooldownTicks));
          const onCooldown = cooldownProgress > 0;

          return (
            <CooldownButton
              key={rb.actionId}
              progress={cooldownProgress}
              onClick={() => handleRunbook(rb)}
              disabled={disabled || onCooldown}
              className={`rounded-lg border p-2 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                rb.danger
                  ? "border-rose-500/50 bg-rose-950/30 hover:bg-rose-950/50"
                  : "border-slate-800 bg-slate-900/80 hover:bg-slate-800/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  {t.mitigations.categories[rb.category]}
                </span>
                <Icon className={`w-3.5 h-3.5 ${rb.danger ? "text-rose-400" : "text-slate-400"}`} />
              </div>
              <div className={`text-xs font-bold ${rb.danger ? "text-rose-300" : "text-slate-200"}`}>{copy.name}</div>
              <p className="text-[10px] text-slate-400 leading-tight">{copy.description}</p>
              <div className="flex items-center justify-between mt-1 text-[10px] font-bold">
                <span className="text-rose-400">-${rb.cost.toLocaleString()}</span>
                <span className={rb.techDebtDelta < 0 ? "text-emerald-400" : "text-amber-400"}>
                  {rb.techDebtDelta > 0 ? "+" : ""}
                  {rb.techDebtDelta} {t.mitigations.tdiSuffix}
                </span>
              </div>
            </CooldownButton>
          );
        })}
      </div>
    </div>
  );
}
