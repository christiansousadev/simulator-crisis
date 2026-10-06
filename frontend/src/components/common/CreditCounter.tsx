import { DollarSign } from "lucide-react";
import { memo } from "react";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { budgetBand, toneFor } from "../../utils/kpiBands";
import { formatBurnRate } from "../../utils/kpiEvents";
import MeterShell from "./MeterShell";

interface CreditCounterProps {
  budget: number;
}

// clean digital currency counter for the runway budget, tweening toward each new value rather
// than snapping instantly so a big spend or a passive-burn tick actually reads as a change.
// The text node stays exactly "$212,450" (one element, no abbreviation). Spends show up as chips
// that fly off the counter; the passive burn is a calm "-650/tick" trend beside it.
export default memo(function CreditCounter({ budget }: CreditCounterProps) {
  const t = useTranslation();
  const displayBudget = useAnimatedNumber(budget);
  const trend = useGameStore((s) => s.budgetTrend);
  const band = budgetBand(budget);
  // red is reserved for the alarm (low runway); a healthy balance reads as plain cash green
  const tone = band === 0 ? toneFor("budget", 0) : toneFor("budget", 2);
  const rate = Math.round(trend);

  return (
    <MeterShell kpi="budget" icon={DollarSign} iconClass={tone.text} label={t.topbar.runway} band={band} tour="cash-counter">
      <span className={`text-base font-bold tabular-nums transition-colors duration-slow ${tone.text}`}>
        ${Math.round(displayBudget).toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
      <span
        className={`hidden min-w-[4.25rem] text-caption font-semibold tabular-nums hd:inline ${rate < 0 ? "text-slate-400" : "text-emerald-400"}`}
        title={rate !== 0 ? t.hud.topbar.burnTitle(formatBurnRate(rate, "")) : undefined}
      >
        {rate !== 0 ? formatBurnRate(rate, t.hud.topbar.burnSuffix) : ""}
      </span>
    </MeterShell>
  );
});
