import { describe, expect, it } from "vitest";
import { ApiError } from "../../services/api";
import type { InterviewHistoryResponse, InterviewTurnResponse } from "../../services/api";
import {
  adjustmentKind,
  auditorReducer,
  canApply,
  canSend,
  classifyChatError,
  formatUsd,
  initialAuditorState,
  isAlreadyApplied,
  MAX_MESSAGE_LENGTH,
} from "./auditorChatState";
import type { AuditorAction, AuditorState } from "./auditorChatState";

const run = (actions: AuditorAction[], from: AuditorState = initialAuditorState()) => actions.reduce(auditorReducer, from);

const reply = (over: Partial<InterviewTurnResponse> = {}): InterviewTurnResponse => ({
  incident_id: "inc-1",
  reply: "Why did you wait?",
  verdict: "PENDING",
  regulatory_fine_adjustment: 0,
  adjustment_cap: 0,
  transcript_turn: 1,
  ...over,
});

describe("auditorReducer message flow", () => {
  it("sends a trimmed message, shows it at once, clears the draft and goes pending", () => {
    const s = run([{ type: "draft", value: "  I rolled back  " }, { type: "send", message: "  I rolled back  " }]);
    expect(s.pending).toBe(true);
    expect(s.draft).toBe("");
    expect(s.turns).toEqual([{ id: 1, role: "operator", content: "I rolled back" }]);
    expect(canSend(s)).toBe(false);
  });

  it("ignores empty, whitespace-only, oversized and concurrent sends", () => {
    const base = initialAuditorState();
    expect(auditorReducer(base, { type: "send", message: "   " })).toBe(base);
    expect(auditorReducer(base, { type: "send", message: "x".repeat(MAX_MESSAGE_LENGTH + 1) })).toBe(base);
    const pending = run([{ type: "send", message: "one" }]);
    expect(auditorReducer(pending, { type: "send", message: "two" })).toBe(pending);
  });

  it("canSend needs non-blank text within the bound", () => {
    expect(canSend({ ...initialAuditorState(), draft: "   " })).toBe(false);
    expect(canSend({ ...initialAuditorState(), draft: "ok" })).toBe(true);
    expect(canSend({ ...initialAuditorState(), draft: "x".repeat(MAX_MESSAGE_LENGTH + 1) })).toBe(false);
  });

  it("clamps the draft to the backend length bound", () => {
    const s = auditorReducer(initialAuditorState(), { type: "draft", value: "y".repeat(MAX_MESSAGE_LENGTH + 50) });
    expect(s.draft).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it("appends the auditor reply and stores the backend verdict and preview", () => {
    const s = run([
      { type: "send", message: "hello" },
      { type: "reply", response: reply({ verdict: "NON_COMPLIANT", regulatory_fine_adjustment: 3000, adjustment_cap: 6000 }) },
    ]);
    expect(s.pending).toBe(false);
    expect(s.turns.map((t) => t.role)).toEqual(["operator", "auditor"]);
    expect(s.verdict).toBe("NON_COMPLIANT");
    expect(s.adjustment).toBe(3000);
    expect(s.cap).toBe(6000);
    expect(canApply(s)).toBe(true);
  });

  it("drops a stray reply that arrives while nothing is pending", () => {
    const base = initialAuditorState();
    expect(auditorReducer(base, { type: "reply", response: reply() })).toBe(base);
  });
});

describe("auditorReducer errors never lose the typed message", () => {
  it("removes the optimistic bubble and restores the draft on failure", () => {
    const s = run([
      { type: "draft", value: "my answer" },
      { type: "send", message: "my answer" },
      { type: "fail", error: classifyChatError(new TypeError("Failed to fetch")) },
    ]);
    expect(s.pending).toBe(false);
    expect(s.turns).toHaveLength(0);
    expect(s.draft).toBe("my answer");
    expect(s.failedMessage).toBe("my answer");
    expect(s.error?.kind).toBe("network");
  });

  it("keeps a newer draft instead of overwriting it", () => {
    const s = run([
      { type: "send", message: "first" },
      { type: "draft", value: "second" },
      { type: "fail", error: { kind: "other", message: "boom", retryAfterSeconds: null } },
    ]);
    expect(s.draft).toBe("second");
    expect(s.failedMessage).toBe("first");
  });

  it("a successful retry clears the error and the kept message", () => {
    const s = run([
      { type: "send", message: "again" },
      { type: "fail", error: { kind: "network", message: "", retryAfterSeconds: null } },
      { type: "send", message: "again" },
      { type: "reply", response: reply() },
    ]);
    expect(s.error).toBeNull();
    expect(s.failedMessage).toBeNull();
    expect(s.draft).toBe("");
    expect(s.turns.map((t) => t.content)).toEqual(["again", "Why did you wait?"]);
  });

  it("dismissError clears only the banner", () => {
    const s = run([
      { type: "send", message: "x" },
      { type: "fail", error: { kind: "other", message: "boom", retryAfterSeconds: null } },
      { type: "dismissError" },
    ]);
    expect(s.error).toBeNull();
    expect(s.draft).toBe("x");
  });
});

describe("classifyChatError", () => {
  it("maps 503 to not_configured, 429 to rate_limited with retry-after, other statuses and network", () => {
    expect(classifyChatError(new ApiError("AI Auditor interview service is not configured", 503)).kind).toBe("not_configured");
    const limited = classifyChatError(new ApiError("Too many", 429, 42));
    expect(limited).toMatchObject({ kind: "rate_limited", retryAfterSeconds: 42 });
    expect(classifyChatError(new ApiError("Incident not found", 404))).toMatchObject({ kind: "other", message: "Incident not found" });
    expect(classifyChatError(new TypeError("Failed to fetch")).kind).toBe("network");
  });

  it("a 503 disables sending and applying", () => {
    const s = run([
      { type: "draft", value: "hi" },
      { type: "send", message: "hi" },
      { type: "fail", error: classifyChatError(new ApiError("not configured", 503)) },
    ]);
    expect(s.draft).toBe("hi");
    expect(canSend(s)).toBe(false);
  });
});

describe("apply states", () => {
  const final = () =>
    run([
      { type: "send", message: "defense" },
      { type: "reply", response: reply({ verdict: "JUSTIFIED", regulatory_fine_adjustment: -1500, adjustment_cap: 2000 }) },
    ]);

  it("is only enabled for a final verdict with a non-zero amount", () => {
    expect(canApply(initialAuditorState())).toBe(false);
    const pendingVerdict = run([{ type: "send", message: "a" }, { type: "reply", response: reply() }]);
    expect(canApply(pendingVerdict)).toBe(false);
    const zero = run([{ type: "send", message: "a" }, { type: "reply", response: reply({ verdict: "VALID", regulatory_fine_adjustment: 0 }) }]);
    expect(canApply(zero)).toBe(false);
    expect(canApply(final())).toBe(true);
  });

  it("walks idle -> applying -> applied and records the backend amount", () => {
    const applying = auditorReducer(final(), { type: "apply" });
    expect(applying.applyStatus).toBe("applying");
    expect(canApply(applying)).toBe(false);
    const done = auditorReducer(applying, { type: "applied", amount: -1500 });
    expect(done.applyStatus).toBe("applied");
    expect(done.appliedAmount).toBe(-1500);
  });

  it("applyFailed returns to idle with the backend message so it can be retried", () => {
    const s = run([{ type: "apply" }, { type: "applyFailed", message: "This incident belongs to a different session" }], final());
    expect(s.applyStatus).toBe("idle");
    expect(s.applyError).toMatch(/different session/);
    expect(canApply(s)).toBe(true);
  });

  it("stays applied after a later reply (one application per incident)", () => {
    const applied = run([{ type: "apply" }, { type: "applied", amount: null }], final());
    const next = run([{ type: "send", message: "more" }, { type: "reply", response: reply({ verdict: "NON_COMPLIANT", regulatory_fine_adjustment: 500 }) }], applied);
    expect(next.applyStatus).toBe("applied");
    expect(canApply(next)).toBe(false);
  });

  it("recognises the backend's already-applied rejection", () => {
    expect(isAlreadyApplied(new ApiError("This interview verdict has already been applied", 400))).toBe(true);
    expect(isAlreadyApplied(new ApiError("This incident belongs to a different session", 400))).toBe(false);
    expect(isAlreadyApplied(new Error("already been applied"))).toBe(false);
  });
});

describe("hydrate", () => {
  const history: InterviewHistoryResponse = {
    incident_id: "inc-1",
    turns: [
      { role: "player", content: "q1" },
      { role: "auditor", content: "a1" },
    ],
    verdict: "NON_COMPLIANT",
    regulatory_fine_adjustment: 3000,
    adjustment_cap: 3000,
    applied: true,
    transcript_turn: 1,
  };

  it("restores turns, verdict and the applied flag", () => {
    const s = auditorReducer(initialAuditorState(), { type: "hydrate", history });
    expect(s.hydrated).toBe(true);
    expect(s.turns.map((t) => t.role)).toEqual(["operator", "auditor"]);
    expect(s.verdict).toBe("NON_COMPLIANT");
    expect(s.applyStatus).toBe("applied");
    expect(canApply(s)).toBe(false);
  });

  it("a missing history just marks the lookup finished", () => {
    const s = auditorReducer(initialAuditorState(), { type: "hydrate", history: null });
    expect(s.hydrated).toBe(true);
    expect(s.turns).toHaveLength(0);
  });

  it("does not clobber a conversation that already started", () => {
    const started = run([{ type: "send", message: "mine" }]);
    const s = auditorReducer(started, { type: "hydrate", history });
    expect(s.turns).toHaveLength(1);
    expect(s.pending).toBe(true);
  });
});

describe("money helpers", () => {
  it("formats magnitudes as US$ and classifies the sign", () => {
    expect(formatUsd(-1500)).toBe("US$1,500");
    expect(formatUsd(3000.4)).toBe("US$3,000");
    expect(adjustmentKind(-1)).toBe("credit");
    expect(adjustmentKind(1)).toBe("fine");
    expect(adjustmentKind(0)).toBe("none");
  });
});
