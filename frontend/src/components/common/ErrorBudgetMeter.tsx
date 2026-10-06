import { Gauge, Snowflake } from "lucide-react";
import { memo } from "react";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useTranslation } from "../../i18n/useTranslation";
import { errorBudgetBand, toneFor } from "../../utils/kpiBands";
import DeltaTag from "./DeltaTag";
import MeterShell from "./MeterShell";

interface ErrorBudgetMeterProps {
  remainingRatio: number;
  frozen: boolean;
}

// GUARD AGAINST NaN/NULL/UNDEFINED/INFINITE INPUT, DEFAULTING TO A FULL (SAFE) BUDGET
function safeRatio(value: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return 1.0;
  return Math.max(0, Math.min(1, value));
}

// horizontal burn-down bar for the sre error budget. A feature freeze swaps the icon for a snowflake
// and shows a badge in a reserved slot, so the meter never changes width when the freeze toggles
// (the old inline badge made the whole centered kpi cluster re-center).
export default memo(function ErrorBudgetMeter({ remainingRatio, frozen }: ErrorBudgetMeterProps) {
  const t = useTranslation();
  const clamped = safeRatio(remainingRatio);
  const band = errorBudgetBand(clamped);
  const tone = toneFor("errorBudget", band);
  const pct = clamped * 100;
  const shownPct = useAnimatedNumber(pct);

  return (
    <MeterShell
      kpi="errorBudget"
      icon={frozen ? Snowflake : Gauge}
      iconClass={frozen ? "text-rose-400" : tone.text}
      label={t.errorBudget.label}
      band={band}
      className="w-[9rem]"
    >
      <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full transition-[width] duration-slow ease-out-expo ${tone.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`min-w-[2.2rem] text-sm font-bold tabular-nums transition-colors duration-slow ${tone.text}`}>{shownPct.toFixed(0)}%</span>
      <DeltaTag value={Math.round(pct)} format={(r) => `${r > 0 ? "+" : ""}${r.toFixed(1)}% / tick`} />
      {frozen && (
        <span
          title={t.hud.topbar.freezeTitle}
          className="absolute -top-0.5 right-0 rounded bg-rose-500/20 px-1.5 py-0.5 text-micro font-bold uppercase leading-none tracking-wide text-rose-300 animate-badge-bump"
        >
          {t.hud.topbar.freeze}
        </span>
      )}
    </MeterShell>
  );
});
