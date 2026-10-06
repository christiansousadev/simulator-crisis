// PURE MATH BEHIND THE CAB DECISION COUNTDOWN. The backend auto-resolves a dilemma at
// `expires_at_tick`; everything here is presentation only. The authoritative clock is the tick
// counter, and wall-clock time is used solely to glide the bar between two tick frames.

// backend window (formulas.CAB_DILEMMA_WINDOW_TICKS); used only when the offer tick is unknown
export const DEFAULT_CAB_WINDOW_TICKS = 30;
export const CAB_FINAL_COUNTDOWN_SECONDS = 5;

export type DeadlineTone = "calm" | "warn" | "critical";

export function safeTickRate(tickRateSeconds: number | undefined | null): number {
  return tickRateSeconds && tickRateSeconds > 0 ? tickRateSeconds : 1;
}

export function remainingTicks(expiresAtTick: number, currentTick: number): number {
  return Math.max(0, expiresAtTick - currentTick);
}

// whole seconds shown to the player: rounded UP so "0s" only ever means the window is over.
// The tiny epsilon keeps 3 ticks at 0.1 s/tick from becoming 1 because of float noise.
export function remainingSeconds(ticks: number, tickRateSeconds: number): number {
  if (ticks <= 0) return 0;
  return Math.max(1, Math.ceil(ticks * safeTickRate(tickRateSeconds) - 1e-9));
}

// ticks left including the part of the current tick that has already elapsed in real time. At
// least one tick is always counted as "in progress" while the window is open, and the glide
// never overshoots into the next tick (a late frame simply holds the bar still).
export function smoothRemainingTicks(ticks: number, msSinceTick: number, tickRateSeconds: number, isRunning = true): number {
  if (ticks <= 0) return 0;
  if (!isRunning || msSinceTick <= 0) return ticks;
  const rate = safeTickRate(tickRateSeconds);
  const fraction = Math.min(0.999, msSinceTick / (rate * 1000));
  return Math.max(0, ticks - fraction);
}

export function deadlineFraction(remaining: number, totalTicks: number): number {
  if (totalTicks <= 0) return 0;
  return Math.max(0, Math.min(1, remaining / totalTicks));
}

// blue -> amber -> red; the last seconds are always red regardless of how long the window was
export function deadlineTone(fraction: number, seconds: number): DeadlineTone {
  if (seconds <= CAB_FINAL_COUNTDOWN_SECONDS || fraction <= 0.2) return "critical";
  if (fraction <= 0.5) return "warn";
  return "calm";
}

// one countdown tick per whole second in the final stretch, never twice for the same value
export function shouldCountdownBeep(seconds: number, previousSeconds: number | null): boolean {
  return seconds > 0 && seconds <= CAB_FINAL_COUNTDOWN_SECONDS && seconds !== previousSeconds;
}

export function windowTotalTicks(expiresAtTick: number, offeredAtTick: number | null): number {
  if (offeredAtTick === null) return DEFAULT_CAB_WINDOW_TICKS;
  return Math.max(1, expiresAtTick - offeredAtTick);
}

export interface DilemmaDeltas {
  budget: number;
  techDebt: number;
  morale: number;
  reputation: number;
}

export interface MeterSnapshot {
  budget: number;
  techDebt: number;
  morale: number;
  reputation: number;
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));

// what the meters would read after applying a choice, with the same clamps the engine uses
export function projectMeters(current: MeterSnapshot, d: DilemmaDeltas): MeterSnapshot {
  return {
    budget: current.budget + d.budget,
    techDebt: Math.trunc(clampPct(current.techDebt + d.techDebt)),
    morale: clampPct(current.morale + d.morale),
    reputation: clampPct(current.reputation + d.reputation),
  };
}

export function isFavorable(key: keyof DilemmaDeltas, value: number): boolean {
  return key === "techDebt" ? value < 0 : value > 0;
}

export type DilemmaOutcomeKind = "explicit" | "expired";

// an audit row for the dilemma tells apart the player's own pick from the committee's fallback
export function outcomeFromAudit(details: Record<string, unknown> | undefined | null): {
  kind: DilemmaOutcomeKind;
  choiceId: string | null;
  deltas: DilemmaDeltas;
} | null {
  if (!details) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    kind: details.auto_resolved === true ? "expired" : "explicit",
    choiceId: typeof details.choice_id === "string" ? details.choice_id : null,
    deltas: {
      budget: num(details.budget_delta),
      techDebt: num(details.tech_debt_delta),
      morale: num(details.happiness_delta),
      reputation: num(details.reputation_delta),
    },
  };
}
