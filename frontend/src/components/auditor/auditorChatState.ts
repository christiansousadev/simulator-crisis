// PURE STATE FOR THE AI-AUDITOR INTERVIEW: reducer, error mapping and money helpers, no react and no fetch.
// The server decides every fine or credit; this file only mirrors what the backend returned.

import { ApiError } from "../../services/api";
import type { AuditorVerdict, InterviewHistoryResponse, InterviewTurnResponse } from "../../services/api";

// mirrors InterviewMessageRequest.max_length on the backend
export const MAX_MESSAGE_LENGTH = 2000;

export interface ChatTurn {
  id: number;
  role: "auditor" | "operator";
  content: string;
}

export type ChatErrorKind = "not_configured" | "rate_limited" | "network" | "other";

export interface ChatError {
  kind: ChatErrorKind;
  // the backend's own message (empty for a network failure)
  message: string;
  retryAfterSeconds: number | null;
}

export type ApplyStatus = "idle" | "applying" | "applied";

export interface AuditorState {
  // the saved transcript lookup has finished (found or not)
  hydrated: boolean;
  turns: ChatTurn[];
  draft: string;
  pending: boolean;
  // the last message that failed to send, kept so retry never needs retyping
  failedMessage: string | null;
  verdict: AuditorVerdict;
  // backend-clamped: positive = fine, negative = credit
  adjustment: number;
  cap: number;
  error: ChatError | null;
  applyStatus: ApplyStatus;
  // the amount the backend actually charged; null when unknown (e.g. applied in an earlier visit)
  appliedAmount: number | null;
  applyError: string | null;
  nextId: number;
}

export type AuditorAction =
  | { type: "hydrate"; history: InterviewHistoryResponse | null }
  | { type: "draft"; value: string }
  | { type: "send"; message: string }
  | { type: "reply"; response: InterviewTurnResponse }
  | { type: "fail"; error: ChatError }
  | { type: "dismissError" }
  | { type: "apply" }
  | { type: "applied"; amount: number | null }
  | { type: "applyFailed"; message: string };

export function initialAuditorState(): AuditorState {
  return {
    hydrated: false,
    turns: [],
    draft: "",
    pending: false,
    failedMessage: null,
    verdict: "PENDING",
    adjustment: 0,
    cap: 0,
    error: null,
    applyStatus: "idle",
    appliedAmount: null,
    applyError: null,
    nextId: 1,
  };
}

export function isFinalVerdict(verdict: AuditorVerdict): boolean {
  return verdict !== "PENDING";
}

// a final verdict with a non-zero backend-eligible amount, not yet applied and not mid-request
export function canApply(state: AuditorState): boolean {
  return (
    isFinalVerdict(state.verdict) &&
    state.adjustment !== 0 &&
    state.applyStatus === "idle" &&
    !state.pending &&
    state.error?.kind !== "not_configured"
  );
}

export function canSend(state: AuditorState): boolean {
  return !state.pending && state.draft.trim().length > 0 && state.draft.length <= MAX_MESSAGE_LENGTH && state.error?.kind !== "not_configured";
}

export function auditorReducer(state: AuditorState, action: AuditorAction): AuditorState {
  switch (action.type) {
    case "hydrate": {
      // a user who already started typing/sending before the history arrived keeps their own state
      if (!action.history || state.turns.length > 0 || state.pending) return { ...state, hydrated: true };
      const h = action.history;
      const turns: ChatTurn[] = h.turns.map((t, i) => ({
        id: i + 1,
        role: t.role === "auditor" ? "auditor" : "operator",
        content: t.content,
      }));
      return {
        ...state,
        hydrated: true,
        turns,
        verdict: h.verdict,
        adjustment: h.regulatory_fine_adjustment,
        cap: h.adjustment_cap ?? Math.abs(h.regulatory_fine_adjustment),
        applyStatus: h.applied ? "applied" : "idle",
        nextId: turns.length + 1,
      };
    }
    case "draft":
      return { ...state, draft: action.value.slice(0, MAX_MESSAGE_LENGTH) };
    case "send": {
      const message = action.message.trim();
      if (state.pending || !message || message.length > MAX_MESSAGE_LENGTH) return state;
      return {
        ...state,
        pending: true,
        error: null,
        failedMessage: message,
        // clear the box only when it still holds what is being sent
        draft: state.draft.trim() === message ? "" : state.draft,
        turns: [...state.turns, { id: state.nextId, role: "operator", content: message }],
        nextId: state.nextId + 1,
      };
    }
    case "reply": {
      if (!state.pending) return state;
      const r = action.response;
      return {
        ...state,
        pending: false,
        failedMessage: null,
        error: null,
        turns: [...state.turns, { id: state.nextId, role: "auditor", content: r.reply }],
        nextId: state.nextId + 1,
        verdict: r.verdict,
        adjustment: r.regulatory_fine_adjustment,
        cap: r.adjustment_cap ?? Math.abs(r.regulatory_fine_adjustment),
        // one application per incident: once applied it stays applied whatever the next verdict says
        applyStatus: r.applied || state.applyStatus === "applied" ? "applied" : "idle",
        applyError: null,
      };
    }
    case "fail": {
      if (!state.pending) return state;
      const last = state.turns[state.turns.length - 1];
      const optimistic = last && last.role === "operator" && last.content === state.failedMessage;
      return {
        ...state,
        pending: false,
        error: action.error,
        turns: optimistic ? state.turns.slice(0, -1) : state.turns,
        // never lose what was typed: put it back unless a newer draft is already there
        draft: state.draft === "" && state.failedMessage ? state.failedMessage : state.draft,
      };
    }
    case "dismissError":
      return { ...state, error: null };
    case "apply":
      return canApply(state) ? { ...state, applyStatus: "applying", applyError: null } : state;
    case "applied":
      return { ...state, applyStatus: "applied", appliedAmount: action.amount, applyError: null };
    case "applyFailed":
      return { ...state, applyStatus: "idle", applyError: action.message };
    default:
      return state;
  }
}

export function classifyChatError(err: unknown): ChatError {
  if (err instanceof ApiError) {
    if (err.status === 503) return { kind: "not_configured", message: err.message, retryAfterSeconds: null };
    if (err.status === 429) return { kind: "rate_limited", message: err.message, retryAfterSeconds: err.retryAfterSeconds };
    return { kind: "other", message: err.message, retryAfterSeconds: null };
  }
  // fetch() rejects with a TypeError when the server is unreachable
  return { kind: "network", message: "", retryAfterSeconds: null };
}

// the backend answers 400 "...has already been applied" when the one allowed application was used
export function isAlreadyApplied(err: unknown): boolean {
  return err instanceof ApiError && err.status === 400 && /already been applied/i.test(err.message);
}

export function formatUsd(amount: number): string {
  return `US$${Math.round(Math.abs(amount)).toLocaleString("en-US")}`;
}

export type AdjustmentKind = "none" | "credit" | "fine";

export function adjustmentKind(adjustment: number): AdjustmentKind {
  if (adjustment < 0) return "credit";
  if (adjustment > 0) return "fine";
  return "none";
}
