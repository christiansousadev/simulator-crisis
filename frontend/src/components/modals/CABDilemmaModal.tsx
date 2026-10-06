import { Gavel } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { translateDilemma } from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { DilemmaChoice, DilemmaOffer } from "../../types/game";
import { usePresence } from "../../hooks/usePresence";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  DilemmaDeltas,
  DilemmaOutcomeKind,
  deadlineFraction,
  deadlineTone,
  isFavorable,
  outcomeFromAudit,
  projectMeters,
  remainingSeconds,
  remainingTicks,
  safeTickRate,
  shouldCountdownBeep,
  smoothRemainingTicks,
  windowTotalTicks,
} from "../../utils/cabDeadline";
import { playCountdownTickSound, playDilemmaChime, playErrorSound, playGavelSound, playUiConfirmSound } from "../../utils/sound";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";

const TITLE_ID = "cab-dilemma-title";
const OUTCOME_MS = 1200;
const OUTCOME_EXPIRED_MS = 1600;

type Phase = "deciding" | "resolving" | "outcome";
type DeltaKey = keyof DilemmaDeltas;

const DELTA_KEYS: DeltaKey[] = ["budget", "techDebt", "morale", "reputation"];

const choiceDeltas = (c: DilemmaChoice): DilemmaDeltas => ({
  budget: c.budget_delta,
  techDebt: c.tech_debt_delta,
  morale: c.happiness_delta,
  reputation: c.reputation_delta,
});

function formatDelta(key: DeltaKey, value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(Math.round(value * 10) / 10);
  return key === "budget" ? `${sign}$${abs.toLocaleString()}` : `${sign}${abs}`;
}

const TONE_BAR: Record<"calm" | "warn" | "critical", string> = {
  calm: "bg-sky-500",
  warn: "bg-amber-500",
  critical: "bg-rose-500",
};
const TONE_TEXT: Record<"calm" | "warn" | "critical", string> = {
  calm: "text-sky-300",
  warn: "text-amber-300",
  critical: "text-rose-300",
};

