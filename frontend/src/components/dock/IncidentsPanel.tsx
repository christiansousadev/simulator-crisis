import { CheckCircle2, Terminal, TimerReset } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { translateIncidentTitle } from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { Incident } from "../../types/game";
import { activeDurationTicks, countDependents, isBreachImminent, ticksToRegulatoryBreach } from "../../utils/incidentImpact";
import { deriveIncidentPipelineStatus } from "../../utils/incidentPipeline";
import { severityTone } from "../../utils/severity";
import { playAcknowledgeBeep, playClickSound } from "../../utils/sound";
import SeverityBadge from "../common/SeverityBadge";
import StatusPill from "../common/StatusPill";

// CLEAN PRIORITY NOTIFICATION LIST FOR ACTIVE INCIDENTS, ORDERED SEVERITY -> SERVICE -> TITLE ->
// ACTIVE TIME -> IMPACT -> STATUS -> IMMEDIATE ACTION, WITH THE TECHNICAL ID RELEGATED TO A FOOTNOTE
export default function IncidentsPanel() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const incidents = useGameStore((s) => s.telemetry.active_incidents);
  const services = useGameStore((s) => s.telemetry.services);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const triageIncidentId = useGameStore((s) => s.triageIncidentId);
  const runAnimations = useGameStore((s) => s.runAnimations);
  const openIncidentDetail = useGameStore((s) => s.openIncidentDetail);
  const openTriageTerminal = useGameStore((s) => s.openTriageTerminal);
  const selectService = useGameStore((s) => s.selectService);
  const triggerRunAnimation = useGameStore((s) => s.triggerRunAnimation);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const [ackingIds, setAckingIds] = useState<Set<string>>(new Set());

  const handleAcknowledge = async (incident: Incident) => {
    if (ackingIds.has(incident.id)) return; // already in flight -- ignore a rapid double-click
    playAcknowledgeBeep();
    setAckingIds((prev) => new Set(prev).add(incident.id));
    triggerRunAnimation(incident.service_id, "acknowledge");
    try {
      await api.acknowledgeIncident(incident.id);
    } catch {
      // the animation already played optimistically; surface the failure explicitly instead of
      // silently leaving the player thinking it worked -- the button reappearing (status never
      // changed) is otherwise the only signal, and it's easy to miss
      pushFloatingText(t.floatingTexts.actionFailed, "danger");
    } finally {
      setAckingIds((prev) => {
        const next = new Set(prev);
        next.delete(incident.id);
        return next;
      });
    }
  };

  const handleInvestigate = (incident: Incident) => {
    playClickSound();
    selectService(incident.service_id);
    openTriageTerminal(incident.id);
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
          const service = services.find((s) => s.id === inc.service_id);
          const pipelineStatus = deriveIncidentPipelineStatus(inc, {
            isInvestigating: triageIncidentId === inc.id,
            isMitigating: runAnimations.some((a) => a.serviceId === inc.service_id && a.kind === "mitigate"),
          });
          const dependents = countDependents(service, services);
          const breachSoon = isBreachImminent(inc);
          const canInvestigate = (inc.status === "active" || inc.status === "acknowledged") && !inc.triage_solved;

          return (
            <div
              key={inc.id}
              onClick={() => openIncidentDetail(inc)}
              className={`flex flex-col gap-1.5 p-3 rounded-lg border bg-slate-900/80 border-slate-800 hover:border-slate-700 cursor-pointer transition-all shadow-md ${tone.ring}`}
            >
              {/* severity -> service -> title */}
              <div className="flex items-start gap-2 min-w-0">
                <SeverityBadge severity={inc.severity} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-slate-200 truncate block">{service?.name ?? inc.service_id}</span>
                  <p className="text-xs text-slate-400 truncate">{translateIncidentTitle(inc.title, language)}</p>
                </div>
              </div>

              {/* active time + impact */}
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                <span>{t.incidents.activeFor(activeDurationTicks(inc, currentTick))}</span>
                <span className="text-slate-600">·</span>
                <span>{service?.tier === "critical" ? t.incidents.impactTier.critical : t.incidents.impactTier.standard}</span>
                {dependents > 0 && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span>{t.incidents.dependentsAffected(dependents)}</span>
                  </>
                )}
              </div>

              {/* status pipeline + immediate action */}
              <div className="flex items-center justify-between gap-2 mt-auto pt-1 border-t border-slate-800/70">
                <div className="flex items-center gap-1.5 min-w-0">
                  <StatusPill status={pipelineStatus} />
                  {inc.status === "active" && (
                    <span className={`flex items-center gap-0.5 shrink-0 text-[10px] font-mono ${breachSoon ? "text-rose-400 font-bold" : "text-slate-500"}`}>
                      <TimerReset className="w-2.5 h-2.5" />
                      {t.incidents.sanctionCountdown(ticksToRegulatoryBreach(inc))}
                    </span>
                  )}
                </div>
                {inc.status === "active" ? (
                  <button
                    disabled={ackingIds.has(inc.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAcknowledge(inc);
                    }}
                    className="shrink-0 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-slate-950 font-bold text-[10px] px-3 py-1.5 rounded shadow-[0_0_10px_rgba(245,158,11,0.25)] active:scale-95 transition-all"
                  >
                    {t.incidents.acknowledge}
                  </button>
                ) : canInvestigate ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInvestigate(inc);
                    }}
                    className="shrink-0 flex items-center gap-1 bg-sky-500 hover:bg-sky-400 text-white font-bold text-[10px] px-3 py-1.5 rounded active:scale-95 transition-all"
                  >
                    <Terminal className="w-2.5 h-2.5" />
                    {t.incidents.investigate}
                  </button>
                ) : null}
              </div>

              {/* technical id, kept as secondary footnote */}
              <p className="text-[9px] text-slate-600 font-mono truncate">#{inc.id}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
