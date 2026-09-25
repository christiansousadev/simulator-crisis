import { Gauge } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";

interface ErrorBudgetMeterProps {
  remainingRatio: number;
  frozen: boolean;
}

// maps remaining ratio to a color tone matching the three depletion tiers
function toneFor(ratio: number) {
  if (ratio > 0.5) return { text: "text-emerald-600", bar: "bg-emerald-500" };
  if (ratio > 0.1) return { text: "text-amber-600", bar: "bg-amber-500" };
  return { text: "text-rose-600", bar: "bg-rose-500" };
}

// GUARD AGAINST NaN/NULL/UNDEFINED/INFINITE INPUT, DEFAULTING TO A FULL (SAFE) BUDGET
function safeRatio(value: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return 1.0;
  return Math.max(0, Math.min(1, value));
}

// horizontal burn-down bar for the sre error budget, with a feature freeze badge overlay
export default function ErrorBudgetMeter({ remainingRatio, frozen }: ErrorBudgetMeterProps) {
  const t = useTranslation();
  const clamped = safeRatio(remainingRatio);
  const tone = toneFor(clamped);
  // belt-and-suspenders: never let a stray NaN reach the formatted label, even if clamping above changes
  const pct = Number.isFinite(clamped * 100) ? clamped * 100 : 100;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Gauge className={`w-3.5 h-3.5 ${tone.text}`} />
        <span className="hidden hd:inline text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{t.errorBudget.label}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${tone.bar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`font-bold text-sm tabular-nums ${tone.text} hd:hidden`}>{pct.toFixed(0)}%</span>
        <span className={`font-bold text-sm tabular-nums ${tone.text} hidden hd:inline`}>{t.errorBudget.remaining(pct)}</span>
        {frozen && (
          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[9px] font-bold uppercase tracking-wide animate-pulse">
            {t.errorBudget.featureFreezeActive}
          </span>
        )}
      </div>
    </div>
  );
}
