import { AlertTriangle, Check, KeyRound, RotateCcw, Scale, Send } from "lucide-react";
import { KeyboardEvent, useCallback, useEffect, useReducer, useRef } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import type { AuditorVerdict } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { playErrorSound, playStampSound, playSuccessSound, playUiConfirmSound } from "../../utils/sound";
import {
  adjustmentKind,
  auditorReducer,
  canApply,
  canSend,
  classifyChatError,
  formatUsd,
  initialAuditorState,
  isAlreadyApplied,
  isFinalVerdict,
  MAX_MESSAGE_LENGTH,
} from "./auditorChatState";

const CHIP_STYLE: Record<AuditorVerdict, string> = {
  PENDING: "bg-slate-800 border-slate-600 text-slate-300",
  VALID: "bg-emerald-500/15 border-emerald-500/60 text-emerald-300",
  JUSTIFIED: "bg-emerald-500/15 border-emerald-500/60 text-emerald-300",
  NON_COMPLIANT: "bg-rose-500/15 border-rose-500/60 text-rose-300",
};

function TypingIndicator({ label, reduced }: { label: string; reduced: boolean }) {
  return (
    <div role="status" className="flex items-center gap-2 text-[11px] text-slate-400">
      <span>{label}</span>
      {reduced ? (
        <span aria-hidden="true">…</span>
      ) : (
        <span className="flex gap-1" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </span>
      )}
    </div>
  );
}

