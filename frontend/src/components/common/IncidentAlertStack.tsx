import { AlertOctagon, Check, ChevronRight, Clock, ShieldAlert, Terminal } from "lucide-react";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { Incident } from "../../types/game";
import SeverityBadge from "./SeverityBadge";

interface IncidentAlertStackProps {
  onFocusService?: (serviceId: string) => void;
}

export default function IncidentAlertStack({ onFocusService }: IncidentAlertStackProps) {
  const activeIncidents = useGameStore((s) => s.telemetry.active_incidents);
  const openTriageTerminal = useGameStore((s) => s.openTriageTerminal);
  const openIncidentDetail = useGameStore((s) => s.openIncidentDetail);
  const selectService = useGameStore((s) => s.selectService);
  const triggerRunAnimation = useGameStore((s) => s.triggerRunAnimation);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);

  if (activeIncidents.length === 0) return null;

  const handleAcknowledge = async (inc: Incident, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.acknowledgeIncident(inc.id);
      triggerRunAnimation(inc.service_id, "acknowledge");
      pushFloatingText(`ACKNOWLEDGED: ${inc.service_id.toUpperCase()}`, "success");
    } catch {
      // best-effort
    }
  };

  const handleTriage = (inc: Incident, e: React.MouseEvent) => {
    e.stopPropagation();
    selectService(inc.service_id);
    onFocusService?.(inc.service_id);
    openTriageTerminal(inc.id);
  };

  const handleCardClick = (inc: Incident) => {
    selectService(inc.service_id);
    onFocusService?.(inc.service_id);
    openIncidentDetail(inc);
  };

  return (
    <aside
      aria-label="Active Incident Alerts"
      className="absolute top-20 right-3 z-30 flex flex-col gap-2 max-w-xs w-full pointer-events-auto select-none"
    >
      <div className="flex items-center justify-between px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider uppercase text-rose-300 bg-rose-950/80 border border-rose-500/40 rounded backdrop-blur-md">
        <span className="flex items-center gap-1.5 animate-pulse">
          <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
          ACTIVE THREATS ({activeIncidents.length})
        </span>
        <span className="text-slate-400 text-[9px]">TAB TO CYCLE</span>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto no-scrollbar">
        {activeIncidents.map((inc) => {
          const isCritical = inc.severity === "P1_CRITICAL";
          const isUnattended = inc.status === "active"; // active means unacknowledged
          const mttaTicks = inc.mtta_seconds;
          const breachThreshold = 12;
          const urgencyPct = Math.min(100, (mttaTicks / breachThreshold) * 100);

          return (
            <div
              key={inc.id}
              onClick={() => handleCardClick(inc)}
              className={`p-2.5 rounded-xl border backdrop-blur-xl shadow-xl transition-all cursor-pointer hover:translate-x-[-2px] ${
                isCritical
                  ? "bg-slate-950/90 border-rose-500/70 shadow-[0_0_15px_rgba(244,63,94,0.2)]"
                  : "bg-slate-950/85 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <SeverityBadge severity={inc.severity} />
                <span className="text-[10px] font-mono font-bold text-sky-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                  {inc.service_id.toUpperCase()}
                </span>
              </div>

              {/* Title */}
              <p className="text-xs font-semibold text-slate-100 truncate mb-2">{inc.title}</p>

              {/* MTTA Urgency countdown bar (12-tick breach indicator) */}
              {isUnattended && (
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[9px] font-mono mb-0.5">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-amber-400" /> MTTA Risk
                    </span>
                    <span className={mttaTicks >= 10 ? "text-rose-400 font-bold animate-pulse" : "text-amber-400"}>
                      {mttaTicks} / {breachThreshold} Ticks
                    </span>
                  </div>
                  <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        mttaTicks >= 10 ? "bg-rose-500" : mttaTicks >= 6 ? "bg-amber-400" : "bg-sky-400"
                      }`}
                      style={{ width: `${urgencyPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Quick Actions on the card */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
                {isUnattended ? (
                  <button
                    onClick={(e) => handleAcknowledge(inc, e)}
                    className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold transition-colors active:scale-95"
                    title="Freeze MTTA clock and prevent regulatory fines"
                  >
                    <Check className="w-3 h-3 text-emerald-400" />
                    ACKNOWLEDGE
                  </button>
                ) : (
                  <span className="flex-1 text-[9px] font-mono text-emerald-400 font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" /> MTTA FROZEN
                  </span>
                )}

                <button
                  onClick={(e) => handleTriage(inc, e)}
                  className="flex items-center gap-1 py-1 px-2 rounded-lg bg-sky-950/60 hover:bg-sky-900/80 border border-sky-500/40 text-sky-300 text-[10px] font-bold transition-colors active:scale-95"
                  title="Open Log Triage Terminal"
                >
                  <Terminal className="w-3 h-3 text-sky-400" />
                  TRIAGE
                </button>

                <div className="text-slate-500 hover:text-slate-300">
                  <ChevronRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