// signed value pill: emerald for a favorable delta, rose for an unfavorable one (dark surfaces)
function ImpactPill({ label, deltaKey, value }: { label: string; deltaKey: DeltaKey; value: number }) {
  const tone =
    value === 0
      ? "text-slate-400 bg-slate-700/40"
      : isFavorable(deltaKey, value)
      ? "text-emerald-300 bg-emerald-500/15"
      : "text-rose-300 bg-rose-500/15";
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${tone}`}>
      {label}: {formatDelta(deltaKey, value)}
    </span>
  );
}

// cinematic change advisory board decision card. The server owns the deadline and auto-resolves
// at expires_at_tick; this modal only presents the countdown, previews effects, and reconciles.
export default function CABDilemmaModal() {
  const t = useTranslation();
  const copy = t.gameplayModals.cab;
  const language = useGameStore((s) => s.language);
  const rawDilemma = useGameStore((s) => s.activeDilemma);
  // memoized on the raw dilemma + language, not recomputed (and not a new object) on every
  // tick-driven re-render, so the reset effect below never mistakes a re-render for a new dilemma
  const dilemma = useMemo(() => (rawDilemma ? translateDilemma(rawDilemma, language) : null), [rawDilemma, language]);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const tickRateSeconds = safeTickRate(useGameStore((s) => s.telemetry.tick_rate_seconds));
  const isRunning = useGameStore((s) => s.telemetry.is_running);
  const budget = useGameStore((s) => s.telemetry.budget);
  const techDebt = useGameStore((s) => s.telemetry.tech_debt);
  const morale = useGameStore((s) => s.telemetry.user_happiness);
  const reputation = useGameStore((s) => s.telemetry.reputation);
  const setActiveDilemma = useGameStore((s) => s.setActiveDilemma);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const reduced = useReducedMotion();

  const [held, setHeld] = useState<DilemmaOffer | null>(null);
  const [offeredAt, setOfferedAt] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("deciding");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ kind: DilemmaOutcomeKind; choiceId: string | null; deltas: DilemmaDeltas } | null>(null);
  const heldIdRef = useRef<string | null>(null);

  // the audit row the engine writes when the dilemma closes tells an explicit choice from the
  // committee's fallback (auto_resolved), and carries the exact applied deltas
  const heldId = held?.dilemma_id ?? null;
  const resolvedAudit = useGameStore((s) =>
    heldId ? s.telemetry.recent_audits.find((a) => a.event_type === "DILEMMA_RESOLVED" && a.details?.dilemma_id === heldId) : undefined
  );

  const { data: view } = usePresence(held);
  const open = held !== null;

  // a genuinely new dilemma resets the card; a language switch only swaps the copy
  useEffect(() => {
    if (!dilemma) return;
    setHeld(dilemma);
    if (dilemma.dilemma_id !== heldIdRef.current) {
      heldIdRef.current = dilemma.dilemma_id;
      setOfferedAt(currentTick);
      setPhase("deciding");
      setPickedId(null);
      setPreviewId(null);
      setOutcome(null);
      playDilemmaChime();
    }
    // currentTick is only the tick the offer was first seen at
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dilemma]);

  // reconcile: the store drops the dilemma once the server's tick passes expires_at_tick (or on a
  // reset). If the engine resolved it without us, show who decided instead of just vanishing.
  useEffect(() => {
    if (rawDilemma || !held || phase === "outcome") return;
    const fromAudit = outcomeFromAudit(resolvedAudit?.details);
    if (fromAudit) {
      setOutcome(fromAudit);
      setPhase("outcome");
    } else {
      heldIdRef.current = null;
      setHeld(null);
    }
  }, [rawDilemma, held, phase, resolvedAudit]);

  // outcome card is shown briefly, then the dialog leaves
  useEffect(() => {
    if (phase !== "outcome" || !outcome) return;
    playGavelSound();
    const id = setTimeout(() => {
      setActiveDilemma(null);
      heldIdRef.current = null;
      setHeld(null);
    }, outcome.kind === "expired" ? OUTCOME_EXPIRED_MS : OUTCOME_MS);
    return () => clearTimeout(id);
  }, [phase, outcome, setActiveDilemma]);

  // ---- countdown ----
  const expiresAt = view?.expires_at_tick ?? 0;
  const ticksLeft = remainingTicks(expiresAt, currentTick);
  const seconds = remainingSeconds(ticksLeft, tickRateSeconds);
  const total = windowTotalTicks(expiresAt, offeredAt);
  const steppedFraction = deadlineFraction(ticksLeft, total);
  const tone = deadlineTone(steppedFraction, seconds);
  const expired = ticksLeft <= 0;
  const deciding = phase === "deciding";
  const barRef = useRef<HTMLDivElement>(null);
  const lastTickAt = useRef(0);

  useEffect(() => {
    lastTickAt.current = performance.now();
  }, [currentTick]);

  // glide the bar between two tick frames with wall-clock time; reduced motion steps per tick
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !open) return;
    if (reduced || !deciding || ticksLeft <= 0) {
      bar.style.transform = `scaleX(${steppedFraction})`;
      return;
    }
    let raf = 0;
    const frame = () => {
      const smooth = smoothRemainingTicks(ticksLeft, performance.now() - lastTickAt.current, tickRateSeconds, isRunning);
      bar.style.transform = `scaleX(${deadlineFraction(smooth, total)})`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [open, reduced, deciding, ticksLeft, steppedFraction, total, tickRateSeconds, isRunning]);

  // one beep per whole second in the final stretch
  const lastBeepSecond = useRef<number | null>(null);
  useEffect(() => {
    if (!open || !deciding) return;
    if (shouldCountdownBeep(seconds, lastBeepSecond.current)) playCountdownTickSound();
    lastBeepSecond.current = seconds;
  }, [open, deciding, seconds]);

  const handleChoice = async (choice: DilemmaChoice) => {
    if (!view || phase !== "deciding" || expired) return;
    setPhase("resolving");
    setPickedId(choice.id);
    setPreviewId(null);
    playUiConfirmSound();
    try {
      const res = await api.resolveDilemma(view.dilemma_id, choice.id);
      if (res.success) {
        setOutcome({ kind: "explicit", choiceId: choice.id, deltas: choiceDeltas(choice) });
        setPhase("outcome");
      }
      // success:false means the window closed under us; stay in "resolving" until the server's
      // frame arrives and the reconcile effect shows what the committee decided
    } catch {
      // best-effort; the next telemetry frame or dilemma expiry reconciles actual engine state
      setPhase("deciding");
      setPickedId(null);
      playErrorSound();
      pushFloatingText(copy.choiceFailed, "danger");
    }
  };

  const previewChoice = view?.choices.find((c) => c.id === previewId) ?? null;
  const current = { budget, techDebt, morale, reputation };
  const projected = previewChoice ? projectMeters(current, choiceDeltas(previewChoice)) : null;
  const outcomeChoice = outcome?.choiceId ? view?.choices.find((c) => c.id === outcome.choiceId) : undefined;
  const impactLabels: Record<DeltaKey, string> = {
    budget: t.cabDilemma.choiceImpact.budget,
    techDebt: t.cabDilemma.choiceImpact.techDebt,
    morale: t.cabDilemma.choiceImpact.morale,
    reputation: t.cabDilemma.choiceImpact.reputation,
  };

  return (
    <Modal
      open={open}
      role="alertdialog"
      labelledBy={TITLE_ID}
      layer="critical"
      size="lg"
      closeOnBackdrop={false}
      panelClass="!border-2 !border-rose-500/40"
    >
      {view && (
        <>
          <ModalHeader id={TITLE_ID} title={t.cabDilemma.modalTitle} icon={<Gavel className="w-4 h-4 text-rose-400 shrink-0" />} />

          {/* draining deadline; the server decides at expiry, this is presentation only */}
          <div className="shrink-0 px-5 pt-3 pb-3 border-b border-slate-800 bg-slate-950/40">
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{copy.deadline}</span>
              <span role="timer" className={`text-xs font-bold tabular-nums transition-colors duration-slow ${TONE_TEXT[tone]}`}>
                {deciding && expired ? copy.resolving : copy.secondsLeft(seconds)}
                <span className="ml-2 font-normal text-slate-500">{copy.ticksLeft(ticksLeft)}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
              <div
                ref={barRef}
                className={`h-full w-full origin-left rounded-full transition-colors duration-slow ${TONE_BAR[tone]} ${
                  tone === "critical" && deciding ? "animate-pulse" : ""
                }`}
                style={{ transform: `scaleX(${steppedFraction})` }}
              />
            </div>
            <p role="status" className="sr-only">
              {tone === "critical" && deciding ? copy.timeCritical : ""}
            </p>
          </div>

          <ModalBody className="px-5 py-4 flex flex-col gap-4">
            <div>
              <h3 className="text-base font-bold text-white mb-2">{view.title}</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{view.narrative}</p>
            </div>

            <div className="relative">
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 gap-3 transition-opacity duration-base ${phase === "outcome" ? "opacity-0" : ""}`}
                aria-hidden={phase === "outcome"}
                onMouseLeave={() => setPreviewId(null)}
              >
                {view.choices.map((choice) => {
                  const deltas = choiceDeltas(choice);
                  const picked = pickedId === choice.id;
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => handleChoice(choice)}
                      onMouseEnter={() => deciding && setPreviewId(choice.id)}
                      onFocus={() => deciding && setPreviewId(choice.id)}
                      onBlur={() => setPreviewId((p) => (p === choice.id ? null : p))}
                      disabled={!deciding || expired}
                      aria-describedby={`${TITLE_ID}-impact-${choice.id}`}
                      className={`text-left rounded-lg border p-3 outline-none transition-colors duration-fast disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-rose-400/70 ${
                        picked
                          ? "border-rose-400 bg-rose-500/10"
                          : "border-slate-700 bg-slate-800 hover:bg-slate-700/60 hover:border-rose-400/50 disabled:opacity-50"
                      }`}
                    >
                      <div className="text-sm font-bold text-white mb-2">{choice.label}</div>
                      <div id={`${TITLE_ID}-impact-${choice.id}`} className="flex flex-wrap gap-1">
                        {DELTA_KEYS.map((key) => (
                          <ImpactPill key={key} label={impactLabels[key]} deltaKey={key} value={deltas[key]} />
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* outcome card covers the choices without resizing them, so nothing jumps */}
              {phase === "outcome" && outcome && (
                <div
                  role="status"
                  className={`absolute inset-0 rounded-lg border flex flex-col items-center justify-center gap-2 px-4 py-3 text-center bg-slate-900/95 ${
                    outcome.kind === "expired" ? "border-amber-500/50" : "border-emerald-500/40"
                  } ${reduced ? "" : "animate-modal-in"}`}
                >
                  <p className="text-base font-heading font-bold text-white">
                    {outcome.kind === "expired" ? copy.committeeDecided : copy.boardDecided}
                  </p>
                  {outcomeChoice && (
                    <p className="text-sm text-slate-300">
                      {outcome.kind === "expired" ? copy.defaultApplied(outcomeChoice.label) : copy.youChose(outcomeChoice.label)}
                    </p>
                  )}
                  {outcome.kind === "expired" && <p className="text-[11px] text-amber-300/90">{copy.expiredHint}</p>}
                  <div className="flex flex-wrap justify-center gap-1.5 mt-1">
                    {DELTA_KEYS.filter((k) => outcome.deltas[k] !== 0).map((key) => (
                      <ImpactPill key={key} label={impactLabels[key]} deltaKey={key} value={outcome.deltas[key]} />
                    ))}
                    {DELTA_KEYS.every((k) => outcome.deltas[k] === 0) && <span className="text-[11px] text-slate-400">{copy.noEffect}</span>}
                  </div>
                </div>
              )}
            </div>
          </ModalBody>

          {/* live meters: hovering or focusing an option previews its effect on each one */}
          <ModalFooter className="flex-col !items-stretch gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">{copy.previewHeading}</span>
              <span className="text-[10px] text-slate-500 truncate">{phase === "deciding" ? (previewChoice ? previewChoice.label : copy.previewHint) : copy.mustDecide}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DELTA_KEYS.map((key) => {
                const delta = previewChoice ? choiceDeltas(previewChoice)[key] : 0;
                const now = current[key];
                return (
                  <div key={key} className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 min-w-0">
                    <span className="block text-[9px] uppercase tracking-wide text-slate-500 font-semibold truncate">{impactLabels[key]}</span>
                    <span className="block text-xs font-bold font-mono text-slate-200 tabular-nums truncate">
                      {key === "budget" ? `$${Math.round(now).toLocaleString()}` : Math.round(now)}
                      {projected && delta !== 0 && (
                        <span className="text-slate-500">
                          {" → "}
                          {key === "budget" ? `$${Math.round(projected[key]).toLocaleString()}` : Math.round(projected[key])}
                        </span>
                      )}
                    </span>
                    {/* fixed-height slot: the chip appears without moving anything */}
                    <span className="block h-4 mt-0.5">
                      {previewChoice && delta !== 0 && (
                        <span
                          key={`${previewChoice.id}-${key}`}
                          className={`inline-block px-1 rounded text-[10px] font-bold tabular-nums ${reduced ? "" : "animate-badge-bump"} ${
                            isFavorable(key, delta) ? "text-emerald-300 bg-emerald-500/15" : "text-rose-300 bg-rose-500/15"
                          }`}
                        >
                          {formatDelta(key, delta)}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </ModalFooter>
        </>
      )}
    </Modal>
  );
}