// the interview with the AI compliance auditor. the backend owns every number shown here: the
// proposed adjustment is the backend-clamped preview, the applied amount comes from apply-verdict
export default function AuditorChat({ incidentId }: { incidentId: string }) {
  const copy = useTranslation().auditorChat;
  const reduced = useReducedMotion();
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const [state, dispatch] = useReducer(auditorReducer, undefined, initialAuditorState);
  const logRef = useRef<HTMLDivElement>(null);

  // resume a saved interview; a 404 (none yet) or any failure just means a fresh conversation
  useEffect(() => {
    let cancelled = false;
    api
      .getInterview(incidentId)
      .then((history) => !cancelled && dispatch({ type: "hydrate", history }))
      .catch(() => !cancelled && dispatch({ type: "hydrate", history: null }));
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  // keep the newest bubble in view (instant: smooth scrolling is motion)
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.turns.length, state.pending]);

  const send = useCallback(
    async (override?: string) => {
      const message = (override ?? state.draft).trim();
      if (state.pending || !message || message.length > MAX_MESSAGE_LENGTH) return;
      dispatch({ type: "send", message });
      playUiConfirmSound();
      try {
        const response = await api.conductInterview(incidentId, message);
        dispatch({ type: "reply", response });
        if (isFinalVerdict(response.verdict)) playStampSound();
      } catch (err) {
        dispatch({ type: "fail", error: classifyChatError(err) });
      }
    },
    [incidentId, state.draft, state.pending]
  );

  const apply = async () => {
    if (!canApply(state)) return;
    dispatch({ type: "apply" });
    try {
      const response = await api.applyInterviewVerdict(incidentId);
      // the amount the backend actually charged, never the LLM's proposal
      const amount = typeof response.applied_amount === "number" ? response.applied_amount : null;
      dispatch({ type: "applied", amount });
      const kind = amount === null ? "none" : adjustmentKind(amount);
      if (kind === "fine") {
        playErrorSound();
        pushFloatingText(copy.appliedToastFine(formatUsd(amount ?? 0)), "danger");
      } else if (kind === "credit") {
        playSuccessSound();
        pushFloatingText(copy.appliedToastCredit(formatUsd(amount ?? 0)), "success");
      } else {
        pushFloatingText(copy.appliedToastUnknown, "info");
      }
    } catch (err) {
      if (isAlreadyApplied(err)) dispatch({ type: "applied", amount: null });
      else dispatch({ type: "applyFailed", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  };

  const { error } = state;
  const notConfigured = error?.kind === "not_configured";
  const kind = adjustmentKind(state.adjustment);
  const proposed =
    kind === "credit"
      ? copy.proposedCredit(formatUsd(state.adjustment), formatUsd(state.cap))
      : kind === "fine"
        ? copy.proposedFine(formatUsd(state.adjustment), formatUsd(state.cap))
        : copy.proposedNone;
  const appliedKind = state.appliedAmount === null ? "none" : adjustmentKind(state.appliedAmount);
  const appliedText =
    appliedKind === "fine"
      ? copy.appliedFine(formatUsd(state.appliedAmount ?? 0))
      : appliedKind === "credit"
        ? copy.appliedCredit(formatUsd(state.appliedAmount ?? 0))
        : copy.appliedUnknown;
  const applyEnabled = canApply(state);
  const used = state.draft.length;

  return (
    <div className="flex flex-col gap-4 px-6 py-5" data-testid="auditor-chat">
      <div className="flex items-start gap-3">
        <Scale className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-bold font-heading tracking-wide text-white">{copy.heading}</h3>
          <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{copy.intro}</p>
        </div>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label={copy.logLabel}
        aria-busy={!state.hydrated}
        className="flex flex-col gap-2.5 min-h-[10rem] max-h-[40vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/70 p-3"
      >
        {!state.hydrated && state.turns.length === 0 && <p className="text-xs text-slate-500">{copy.loadingHistory}</p>}
        {state.hydrated && state.turns.length === 0 && !state.pending && <p className="text-xs text-slate-500">{copy.emptyChat}</p>}
        {state.turns.map((turn) => {
          const auditor = turn.role === "auditor";
          return (
            <div key={turn.id} className={`flex flex-col max-w-[85%] animate-item-in ${auditor ? "self-start items-start" : "self-end items-end"}`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${auditor ? "text-amber-400" : "text-cyan-400"}`}>
                {auditor ? copy.auditorName : copy.operatorName}
              </span>
              <p
                className={`px-3 py-2 rounded-lg border text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
                  auditor ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-cyan-950/50 border-cyan-800/60 text-cyan-50"
                }`}
              >
                {turn.content}
              </p>
            </div>
          );
        })}
        {state.pending && (
          <div className="self-start px-3 py-2 rounded-lg border border-slate-700 bg-slate-800/70">
            <TypingIndicator label={copy.typing} reduced={reduced} />
          </div>
        )}
      </div>

      {notConfigured && (
        <div role="status" className="rounded-lg border border-slate-700 bg-slate-800/50 p-4 flex gap-3">
          <KeyRound className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1.5">
            <p className="text-sm font-bold text-slate-100">{copy.notConfiguredTitle}</p>
            <p className="text-xs text-slate-400 leading-relaxed">{copy.notConfiguredBody}</p>
            <p className="text-xs text-slate-300 leading-relaxed">{copy.notConfiguredHowTo}</p>
          </div>
        </div>
      )}

      {error && !notConfigured && (
        <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs text-amber-100 leading-relaxed">
              {error.kind === "rate_limited"
                ? error.retryAfterSeconds
                  ? copy.rateLimitedIn(error.retryAfterSeconds)
                  : copy.rateLimited
                : error.kind === "network"
                  ? copy.networkError
                  : copy.genericError(error.message)}
            </p>
            <p className="text-[11px] text-amber-200/70">{copy.keptMessage}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {state.failedMessage && (
              <button
                type="button"
                onClick={() => void send(state.failedMessage ?? undefined)}
                disabled={state.pending}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-[11px] font-bold transition-colors duration-fast"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
                {copy.retry}
              </button>
            )}
            <button
              type="button"
              onClick={() => dispatch({ type: "dismissError" })}
              className="px-2 py-1 rounded-md text-amber-200 hover:text-white text-[11px] font-bold transition-colors duration-fast"
            >
              {copy.dismiss}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">{copy.verdictLabel}</span>
          <span
            data-testid="auditor-verdict"
            data-verdict={state.verdict}
            className={`px-3 py-1 rounded-full border text-xs font-bold font-heading tracking-wider uppercase ${CHIP_STYLE[state.verdict]}`}
          >
            {copy.verdicts[state.verdict]}
          </span>
          <span data-testid="auditor-proposed" className="text-xs font-mono text-slate-200">
            {proposed}
          </span>
          <div className="ml-auto">
            <button
              type="button"
              onClick={apply}
              disabled={!applyEnabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-colors duration-fast disabled:cursor-not-allowed ${
                state.applyStatus === "applied"
                  ? "bg-emerald-500/15 border border-emerald-500/50 text-emerald-300"
                  : "bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:bg-slate-800 disabled:text-slate-500"
              }`}
            >
              {state.applyStatus === "applied" && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
              {state.applyStatus === "applied" ? copy.applied : state.applyStatus === "applying" ? copy.applying : copy.apply}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">{copy.verdictHints[state.verdict]}</p>
        {state.applyStatus === "applied" ? (
          <p role="status" className="text-[11px] font-bold text-emerald-300">
            {appliedText}
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">{copy.applyHint}</p>
        )}
        {state.applyError && (
          <p role="alert" className="text-[11px] text-rose-300">
            {copy.applyFailed(state.applyError)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="auditor-input" className="sr-only">
          {copy.inputLabel}
        </label>
        <textarea
          id="auditor-input"
          value={state.draft}
          onChange={(e) => dispatch({ type: "draft", value: e.target.value })}
          onKeyDown={onKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={3}
          disabled={notConfigured}
          placeholder={copy.placeholder}
          className="w-full resize-y rounded-lg bg-slate-950 border border-slate-700 focus:border-cyan-500 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-slate-500">{copy.shortcutHint}</span>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-mono ${used >= MAX_MESSAGE_LENGTH ? "text-rose-400" : "text-slate-500"}`}>
              {copy.counter(used, MAX_MESSAGE_LENGTH)}
            </span>
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend(state)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-slate-950 text-[11px] font-bold transition-colors duration-fast"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              {state.pending ? copy.sending : copy.send}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
