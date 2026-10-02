import { CheckCircle2, HelpCircle, Terminal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { translateIncidentTitle, translateRootCause } from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { useMitigations } from "../../hooks/useMitigations";
import { activeDurationTicks, countDependents, ticksToRegulatoryBreach } from "../../utils/incidentImpact";
import { playAcknowledgeBeep, playClickSound } from "../../utils/sound";
import CooldownButton from "../common/CooldownButton";
import SeverityBadge from "../common/SeverityBadge";
import StatusPill from "../common/StatusPill";
import LiveSparkline from "../common/LiveSparkline";
import { deriveIncidentPipelineStatus } from "../../utils/incidentPipeline";

// THREE-BLOCK INCIDENT BRIEFING: WHAT'S HAPPENING / WHAT'S THE IMPACT / WHAT CAN I DO NOW --
// WITH CONTEXTUAL ACTIONS EMBEDDED SO ACKNOWLEDGING OR MITIGATING NEVER REQUIRES CLOSING THE MODAL
export default function IncidentDetailModal() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const snapshot = useGameStore((s) => s.selectedIncident);
  const liveIncidents = useGameStore((s) => s.telemetry.active_incidents);
  const services = useGameStore((s) => s.telemetry.services);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const triageIncidentId = useGameStore((s) => s.triageIncidentId);
  const runAnimations = useGameStore((s) => s.runAnimations);
  const close = useGameStore((s) => s.closeIncidentDetail);
  const openTriageTerminal = useGameStore((s) => s.openTriageTerminal);
  const selectService = useGameStore((s) => s.selectService);
  const triggerRunAnimation = useGameStore((s) => s.triggerRunAnimation);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const [acking, setAcking] = useState(false);

  // resolve against the live telemetry snapshot while the incident is still active/tracked, so the
  // modal never goes stale across ticks (a solved investigation, a fresh acknowledge, a status
  // change) -- falling back to the snapshot taken at open time once it drops off the active list
  const incident = liveIncidents.find((i) => i.id === snapshot?.id) ?? snapshot;

  const { runbooks, execute } = useMitigations(incident?.service_id ?? null);

  // opening the modal on a new incident targets the action deck at its service automatically, so
  // acknowledging/mitigating never requires a separate click over in the office or the dock
  useEffect(() => {
    if (incident) selectService(incident.service_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.id]);

  if (!incident) return null;

  const service = services.find((s) => s.id === incident.service_id);
  const canAcknowledge = incident.status === "active";
  const canInvestigate = (incident.status === "active" || incident.status === "acknowledged") && !incident.triage_solved;
  const pipelineStatus = deriveIncidentPipelineStatus(incident, {
    isInvestigating: triageIncidentId === incident.id,
    isMitigating: runAnimations.some((a) => a.serviceId === incident.service_id && a.kind === "mitigate"),
  });

  const handleAcknowledge = async () => {
    if (acking) return; // already in flight -- ignore a rapid double-click
    playAcknowledgeBeep();
    setAcking(true);
    triggerRunAnimation(incident.service_id, "acknowledge");
    try {
      await api.acknowledgeIncident(incident.id);
    } catch {
      // the animation already played optimistically; surface the failure explicitly instead of
      // silently leaving the player thinking it worked
      pushFloatingText(t.floatingTexts.actionFailed, "danger");
    } finally {
      setAcking(false);
    }
  };

  const handleInvestigate = () => {
    playClickSound();
    // deliberately does not close this modal: selectedIncident stays set, so closing the
    // triage terminal (or its own "back to incident" button) returns straight here
    openTriageTerminal(incident.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-backdrop-in" onClick={close}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-700 bg-slate-800/60">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-rose-500/15 text-rose-400 shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <SeverityBadge severity={incident.severity} />
                <StatusPill status={pipelineStatus} />
              </div>
              <span className="text-sm font-bold font-heading text-slate-100 leading-tight block mt-1">
                {translateIncidentTitle(incident.title, language)}
              </span>
            </div>
          </div>
          <button onClick={close} className="text-slate-400 hover:text-slate-100 transition-colors shrink-0" title={t.common.close}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* BLOCK 1: WHAT'S HAPPENING */}
          <section className="flex flex-col gap-2">
            <h3 className="text-[11px] font-heading font-bold uppercase tracking-wide text-slate-300">
              {t.incidentDetail.whatsHappening}
            </h3>
            <p className="text-xs text-slate-400">
              {t.incidentDetail.affectedService}: <span className="text-slate-200 font-semibold">{service?.name ?? incident.service_id}</span>
              {" · "}
              {t.incidents.activeFor(activeDurationTicks(incident, currentTick))}
            </p>

            {service && (
              <div>
                <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.incidentDetail.symptoms}</span>
                <div className="grid grid-cols-3 gap-2 text-xs mt-1 mb-2">
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-500 font-semibold">{t.nodeInspector.status}</span>
                    <span className="font-bold text-slate-200">{t.status[service.status]}</span>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-500 font-semibold">{t.nodeInspector.latency}</span>
                    <span className="font-bold text-slate-200 font-mono tabular-nums">{service.latency_ms}ms</span>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-500 font-semibold">{t.nodeInspector.errorRate}</span>
                    <span className="font-bold text-slate-200 font-mono tabular-nums">{(service.error_rate * 100).toFixed(1)}%</span>
                  </div>
                </div>
                <div className="p-2 rounded-md bg-slate-950/70 border border-slate-800/80">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1">
                    <span className="tracking-wider uppercase">Live Telemetry Oscilloscope</span>
                    <span className="text-cyan-400 font-semibold font-mono">{service.latency_ms}ms · {(service.error_rate * 100).toFixed(1)}% err</span>
                  </div>
                  <LiveSparkline
                    data={[
                      Math.max(10, Math.round(service.latency_ms * 0.4)),
                      Math.max(10, Math.round(service.latency_ms * 0.7)),
                      Math.max(10, Math.round(service.latency_ms * 0.5)),
                      Math.max(10, Math.round(service.latency_ms * 0.9)),
                      Math.max(10, Math.round(service.latency_ms * 1.2)),
                      Math.max(10, Math.round(service.latency_ms * 0.8)),
                      service.latency_ms,
                    ]}
                    tone={incident.severity === "P1_CRITICAL" ? "rose" : incident.severity === "P2_HIGH" ? "amber" : "cyan"}
                    height={38}
                    showArea={true}
                  />
                </div>
              </div>
            )}

            {incident.triage_solved ? (
              <div>
                <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.incidentDetail.rootCause}</span>
                <p className="text-xs text-rose-400 font-semibold">{translateRootCause(incident.root_cause ?? "", language)}</p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-950/20 px-2.5 py-2 text-[11px] text-amber-300/90 italic">
                <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                {t.incidentDetail.rootCausePending}
              </div>
            )}
          </section>

          {/* BLOCK 2: WHAT'S THE IMPACT */}
          <section className="flex flex-col gap-2 pt-1 border-t border-slate-800">
            <h3 className="text-[11px] font-heading font-bold uppercase tracking-wide text-slate-300">
              {t.incidentDetail.impactHeader}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span>{service?.tier === "critical" ? t.incidents.impactTier.critical : t.incidents.impactTier.standard}</span>
              <span>{t.incidents.dependentsAffected(countDependents(service, services))}</span>
              <span className="font-mono">{t.incidents.mtta} {incident.mtta_seconds}t</span>
              <span className="font-mono">{t.incidents.mttr} {incident.mttr_seconds}t</span>
              {incident.status === "active" && (
                <span className="font-mono font-bold text-rose-400">{t.incidents.sanctionCountdown(ticksToRegulatoryBreach(incident))}</span>
              )}
            </div>
          </section>

          {/* BLOCK 3: WHAT CAN I DO NOW */}
          <section className="flex flex-col gap-2.5 pt-1 border-t border-slate-800">
            <h3 className="text-[11px] font-heading font-bold uppercase tracking-wide text-slate-300">
              {t.incidentDetail.actionsHeader}
            </h3>

            {!canAcknowledge && !canInvestigate && pipelineStatus === "resolved" && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                {t.incidents.statusPill.resolved}
              </div>
            )}

            <div className="flex items-center gap-2">
              {canAcknowledge && (
                <button
                  disabled={acking}
                  onClick={handleAcknowledge}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:hover:bg-amber-500 text-slate-950 text-xs font-bold transition-colors"
                >
                  {t.incidents.acknowledge}
                </button>
              )}
              {canInvestigate && (
                <button
                  onClick={handleInvestigate}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-colors"
                >
                  <Terminal className="w-3.5 h-3.5" />
                  {t.logTriage.investigateLogs}
                </button>
              )}
            </div>

            {(incident.status === "active" || incident.status === "acknowledged") && (
              <div>
                <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.incidentDetail.quickMitigate}</span>
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
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
                          rb.danger ? "border-rose-500/50 bg-rose-950/30 hover:bg-rose-950/50" : "border-slate-800 bg-slate-950/60 hover:bg-slate-800/60"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[11px] font-bold ${rb.danger ? "text-rose-300" : "text-slate-200"}`}>{copy.name}</span>
                          <Icon className={`w-3 h-3 shrink-0 ${rb.danger ? "text-rose-400" : "text-slate-400"}`} />
                        </div>
                        <div className="flex items-center justify-between mt-1 text-[9px] font-bold tabular-nums">
                          <span className="text-rose-400">-${rb.cost.toLocaleString()}</span>
                          {rb.onCooldown ? (
                            <span className="text-slate-500">{t.mitigations.readyIn(rb.readyInTicks)}</span>
                          ) : rb.blockedReason === "budget" ? (
                            <span className="text-amber-500">{t.mitigations.blocked.budget}</span>
                          ) : rb.blockedReason === "featureFreeze" ? (
                            <span className="text-amber-500">{t.mitigations.blocked.featureFreeze}</span>
                          ) : (
                            <span className={rb.techDebtDelta < 0 ? "text-emerald-400" : "text-amber-400"}>
                              {rb.techDebtDelta > 0 ? "+" : ""}
                              {rb.techDebtDelta} {t.mitigations.tdiSuffix}
                            </span>
                          )}
                        </div>
                      </CooldownButton>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* technical id, kept as secondary footnote rather than the modal's headline */}
          <p className="text-[9px] text-slate-600 font-mono">
            #{incident.id} · {t.incidentDetail.createdTick} {incident.created_tick}
            {incident.acknowledged_tick !== null && ` · ${t.incidentDetail.acknowledgedTick} ${incident.acknowledged_tick}`}
          </p>
        </div>
      </div>
    </div>
  );
}
