import { Building2, Eye } from "lucide-react";
import ErrorBudgetMeter from "../common/ErrorBudgetMeter";
import CreditCounter from "../common/CreditCounter";
import ShieldGauge from "../common/ShieldGauge";
import TechDebtMeter from "../common/TechDebtMeter";
import IncidentsPanel from "../dock/IncidentsPanel";
import { useTranslation } from "../../i18n/useTranslation";
import { useSimulationSocket } from "../../hooks/useSimulationSocket";
import { useGameStore } from "../../store/useGameStore";
import { auditEventName } from "../../utils/auditText";

// STANDALONE FULL-SCREEN SPECTATOR DASHBOARD FOR A SECOND MONITOR, READ-ONLY, NO MUTATING ACTIONS.
// It mounts only display components (gauges, meters, the read-only incident list and the audit
// feed) and never useGameShortcuts or any modal host, so no key or click here can send a command.
export default function LiveOpsView() {
  useSimulationSocket();
  const t = useTranslation();
  const sla = useGameStore((s) => s.telemetry.sla_percentage);
  const errorRatio = useGameStore((s) => s.telemetry.error_budget_remaining_ratio);
  const frozen = useGameStore((s) => s.telemetry.feature_freeze_active);
  const budget = useGameStore((s) => s.telemetry.budget);
  const techDebt = useGameStore((s) => s.telemetry.tech_debt);
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
            <p className="text-xs text-slate-400">{t.liveOps.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            data-testid="observer-badge"
            title={t.uiGaps.observer.hint}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 text-xs font-bold uppercase tracking-wide text-sky-300"
          >
            <Eye className="w-3.5 h-3.5" aria-hidden />
            {t.uiGaps.observer.badge}
          </span>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 text-sm font-medium">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400 animate-pulse"}`} />
            {connected ? t.topbar.live : t.topbar.reconnecting}
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-4 gap-6 p-8 overflow-hidden">
        <div className="col-span-1 flex flex-col gap-6">
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <ShieldGauge slaPercentage={sla} />
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <ErrorBudgetMeter remainingRatio={errorRatio} frozen={frozen} />
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <CreditCounter budget={budget} />
          </div>
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
            <TechDebtMeter techDebt={techDebt} />
          </div>
        </div>

        <div className="col-span-2 bg-slate-900 rounded-xl border border-slate-800 p-5 overflow-hidden flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">{t.liveOps.activeAlerts}</h2>
          <div className="flex-1 overflow-hidden">
            <IncidentsPanel readOnly />
          </div>
        </div>

        <div className="col-span-1 bg-slate-900 rounded-xl border border-slate-800 p-5 overflow-hidden flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">{t.liveOps.complianceWaterfall}</h2>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
            {auditLog
              .slice()
              .reverse()
              .map((entry) => (
                <div
                  key={entry.id}
                  className={`px-2 py-1.5 rounded-md text-caption font-mono border-l-2 ${
                    entry.compliance_flag ? "border-emerald-500 bg-emerald-500/5 text-emerald-300" : "border-rose-500 bg-rose-500/5 text-rose-300"
                  }`}
                >
                  <span className="text-slate-400 mr-1.5">{t.hud.ledger.tick(entry.tick)}</span>
                  {auditEventName(entry.event_type, t)}
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
