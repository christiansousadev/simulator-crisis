import { Target } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { useMitigations } from "../../hooks/useMitigations";
import CooldownButton from "../common/CooldownButton";

// MANAGEMENT ACTION DECK: RUNBOOK DIRECTIVES TARGETING THE SELECTED SERVICE
export default function MitigationsPanel() {
  const t = useTranslation();
  const selectedServiceId = useGameStore((s) => s.selectedServiceId);
  const selectService = useGameStore((s) => s.selectService);
  const activeIncidents = useGameStore((s) => s.telemetry.active_incidents);
  const services = useGameStore((s) => s.telemetry.services);
  const { runbooks, execute } = useMitigations(selectedServiceId);

  // unique service ids with an open incident, offered as one-click targets in the empty state
  const affectedServiceIds = Array.from(new Set(activeIncidents.map((i) => i.service_id)));

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-slate-400">
        {t.mitigations.targetLabel(
          selectedServiceId ? (services.find((s) => s.id === selectedServiceId)?.name ?? selectedServiceId) : t.common.none
        )}
      </div>

      {!selectedServiceId ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4 py-2">
          <Target className="w-5 h-5 text-slate-500" />
          <p className="text-[11px] text-slate-400 max-w-xs">{t.mitigations.selectServiceHint}</p>
          {affectedServiceIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                {t.mitigations.affectedServicesLabel}
              </span>
              {affectedServiceIds.map((id) => (
                <button
                  key={id}
                  onClick={() => selectService(id)}
                  className="px-2 py-1 rounded-md border border-sky-500/40 bg-sky-950/40 text-sky-300 text-[10px] font-bold hover:bg-sky-900/50 transition-colors"
                >
                  {services.find((s) => s.id === id)?.name ?? id}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 pt-1 grid grid-cols-4 gap-1.5">
          {runbooks.map((rb) => {
            const Icon = rb.icon;
            const copy = t.mitigations.actions[rb.actionId];

            return (
              <CooldownButton
                key={rb.actionId}
                progress={rb.cooldownProgress}
                onClick={() => execute(rb)}
                disabled={!!rb.blockedReason}
                title={rb.blockedReason ? t.mitigations.blocked[rb.blockedReason] : undefined}
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
                <p className="text-[10px] text-slate-400 leading-tight">{t.mitigations.impact[rb.actionId]}</p>
                <div className="flex items-center justify-between mt-1 text-[10px] font-bold tabular-nums">
                  <span className="text-rose-400">-${rb.cost.toLocaleString()}</span>
                  <span className={rb.techDebtDelta < 0 ? "text-emerald-400" : "text-amber-400"}>
                    {rb.techDebtDelta > 0 ? "+" : ""}
                    {rb.techDebtDelta} {t.mitigations.tdiSuffix}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5 text-[9px] font-bold tabular-nums min-h-[12px]">
                  <span className={rb.danger ? "text-rose-400" : "text-transparent select-none"}>{t.mitigations.highRisk}</span>
                  {rb.onCooldown ? (
                    <span className="text-slate-500">{t.mitigations.readyIn(rb.readyInTicks)}</span>
                  ) : rb.blockedReason === "budget" ? (
                    <span className="text-amber-500 truncate">{t.mitigations.blocked.budget}</span>
                  ) : rb.blockedReason === "featureFreeze" ? (
                    <span className="text-amber-500 truncate">{t.mitigations.blocked.featureFreeze}</span>
                  ) : null}
                </div>
              </CooldownButton>
            );
          })}
        </div>
      )}
    </div>
  );
}
