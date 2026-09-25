import { AlertTriangle, LucideIcon, RotateCcw, ShieldHalf, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { MitigationActionId, MitigationCategoryKey } from "../../i18n/translations";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { playCashSound, playClickSound } from "../../utils/sound";
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
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const triggerRunAnimation = useGameStore((s) => s.triggerRunAnimation);

  const [firedAtTick, setFiredAtTick] = useState<Record<string, number>>({});

  const handleRunbook = async (rb: RunbookDef) => {
    if (!selectedServiceId) return;
    playClickSound();
    const copy = t.mitigations.actions[rb.actionId];
    try {
      await api.executeMitigation(rb.actionId, selectedServiceId);
      setFiredAtTick((prev) => ({ ...prev, [rb.actionId]: currentTick }));
      triggerRunAnimation(selectedServiceId, "mitigate");
      pushFloatingText(`-$${rb.cost.toLocaleString()} :: ${copy.name}`, "info");
      playCashSound();
    } catch {
      pushFloatingText(t.mitigations.rejected, "danger");
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
          const lastFired = firedAtTick[rb.actionId];
          const elapsed = lastFired !== undefined ? currentTick - lastFired : rb.cooldownTicks;
          const cooldownProgress = Math.max(0, Math.min(1, 1 - elapsed / rb.cooldownTicks));
          const onCooldown = cooldownProgress > 0;

          return (
            <CooldownButton
              key={rb.actionId}
              progress={cooldownProgress}
              onClick={() => handleRunbook(rb)}
              disabled={disabled || onCooldown}
              className={`rounded-lg border p-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                rb.danger ? "border-rose-200 bg-rose-50 hover:bg-rose-100" : "border-slate-200 bg-white hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  {t.mitigations.categories[rb.category]}
                </span>
                <Icon className={`w-3.5 h-3.5 ${rb.danger ? "text-rose-500" : "text-slate-400"}`} />
              </div>
              <div className={`text-xs font-bold ${rb.danger ? "text-rose-700" : "text-slate-700"}`}>{copy.name}</div>
              <p className="text-[10px] text-slate-500 leading-tight">{copy.description}</p>
              <div className="flex items-center justify-between mt-1 text-[10px] font-bold">
                <span className="text-rose-500">-${rb.cost.toLocaleString()}</span>
                <span className={rb.techDebtDelta < 0 ? "text-emerald-500" : "text-amber-500"}>
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
