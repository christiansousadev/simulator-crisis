import { Landmark, ShieldAlert, ShieldCheck } from "lucide-react";
import { memo } from "react";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useTranslation } from "../../i18n/useTranslation";
import { reputationBand, toneFor } from "../../utils/kpiBands";
import DeltaTag from "./DeltaTag";
import MeterShell from "./MeterShell";

interface ReputationMeterProps {
  reputation: number;
}

const ICONS = [ShieldAlert, Landmark, ShieldCheck] as const;

// board-of-directors trust meter, shaped by cumulative CAB dilemma choices across the run
export default memo(function ReputationMeter({ reputation }: ReputationMeterProps) {
  const t = useTranslation();
  const band = reputationBand(reputation);
  const tone = toneFor("reputation", band);
  const ratio = Math.min(1, Math.max(0, reputation / 100));
  const shown = useAnimatedNumber(reputation);

  return (
    <MeterShell
      kpi="reputation"
      icon={ICONS[band]}
      iconClass={tone.text}
      label={t.governance.reputationLabel}
      band={band}
      title={t.governance.reputationTooltip}
    >
      <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full transition-[width] duration-slow ease-out-expo ${tone.bar}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className={`min-w-[1.6rem] text-sm font-bold tabular-nums transition-colors duration-slow ${tone.text}`}>{shown.toFixed(0)}</span>
      <DeltaTag value={reputation} threshold={0.05} format={(r) => `${r > 0 ? "+" : ""}${r.toFixed(1)} / tick`} />
    </MeterShell>
  );
});
