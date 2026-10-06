import { KpiId, risingIsGood } from "./kpiBands";

// a short-lived labelled chip ("-$1,800 · Rollback") that flies off the meter it belongs to.
// several quick changes to the same kpi are merged into one chip so 5x speed stays readable.
export interface KpiEvent {
  id: string;
  kpi: KpiId;
  amount: number;
  label: string;
  // how many raw changes were folded into this chip
  count: number;
  // bumped on every merge so the chip can restart its fly animation
  rev: number;
  createdAt: number;
  updatedAt: number;
}

export interface KpiEventInput {
  kpi: KpiId;
  amount: number;
  label?: string;
}

export const KPI_MERGE_WINDOW_MS = 700;
export const KPI_EVENT_LIMIT = 12;
// how long a chip stays mounted after its latest update (matches animate-kpi-chip-fly)
export const KPI_CHIP_LIFETIME_MS = 1400;

// FOLD AN INCOMING CHANGE INTO THE LIST: MERGES INTO THE NEWEST CHIP OF THE SAME KPI THAT WAS
// UPDATED WITHIN THE MERGE WINDOW, OTHERWISE STARTS A NEW ONE. pure, so it is unit-testable.
export function mergeKpiEvent(
  events: KpiEvent[],
  input: KpiEventInput,
  now: number,
  makeId: () => string,
  windowMs = KPI_MERGE_WINDOW_MS
): KpiEvent[] {
  if (!Number.isFinite(input.amount) || input.amount === 0) return events;
  const label = input.label ?? "";

  let targetIdx = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kpi === input.kpi) {
      if (now - events[i].updatedAt <= windowMs) targetIdx = i;
      break;
    }
  }

  if (targetIdx === -1) {
    const created: KpiEvent = {
      id: makeId(),
      kpi: input.kpi,
      amount: input.amount,
      label,
      count: 1,
      rev: 0,
      createdAt: now,
      updatedAt: now,
    };
    return [...events, created].slice(-KPI_EVENT_LIMIT);
  }

  const prev = events[targetIdx];
  const amount = prev.amount + input.amount;
  // a +x and -x that cancel out leave nothing worth showing
  if (Math.abs(amount) < 1e-9) return events.filter((_, i) => i !== targetIdx);
  const merged: KpiEvent = {
    ...prev,
    amount,
    // keep the label of whichever contribution moved the kpi the most
    label: Math.abs(input.amount) > Math.abs(prev.amount) && label ? label : prev.label || label,
    count: prev.count + 1,
    rev: prev.rev + 1,
    updatedAt: now,
  };
  return events.map((e, i) => (i === targetIdx ? merged : e));
}

// UNICODE MINUS SO THE SIGN LINES UP WITH THE DIGITS
function signed(amount: number): string {
  return amount < 0 ? "−" : "+";
}

// COMPACT AMOUNT TEXT PER KPI: "-$1,800", "+3 TDI", "-0.4%"
export function formatKpiAmount(kpi: KpiId, amount: number): string {
  const abs = Math.abs(amount);
  switch (kpi) {
    case "budget":
      return `${signed(amount)}$${Math.round(abs).toLocaleString()}`;
    case "sla":
      return `${signed(amount)}${abs.toFixed(2)}%`;
    case "errorBudget":
      return `${signed(amount)}${Math.round(abs)}%`;
    case "techDebt":
      return `${signed(amount)}${Math.round(abs)} TDI`;
    case "morale":
    case "reputation":
      return `${signed(amount)}${Math.round(abs)}`;
  }
}

export function kpiEventIsGood(kpi: KpiId, amount: number): boolean {
  return risingIsGood(kpi) ? amount > 0 : amount < 0;
}

// full chip text: amount, then the cause when there is one
export function formatKpiChip(event: Pick<KpiEvent, "kpi" | "amount" | "label" | "count">): string {
  const base = formatKpiAmount(event.kpi, event.amount);
  const label = event.label ? ` · ${event.label}` : "";
  const merged = event.count > 1 ? ` ×${event.count}` : "";
  return `${base}${label}${merged}`;
}

// PER-TICK CASH TREND TEXT, e.g. "-650/tick" (calm indicator in place of a chip per tick)
export function formatBurnRate(perTick: number, suffix: string): string {
  const abs = Math.round(Math.abs(perTick));
  return `${perTick < 0 ? "−" : "+"}${abs.toLocaleString()}${suffix}`;
}
