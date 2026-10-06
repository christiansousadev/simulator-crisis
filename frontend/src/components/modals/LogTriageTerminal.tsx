import { ArrowLeft, Terminal } from "lucide-react";
import { KeyboardEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { translateLogLine, translateRootCause } from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { LogLevel, LogLine } from "../../types/game";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useDialogSounds } from "../../hooks/useDialogSounds";
import { usePresence } from "../../hooks/usePresence";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTypewriter } from "../../hooks/useTypewriter";
import { activeDurationTicks } from "../../utils/incidentImpact";
import { accruedSurcharge, surchargePerTick, wrongAttemptsOf } from "../../utils/incidentSurcharge";
import { initialTriageState, TRIAGE_LEVELS, triageAccuracy, triageReducer, visibleLines } from "../../utils/triageSelection";
import { playErrorSound, playSuccessSound } from "../../utils/sound";
import Modal, { ModalFooter, ModalHeader } from "../common/Modal";

const TITLE_ID = "log-triage-title";
const REVEAL_INTERVAL_MS = 45;
const SHAKE_MS = 360;
const RETURN_DELAY_MS = 1200;

const LEVEL_COLOR: Record<LogLevel, string> = {
  INFO: "text-emerald-400",
  WARN: "text-amber-400",
  ERROR: "text-rose-400",
  FATAL: "text-rose-300 font-bold",
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// DARK CRT-STYLE TERMINAL FOR THE ROOT-CAUSE LOG TRIAGE MINI-GAME. Layered above the incident
// briefing (which stays mounted underneath), so closing or finishing returns straight to it.
export default function LogTriageTerminal() {
  const t = useTranslation();
  const copy = t.gameplayModals.triage;
  const language = useGameStore((s) => s.language);
  const incidentId = useGameStore((s) => s.triageIncidentId);
  const originIncidentId = useGameStore((s) => s.selectedIncident?.id);
  const currentTick = useGameStore((s) => s.telemetry.tick);
  const close = useGameStore((s) => s.closeTriageTerminal);
  const reduced = useReducedMotion();

  // keep rendering the last incident while the exit animation plays
  const { data: heldId } = usePresence(incidentId);
  const liveIncident = useGameStore((s) => s.telemetry.active_incidents.find((i) => i.id === heldId) ?? null);
  const open = incidentId !== null;
  useDialogSounds(open, "back");

  const [lines, setLines] = useState<LogLine[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "wrong" | "error"; text: string } | null>(null);
  const [shakeId, setShakeId] = useState<string | null>(null);
  const [state, dispatch] = useReducer(triageReducer, undefined, () => initialTriageState());
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollRef = useRef<HTMLDivElement>(null);
  const keyboardMove = useRef(false);
  const wrongAtOpen = useRef(0);
  wrongAtOpen.current = wrongAttemptsOf(liveIncident);

  const shortId = (heldId ?? "").slice(0, 8);
  const boot = useTypewriter(copy.boot(shortId), open);

  // fresh terminal per incident: reset local state, then fetch the stream
  useEffect(() => {
    if (!incidentId) return;
    let cancelled = false;
    dispatch({ type: "reset", wrongAttempts: wrongAtOpen.current });
    setLines([]);
    setRevealed(0);
    setNotice(null);
    setShakeId(null);
    setSubmitting(false);
    setLoadState("loading");
    api
      .getIncidentLogs(incidentId)
      .then((res) => {
        if (cancelled) return;
        setLines(res.lines);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setLines([]);
          setLoadState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [incidentId, reloadKey]);

  // stream the lines in after the boot line; one interval, always cleared
  const streaming = loadState === "ready" && boot.done && revealed < lines.length;
  useEffect(() => {
    if (loadState !== "ready" || !boot.done) return;
    if (reduced) {
      setRevealed(lines.length);
      return;
    }
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setRevealed(n);
      if (n >= lines.length) clearInterval(id);
    }, REVEAL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadState, boot.done, lines.length, reduced]);

  // follow the stream while it is still arriving
  useEffect(() => {
    if (streaming && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [revealed, streaming]);

  // one-shot shake clears itself
  useEffect(() => {
    if (!shakeId) return;
    const id = setTimeout(() => setShakeId(null), SHAKE_MS);
    return () => clearTimeout(id);
  }, [shakeId]);

  // right pick: hold the stamp for a beat, then fall back to the briefing underneath
  useEffect(() => {
    if (!state.solvedId) return;
    const id = setTimeout(close, RETURN_DELAY_MS);
    return () => clearTimeout(id);
  }, [state.solvedId, close]);

  const shown = useMemo(() => visibleLines(lines.slice(0, revealed), state.filters, Infinity), [lines, revealed, state.filters]);
  const visibleIds = useMemo(() => shown.map((l) => l.id), [shown]);
  const hiddenByFilter = revealed - shown.length;

  // roving tabindex target: the cursor line, or the first line until the player moves
  const tabStopId = state.focusId && visibleIds.includes(state.focusId) ? state.focusId : (visibleIds[0] ?? null);

  // arrow keys move the DOM focus to the new cursor line
  useEffect(() => {
    if (!keyboardMove.current || !state.focusId) return;
    keyboardMove.current = false;
    rowRefs.current.get(state.focusId)?.focus();
  }, [state.focusId]);

  const handleListKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const active = (document.activeElement as HTMLElement | null)?.dataset.lineId ?? tabStopId;
      keyboardMove.current = true;
      // anchor the move on the line that actually has focus
      if (active && active !== state.focusId) dispatch({ type: "focus", id: active });
      dispatch({ type: "move", key: e.key, visibleIds });
    },
    [state.focusId, tabStopId, visibleIds]
  );

  const submit = async (line: LogLine) => {
    if (!incidentId || submitting || state.solvedId || state.wrongIds.includes(line.id)) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await api.submitTriage(incidentId, line.id);
      if (result.correct) {
        dispatch({ type: "solved", id: line.id });
        playSuccessSound();
      } else {
        dispatch({ type: "wrong", id: line.id });
        setShakeId(line.id);
        playErrorSound();
        setNotice({ tone: "wrong", text: copy.wrongInline(Math.round(triageAccuracy(state.attempts + 1) * 100)) });
      }
    } catch {
      // best-effort; the terminal stays interactive on a network hiccup
      setNotice({ tone: "error", text: t.floatingTexts.actionFailed });
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFilter = (level: LogLevel) =>
    dispatch({
      type: "toggleFilter",
      level,
      visibleIds: (filters) => visibleLines(lines.slice(0, revealed), filters, Infinity).map((l) => l.id),
    });

  // SLA bleeding: live accrual for this incident
  const elapsed = liveIncident ? activeDurationTicks(liveIncident, currentTick) : 0;
  const accrued = useAnimatedNumber(liveIncident ? accruedSurcharge(liveIncident, elapsed) : 0);
  const rate = liveIncident ? surchargePerTick(liveIncident.severity, elapsed) : 0;
  const rateCeiling = liveIncident ? surchargePerTick(liveIncident.severity, 0) * 3 : 1;
  const bleedFill = Math.max(0.05, Math.min(1, rate / rateCeiling));

  const quality = Math.round(triageAccuracy(state.attempts) * 100);
  const solvedLine = lines.find((l) => l.id === state.solvedId);
  const cause = liveIncident?.triage_solved && liveIncident.root_cause ? translateRootCause(liveIncident.root_cause, language) : null;
  const canGoBack = originIncidentId === heldId;

  return (
    <Modal
      open={open}
      onClose={close}
      labelledBy={TITLE_ID}
      layer="system"
      size="lg"
      backdropClass="bg-slate-950/85 backdrop-blur-sm"
      panelClass="!border-2 !border-emerald-500/40 !bg-black font-mono"
    >
      <ModalHeader
        id={TITLE_ID}
        title={t.logTriage.title}
        icon={<Terminal className="w-4 h-4 text-emerald-400 shrink-0" />}
        onClose={close}
        closeLabel={t.common.close}
        className="!border-emerald-500/30 !bg-emerald-500/5"
      />

      {/* instruction + live SLA bleed */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 border-b border-emerald-500/20">
        <div className="min-w-0">
          <p className="text-xs font-bold text-emerald-300">{copy.instruction}</p>
          <p className="text-[10px] text-emerald-600">{copy.keyboardHint}</p>
        </div>
        {liveIncident && (
          <div className="flex items-center gap-3 text-[10px]" aria-label={copy.slaBleeding}>
            <div className="flex flex-col gap-0.5 min-w-[7.5rem]">
              <span className="uppercase tracking-wide font-bold text-rose-400">{copy.slaBleeding}</span>
              <span className="h-1.5 rounded-full bg-slate-800 overflow-hidden" aria-hidden="true">
                <span
                  className="block h-full origin-left rounded-full bg-gradient-to-r from-amber-500 to-rose-500 transition-transform duration-glide ease-out-expo"
                  style={{ transform: `scaleX(${bleedFill})` }}
                />
              </span>
            </div>
            <div className="text-right tabular-nums leading-tight">
              <div className="font-bold text-rose-300">{copy.surchargeAccrued(money(accrued))}</div>
              <div className="text-slate-500">
                {copy.openFor(elapsed)} · {copy.surchargeRate(money(rate))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* level filters + attempts */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-emerald-500/20">
        <div role="group" aria-label={copy.filterLabel} className="flex items-center gap-1.5">
          {TRIAGE_LEVELS.map((level) => {
            const on = state.filters.includes(level);
            return (
              <button
                key={level}
                type="button"
                aria-pressed={on}
                onClick={() => toggleFilter(level)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors duration-fast ${
                  on ? `${LEVEL_COLOR[level]} border-current bg-white/5` : "text-slate-600 border-slate-700 hover:text-slate-400"
                }`}
              >
                {level}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-[10px] tabular-nums">
          <span key={state.attempts} className={`text-slate-400 ${state.attempts > 0 && !reduced ? "animate-badge-bump" : ""}`}>
            {copy.attempts(state.attempts)}
          </span>
          <span className={`font-bold transition-colors duration-slow ${quality >= 78 ? "text-emerald-400" : quality >= 50 ? "text-amber-400" : "text-rose-400"}`}>
            {copy.quality(quality)}
          </span>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col">
        <div
          ref={scrollRef}
          data-tour="triage-lines"
          onKeyDown={handleListKey}
          className="flex-1 min-h-[14rem] overflow-y-auto px-4 py-2 text-[11px] leading-relaxed"
          style={{ backgroundImage: "repeating-linear-gradient(rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(34,197,94,0.03) 3px)" }}
        >
          <div>
            <p className="text-emerald-500 mb-1">
              {boot.text}
              {!boot.done && <span className="inline-block w-1.5 h-3 bg-emerald-400 ml-0.5 align-middle animate-pulse" />}
            </p>

            {loadState === "loading" && boot.done && <p className="text-slate-500">{copy.loading}</p>}
            {loadState === "error" && (
              <div className="flex items-center gap-3 text-rose-400">
                <span>{copy.loadFailed}</span>
                <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="px-2 py-0.5 rounded border border-rose-500/50 text-[10px] font-bold hover:bg-rose-500/10">
                  {copy.retry}
                </button>
              </div>
            )}
            {loadState === "ready" && lines.length === 0 && <p className="text-slate-500">{copy.noLines}</p>}

            <div role="group" aria-label={copy.listLabel} className="flex flex-col">
              {shown.map((line, idx) => {
                const isSolved = line.id === state.solvedId;
                const isWrong = state.wrongIds.includes(line.id);
                const dimmed = state.solvedId !== null && !isSolved;
                const isLast = idx === shown.length - 1;
                return (
                  <button
                    key={line.id}
                    type="button"
                    ref={(el) => {
                      if (el) rowRefs.current.set(line.id, el);
                      else rowRefs.current.delete(line.id);
                    }}
                    data-line-id={line.id}
                    aria-pressed={isSolved || isWrong}
                    aria-disabled={isWrong || state.solvedId !== null || submitting}
                    tabIndex={line.id === tabStopId ? 0 : -1}
                    onFocus={() => dispatch({ type: "focus", id: line.id })}
                    onClick={() => submit(line)}
                    className={`w-full text-left px-1 py-0.5 rounded border border-transparent transition-[opacity,background-color,border-color] duration-base ${
                      isSolved
                        ? "bg-emerald-500/20 !border-emerald-400"
                        : isWrong
                        ? "bg-rose-500/10 opacity-70"
                        : dimmed
                        ? "opacity-25"
                        : "hover:bg-emerald-500/10 focus-visible:bg-emerald-500/10"
                    } ${isWrong || state.solvedId ? "cursor-default" : "cursor-pointer"} ${shakeId === line.id ? "animate-shake-once" : ""}`}
                  >
                    <span className="text-slate-600 mr-2 tabular-nums">T+{line.tick_offset}</span>
                    <span className={`mr-2 ${LEVEL_COLOR[line.level]}`}>[{line.level}]</span>
                    <span className={isWrong ? "text-slate-500 line-through decoration-rose-500/60" : "text-slate-300"}>
                      {translateLogLine(line.message, language)}
                    </span>
                    {isLast && streaming && <span className="inline-block w-1.5 h-3 bg-emerald-400 ml-0.5 align-middle animate-pulse" />}
                  </button>
                );
              })}
            </div>
            {hiddenByFilter > 0 && <p className="mt-1 text-[10px] text-slate-600">{copy.hiddenByFilter(hiddenByFilter)}</p>}
          </div>
        </div>

        {/* confirmation stamp: overlaid so nothing in the list moves */}
        {state.solvedId && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none px-6 text-center" role="status">
            <div className="rounded-lg bg-black/80 border border-emerald-400/50 px-5 py-4 flex flex-col items-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.25)]">
              <span className="animate-stamp-in inline-block border-4 border-double border-emerald-400 text-emerald-300 px-4 py-1 text-lg font-heading font-bold tracking-widest uppercase rounded">
                {t.logTriage.rootCauseConfirmed}
              </span>
              <p className="text-[11px] text-emerald-200 max-w-md">
                <span className="text-emerald-500 uppercase tracking-wide mr-1">{copy.causeLabel}:</span>
                {cause ?? (solvedLine ? translateLogLine(solvedLine.message, language) : copy.causePending)}
              </p>
              <p className="text-[10px] text-emerald-400/80 max-w-md">{t.logTriage.rewardEarned}</p>
              <p className="text-[10px] text-slate-500">{copy.returning}</p>
            </div>
          </div>
        )}
      </div>

      <ModalFooter className="!justify-between !border-emerald-500/30 !bg-emerald-500/5 min-h-[3.25rem]">
        <p
          role="status"
          aria-live="polite"
          className={`text-[11px] min-w-0 flex-1 ${notice ? "text-rose-300 font-semibold" : "text-slate-500"}`}
        >
          {submitting ? copy.submitting : (notice?.text ?? "")}
        </p>
        <button
          type="button"
          onClick={close}
          className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded transition-colors duration-fast"
        >
          {canGoBack && <ArrowLeft className="w-3.5 h-3.5" />}
          {canGoBack ? t.incidentDetail.backToIncident : t.common.close}
        </button>
      </ModalFooter>
    </Modal>
  );
}
