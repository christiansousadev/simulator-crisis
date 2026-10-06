import { Wrench } from "lucide-react";
import { memo } from "react";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useTranslation } from "../../i18n/useTranslation";
import { techDebtBand, toneFor } from "../../utils/kpiBands";
import DeltaTag from "./DeltaTag";
import MeterShell from "./MeterShell";

interface TechDebtMeterProps {
  techDebt: number;
}

// office stress / messy-code meter standing in for the technical debt index
export default memo(function TechDebtMeter({ techDebt }: TechDebtMeterProps) {
  const t = useTranslation();
  const band = techDebtBand(techDebt);
  const tone = toneFor("techDebt", band);
  const ratio = Math.min(1, Math.max(0, techDebt / 100));
  const shown = useAnimatedNumber(techDebt);

  return (
    <MeterShell kpi="techDebt" icon={Wrench} iconClass={tone.text} label={t.topbar.techDebt} band={band}>
      <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full transition-[width] duration-slow ease-out-expo ${tone.bar}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className={`min-w-[1.6rem] text-sm font-bold tabular-nums transition-colors duration-slow ${tone.text}`}>{Math.round(shown)}</span>
      <DeltaTag value={techDebt} invert format={(r) => `${r > 0 ? "+" : ""}${r.toFixed(1)} / tick`} />
    </MeterShell>
  );
});
