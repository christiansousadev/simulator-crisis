import { AlertTriangle, CheckCircle2, TimerReset } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { Incident } from "../../types/game";
import { playClickSound } from "../../utils/sound";

// ticks until an unacknowledged incident triggers the regulatory breach fine, per formulas.UNATTENDED_BREACH_TICK
const REGULATORY_BREACH_TICK = 12;

function severityTone(severity: Incident["severity"]) {
  if (severity === "P1_CRITICAL") {
    return {
      badge: "bg-rose-500/15 text-rose-300 border-rose-500/40",
      icon: "text-rose-400",
      card: "border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.15)] bg-rose-950/20",
    };
  }
  if (severity === "P2_HIGH") {
    return {
      badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
      icon: "text-amber-400",
      card: "border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.1)] bg-amber-950/20",
    };
  }
  return { badge: "bg-slate-500/15 text-slate-300 border-slate-500/40", icon: "text-slate-400", card: "" };
}

// CLEAN PRIORITY NOTIFICATION LIST FOR ACTIVE INCIDENTS
export default function IncidentsPanel() {
  const t = useTranslation();
  const incidents = useGameStore((s) => s.telemetry.active_incidents);
  const openIncidentDetail = useGameStore((s) => s.openIncidentDetail);
  const triggerRunAnimation = useGameStore((s) => s.triggerRunAnimation);

  const handleAcknowledge = async (incident: Incident) => {
    playClickSound();
    triggerRunAnimation(incident.service_id, "acknowledge");
    try {
      await api.acknowledgeIncident(incident.id);
    } catch {
      // next telemetry frame reconciles the actual engine state
    }
  };

  if (incidents.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 gap-1">
        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
        <p className="text-xs font-medium">{t.incidents.allNominal}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-2">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {incidents.map((inc) => {
          const tone = severityTone(inc.severity);
          const ticksToBreach = Math.max(0, REGULATORY_BREACH_TICK - inc.mtta_seconds);
          const breachSoon = inc.status === "active" && ticksToBreach <= 3;

          return (
            <div
              key={inc.id}
              onClick={() => openIncidentDetail(inc)}
              className={`flex flex-col gap-1.5 p-3 rounded-lg border bg-slate-900/80 border-slate-800 hover:border-slate-700 cursor-pointer transition-all shadow-md ${tone.card}`}
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${tone.icon}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${tone.badge}`}>
                      {t.severities[inc.severity]}
                    </span>
                    <span className="text-xs font-semibold text-slate-200 truncate">{inc.service_id}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">{inc.title}</p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-auto pt-1 border-t border-slate-800/70">
                <div className="flex items-center gap-2.5 text-[10px] text-slate-400 font-mono min-w-0">
                  <span>{t.incidents.mtta} {inc.mtta_seconds}t</span>
                  <span>{t.incidents.mttr} {inc.mttr_seconds}t</span>
                  {inc.status === "active" && (
                    <span className={`flex items-center gap-0.5 shrink-0 ${breachSoon ? "text-rose-400 font-bold" : ""}`}>
                      <TimerReset className="w-2.5 h-2.5" />
                      {t.incidents.sanctionCountdown(ticksToBreach)}
                    </span>
                  )}
                </div>
                {inc.status === "active" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcknowledge(inc);
                    }}
                    className="shrink-0 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-bold text-[10px] px-3 py-1.5 rounded shadow-[0_0_10px_rgba(245,158,11,0.3)] active:scale-95 transition-all"
                  >
                    {t.incidents.acknowledge}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
