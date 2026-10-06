import { Check, CheckCircle2, HelpCircle, Loader2, Terminal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { translateIncidentTitle, translateRootCause } from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { useMitigations } from "../../hooks/useMitigations";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useDialogSounds } from "../../hooks/useDialogSounds";
import { usePresence } from "../../hooks/usePresence";
import { activeDurationTicks, countDependents, ticksToRegulatoryBreach } from "../../utils/incidentImpact";
import { LIFECYCLE_STEPS, lifecycleIndex, nextIncidentAction } from "../../utils/incidentLifecycle";
import { accruedSurcharge, surchargePerTick } from "../../utils/incidentSurcharge";
import { playAcknowledgeBeep } from "../../utils/sound";
import { deriveIncidentPipelineStatus } from "../../utils/incidentPipeline";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";
import CooldownButton from "../common/CooldownButton";
import SeverityBadge from "../common/SeverityBadge";
import StatusPill from "../common/StatusPill";
import LiveSparkline from "../common/LiveSparkline";

const TITLE_ID = "incident-detail-title";
// the confirming status normally arrives within a tick; if the game is paused it may not, so the
// pending state is released after this long instead of leaving the button stuck
const ACK_PENDING_TIMEOUT_MS = 5000;

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// THREE-BLOCK INCIDENT BRIEFING: WHAT'S HAPPENING / WHAT'S THE IMPACT / WHAT CAN I DO NOW --
// WITH CONTEXTUAL ACTIONS EMBEDDED SO ACKNOWLEDGING OR MITIGATING NEVER REQUIRES CLOSING THE MODAL
export default function IncidentDetailModal() {
  const t = useTranslation();
  const copy = t.gameplayModals.detail;
  const language = useGameStore((s) => s.language);
  const snapshot = useGameStore((s) => s.selectedIncident);
  const liveIncidents = useGameStore((s) => s.telemetry.active_incidents);
  const services = useGameStore((s) => s.telemetry.services);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const triageIncidentId = useGameStore((s) => s.triageIncidentId);
  const isMitigating = useGameStore((s) => {
    const sid = s.selectedIncident?.service_id;
    return sid ? s.runAnimations.some((a) => a.serviceId === sid && a.kind === "mitigate") : false;
  });
  const close = useGameStore((s) => s.closeIncidentDetail);
  const openTriageTerminal = useGameStore((s) => s.openTriageTerminal);
  const selectService = useGameStore((s) => s.selectService);
  const triggerRunAnimation = useGameStore((s) => s.triggerRunAnimation);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const [ackPending, setAckPending] = useState(false);
  const ackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // the last non-null snapshot keeps the briefing readable while the exit animation plays
  const { data: held } = usePresence(snapshot);
  // resolve against the live telemetry snapshot while the incident is still active/tracked, so the
  // modal never goes stale across ticks (a solved investigation, a fresh acknowledge, a status
  // change) -- falling back to the snapshot taken at open time once it drops off the active list
  const incident = liveIncidents.find((i) => i.id === held?.id) ?? held;
  const open = snapshot !== null;
  useDialogSounds(open, "close");

  const { runbooks, execute } = useMitigations(incident?.service_id ?? null);

  // opening the modal on a new incident targets the action deck at its service automatically, so
  // acknowledging/mitigating never requires a separate click over in the office or the dock
  useEffect(() => {
    if (snapshot) selectService(snapshot.service_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.id]);

  const status = incident?.status;
  // the pending acknowledge ends when the confirming status arrives (or the incident changes)
  useEffect(() => {
    if (status && status !== "active") setAckPending(false);
  }, [status, incident?.id]);
  useEffect(() => {
    setAckPending(false);
  }, [snapshot?.id]);
  useEffect(
    () => () => {
      if (ackTimer.current) clearTimeout(ackTimer.current);
    },
    []
  );

  const elapsed = incident ? activeDurationTicks(incident, currentTick) : 0;
  const isOpenIncident = incident ? incident.status === "active" || incident.status === "acknowledged" : false;
  const surchargeTotal = useAnimatedNumber(incident ? accruedSurcharge(incident, elapsed) : 0);

  if (!incident) return null;

  const service = services.find((s) => s.id === incident.service_id);
  const canAcknowledge = incident.status === "active";
  const canInvestigate = isOpenIncident && !incident.triage_solved;
  const next = nextIncidentAction(incident);
  const stepIndex = lifecycleIndex(incident, isMitigating);
  const pipelineStatus = deriveIncidentPipelineStatus(incident, {
    isInvestigating: triageIncidentId === incident.id,
    isMitigating,
  });
  const ticksUnit = copy.ticksUnit;

  const handleAcknowledge = async () => {
    if (ackPending) return; // already in flight -- ignore a rapid double-click
    playAcknowledgeBeep();
    setAckPending(true);
    if (ackTimer.current) clearTimeout(ackTimer.current);
    ackTimer.current = setTimeout(() => setAckPending(false), ACK_PENDING_TIMEOUT_MS);
    triggerRunAnimation(incident.service_id, "acknowledge");
    try {
      await api.acknowledgeIncident(incident.id);
    } catch {
      // the animation already played optimistically; surface the failure explicitly instead of
      // silently leaving the player thinking it worked
      pushFloatingText(t.floatingTexts.actionFailed, "danger");
      setAckPending(false);
    }
  };

  const handleInvestigate = () => {
    // deliberately does not close this modal: selectedIncident stays set, so closing the
    // triage terminal (or its own "back to incident" button) returns straight here
    openTriageTerminal(incident.id);
  };

  const nextRing = "ring-2 ring-offset-2 ring-offset-slate-900";

  return (
    <Modal open={open} onClose={close} labelledBy={TITLE_ID} layer="dialog" size="lg">
      <ModalHeader
        id={TITLE_ID}
        title={translateIncidentTitle(incident.title, language)}
        icon={
          <div className="p-2 rounded-lg bg-rose-500/15 text-rose-400 shrink-0">
            <Terminal className="w-4 h-4" />
          </div>
        }
        onClose={close}
        closeLabel={t.common.close}
      >
        <div className="flex items-center gap-1.5 shrink-0">
          <SeverityBadge severity={incident.severity} />
          <StatusPill status={pipelineStatus} />
        </div>
      </ModalHeader>

      <ModalBody className="p-5 flex flex-col gap-5">
        {/* BLOCK 1: WHAT'S HAPPENING */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-heading font-bold uppercase tracking-wide text-slate-300">{t.incidentDetail.whatsHappening}</h3>
          <p className="text-xs text-slate-400">
            {t.incidentDetail.affectedService}: <span className="text-slate-200 font-semibold">{service?.name ?? incident.service_id}</span>
            {" · "}
            <span className="tabular-nums">{t.incidents.activeFor(elapsed)}</span>
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
                  <span className="tracking-wider uppercase">{copy.oscilloscope}</span>
                  <span className="text-cyan-400 font-semibold font-mono tabular-nums">
                    {service.latency_ms}ms · {(service.error_rate * 100).toFixed(1)}% {copy.errSuffix}
                  </span>
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
          <h3 className="text-[11px] font-heading font-bold uppercase tracking-wide text-slate-300">{t.incidentDetail.impactHeader}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>{service?.tier === "critical" ? t.incidents.impactTier.critical : t.incidents.impactTier.standard}</span>
            <span>{t.incidents.dependentsAffected(countDependents(service, services))}</span>
            {incident.status === "active" && (
              <span className="font-mono font-bold text-rose-400 tabular-nums">{t.incidents.sanctionCountdown(ticksToRegulatoryBreach(incident))}</span>
            )}
          </div>
          <dl aria-label={copy.liveMetrics} className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
              <dt className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">{t.incidents.mtta}</dt>
              <dd className="font-mono font-bold text-slate-200 text-sm tabular-nums">
                {incident.mtta_seconds}
                {ticksUnit}
              </dd>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5">
              <dt className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">{t.incidents.mttr}</dt>
              <dd className="font-mono font-bold text-slate-200 text-sm tabular-nums">
                {incident.mttr_seconds}
                {ticksUnit}
              </dd>
            </div>
            <div className={`rounded-md border px-2 py-1.5 ${isOpenIncident ? "border-rose-500/30 bg-rose-950/20" : "border-slate-800 bg-slate-950/60"}`}>
              <dt className="text-[9px] uppercase tracking-wide text-slate-500 font-semibold">{copy.surcharge}</dt>
              <dd className={`font-mono font-bold text-sm tabular-nums ${isOpenIncident ? "text-rose-300" : "text-slate-200"}`}>
                {money(surchargeTotal)}
                {isOpenIncident && (
                  <span className="block text-[9px] font-semibold text-rose-400/80">{copy.surchargeRate(money(surchargePerTick(incident.severity, elapsed)))}</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* BLOCK 3: WHAT CAN I DO NOW */}
        <section className="flex flex-col gap-3 pt-1 border-t border-slate-800">
          <h3 className="text-[11px] font-heading font-bold uppercase tracking-wide text-slate-300">{t.incidentDetail.actionsHeader}</h3>

          <ol aria-label={copy.lifecycleLabel} className="flex items-start">
            {LIFECYCLE_STEPS.map((step, idx) => {
              const done = idx < stepIndex || (idx === stepIndex && step === "resolved");
              const current = idx === stepIndex && !done;
              return (
                <li key={step} aria-current={current ? "step" : undefined} className="flex-1 min-w-0 flex flex-col items-center gap-1 relative">
                  {idx > 0 && (
                    <span
                      aria-hidden="true"
                      className={`absolute top-3 right-1/2 w-full h-0.5 -z-0 transition-colors duration-slow ${idx <= stepIndex ? "bg-emerald-500/60" : "bg-slate-700"}`}
                    />
                  )}
                  <span
                    className={`relative z-10 w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-bold transition-colors duration-slow ${
                      done
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
                        : current
                        ? "bg-sky-500/20 border-sky-400 text-sky-200 ring-2 ring-sky-400/30"
                        : "bg-slate-900 border-slate-700 text-slate-600"
                    }`}
                  >
                    {done ? <Check className="w-3 h-3" /> : idx + 1}
                  </span>
                  <span className={`text-[9px] font-semibold uppercase tracking-wide text-center leading-tight ${done ? "text-emerald-400" : current ? "text-sky-200" : "text-slate-600"}`}>
                    {copy.steps[step]}
                  </span>
                </li>
              );
            })}
          </ol>

          {!canAcknowledge && !canInvestigate && pipelineStatus === "resolved" && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              {t.incidents.statusPill.resolved}
            </div>
          )}

          {isOpenIncident && (
            <div
              className={`rounded-lg p-2 -m-2 transition-shadow duration-slow ${next === "chooseRunbook" ? "ring-1 ring-cyan-400/50 bg-cyan-500/5" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{t.incidentDetail.quickMitigate}</span>
                {next === "chooseRunbook" && <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold uppercase">{copy.nextStep}</span>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1.5">
                {runbooks.map((rb) => {
                  const Icon = rb.icon;
                  const rbCopy = t.mitigations.actions[rb.actionId];
                  return (
                    <CooldownButton
                      key={rb.actionId}
                      progress={rb.cooldownProgress}
                      onClick={() => execute(rb)}
                      disabled={!!rb.blockedReason}
                      title={rb.blockedReason ? t.mitigations.blocked[rb.blockedReason] : undefined}
                      className={`rounded-lg border p-2 text-left transition-colors duration-fast disabled:opacity-40 disabled:cursor-not-allowed ${
                        rb.danger ? "border-rose-500/50 bg-rose-950/30 hover:bg-rose-950/50" : "border-slate-800 bg-slate-950/60 hover:bg-slate-800/60"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] font-bold ${rb.danger ? "text-rose-300" : "text-slate-200"}`}>{rbCopy.name}</span>
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

          {/* technical id, kept as secondary footnote rather than the modal's headline */}
          <p className="text-[9px] text-slate-600 font-mono">
            #{incident.id} · {t.incidentDetail.createdTick} {incident.created_tick}
            {incident.acknowledged_tick !== null && ` · ${t.incidentDetail.acknowledgedTick} ${incident.acknowledged_tick}`}
          </p>
        </section>
      </ModalBody>

      <ModalFooter className="justify-between">
        <button
          type="button"
          onClick={close}
          className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors duration-fast"
        >
          {copy.closeAction}
        </button>
        <div className="flex items-center gap-2">
          {canAcknowledge && (
            <button
              type="button"
              disabled={ackPending}
              aria-busy={ackPending}
              onClick={handleAcknowledge}
              className={`relative flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-70 disabled:hover:bg-amber-500 text-slate-950 text-xs font-bold transition-colors duration-fast ${
                next === "acknowledge" ? `${nextRing} ring-amber-300/70` : ""
              }`}
            >
              {ackPending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              {ackPending ? copy.acknowledging : t.incidents.acknowledge}
              {next === "acknowledge" && !ackPending && <span className="px-1 rounded bg-slate-950/20 text-[9px] uppercase">{copy.nextStep}</span>}
            </button>
          )}
          {canInvestigate && (
            <button
              type="button"
              onClick={handleInvestigate}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors duration-fast ${
                next === "investigate"
                  ? `bg-sky-500 hover:bg-sky-400 text-white ${nextRing} ring-sky-300/70`
                  : "bg-slate-800 hover:bg-slate-700 text-sky-200 border border-slate-700"
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              {t.logTriage.investigateLogs}
              {next === "investigate" && <span className="px-1 rounded bg-slate-950/20 text-[9px] uppercase">{copy.nextStep}</span>}
            </button>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
}
