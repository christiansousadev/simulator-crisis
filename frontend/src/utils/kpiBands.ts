// shared KPI vocabulary for the hud: ids, the band each value sits in, and the tone classes that
// band maps to. the meters, the topbar status dots and the store's band-crossing logic all read
// the same thresholds from here so they can never disagree about "amber" or "rose".

export type KpiId = "budget" | "sla" | "errorBudget" | "techDebt" | "morale" | "reputation";

// 0 = worst, 1 = middle, 2 = best
export type KpiBand = 0 | 1 | 2;

export interface KpiTone {
  text: string;
  bar: string;
  dot: string;
}

const GOOD: KpiTone = { text: "text-emerald-400", bar: "bg-emerald-500", dot: "bg-emerald-400" };
const NEUTRAL: KpiTone = { text: "text-sky-400", bar: "bg-sky-500", dot: "bg-sky-400" };
const WARN: KpiTone = { text: "text-amber-400", bar: "bg-amber-500", dot: "bg-amber-400" };
const BAD: KpiTone = { text: "text-rose-400", bar: "bg-rose-500", dot: "bg-rose-400" };

// LOW RUNWAY BELOW THIS FLIPS THE CASH COUNTER INTO ITS ALARM TONE
export const LOW_RUNWAY_THRESHOLD = 20000;

// sla thresholds mirror the three breach tiers the shield gauge draws
export function slaBand(sla: number): KpiBand {
  if (sla >= 99.9) return 2;
  if (sla >= 99.5) return 1;
  return 0;
}

// error budget is a remaining ratio (0..1)
export function errorBudgetBand(ratio: number): KpiBand {
  if (ratio > 0.5) return 2;
  if (ratio > 0.1) return 1;
  return 0;
}

// tech debt: lower is better
export function techDebtBand(tdi: number): KpiBand {
  if (tdi >= 70) return 0;
  if (tdi >= 40) return 1;
  return 2;
}

export function moraleBand(happiness: number): KpiBand {
  if (happiness >= 70) return 2;
  if (happiness >= 40) return 1;
  return 0;
}

export function reputationBand(reputation: number): KpiBand {
  if (reputation >= 75) return 2;
  if (reputation >= 25) return 1;
  return 0;
}

export function budgetBand(budget: number): KpiBand {
  return budget < LOW_RUNWAY_THRESHOLD ? 0 : 2;
}

export function bandOf(kpi: KpiId, value: number): KpiBand {
  switch (kpi) {
    case "budget":
      return budgetBand(value);
    case "sla":
      return slaBand(value);
    case "errorBudget":
      return errorBudgetBand(value);
    case "techDebt":
      return techDebtBand(value);
    case "morale":
      return moraleBand(value);
    case "reputation":
      return reputationBand(value);
  }
}

// tdi and reputation keep a calm blue as their "fine" tone; everything else goes green when fine
export function toneFor(kpi: KpiId, band: KpiBand): KpiTone {
  if (band === 0) return BAD;
  if (band === 1) return kpi === "reputation" ? NEUTRAL : WARN;
  return kpi === "techDebt" ? NEUTRAL : GOOD;
}

// for deltas: is a positive change good news for this kpi?
export function risingIsGood(kpi: KpiId): boolean {
  return kpi !== "techDebt";
}

// an engineer at or above this stress reads as "needs a break" (roster alert + dock badge)
export const HIGH_STRESS_THRESHOLD = 75;
