import { Building2 } from "lucide-react";
import ErrorBudgetMeter from "../common/ErrorBudgetMeter";
import CreditCounter from "../common/CreditCounter";
import ShieldGauge from "../common/ShieldGauge";
import TechDebtMeter from "../common/TechDebtMeter";
import IncidentsPanel from "../dock/IncidentsPanel";
import { useTranslation } from "../../i18n/useTranslation";
import { useSimulationSocket } from "../../hooks/useSimulationSocket";
import { useGameStore } from "../../store/useGameStore";

// STANDALONE FULL-SCREEN SPECTATOR DASHBOARD FOR A SECOND MONITOR, READ-ONLY, NO MUTATING ACTIONS
export default function LiveOpsView() {
  useSimulationSocket();
  const t = useTranslation();
  const telemetry = useGameStore((s) => s.telemetry);
  const connected = useGameStore((s) => s.connected);
  const auditLog = useGameStore((s) => s.telemetry.recent_audits);

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-8 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-extrabold text-xl">IncidentZero Corp. — {t.liveOps.title}</h1>
            <p className="text-xs text-slate-500">{t.liveOps.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 text-sm font-medium">
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400 animate-pulse"}`} />
          {connected ? t.topbar.live : t.topbar.reconnecting}
        </div>
      </header>

      <div className="flex-1 grid grid-cols-4 gap-6 p-8 overflow-hidden">
        <div className="col-span-1 flex flex-col gap-6">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <ShieldGauge slaPercentage={telemetry.sla_percentage} />
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <ErrorBudgetMeter remainingRatio={telemetry.error_budget_remaining_ratio} frozen={telemetry.feature_freeze_active} />
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <CreditCounter budget={telemetry.budget} />
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <TechDebtMeter techDebt={telemetry.tech_debt} />
          </div>
        </div>

        <div className="col-span-2 bg-slate-900 rounded-xl border border-slate-800 p-5 overflow-hidden flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">{t.liveOps.activeAlerts}</h2>
          <div className="flex-1 overflow-hidden">
            <IncidentsPanel />
          </div>
        </div>

        <div className="col-span-1 bg-slate-900 rounded-xl border border-slate-800 p-5 overflow-hidden flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">{t.liveOps.complianceWaterfall}</h2>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
            {auditLog
              .slice()
              .reverse()
              .map((entry) => (
                <div
                  key={entry.id}
                  className={`px-2 py-1.5 rounded-md text-[11px] font-mono border-l-2 ${
                    entry.compliance_flag ? "border-emerald-500 bg-emerald-500/5 text-emerald-300" : "border-rose-500 bg-rose-500/5 text-rose-300"
                  }`}
                >
                  <span className="text-slate-500 mr-1.5">T+{entry.tick}</span>
                  {entry.event_type}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
