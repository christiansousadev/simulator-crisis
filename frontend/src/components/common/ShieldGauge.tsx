import { ShieldCheck } from "lucide-react";
import { memo } from "react";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useTranslation } from "../../i18n/useTranslation";
import { slaBand, toneFor } from "../../utils/kpiBands";
import DeltaTag from "./DeltaTag";
import MeterShell from "./MeterShell";

interface ShieldGaugeProps {
  slaPercentage: number;
}

const SEGMENT_COUNT = 12;
// zoom the visible band into the range that actually matters for gameplay
const GAUGE_FLOOR = 95.0;
const GAUGE_CEIL = 100.0;
const SEGMENTS = Array.from({ length: SEGMENT_COUNT }, (_, i) => i);

// segmented sla shield meter, zoomed into the 95-100% band where breaches actually happen
export default memo(function ShieldGauge({ slaPercentage }: ShieldGaugeProps) {
  const t = useTranslation();
  const shown = useAnimatedNumber(slaPercentage);
  const ratio = Math.min(1, Math.max(0, (shown - GAUGE_FLOOR) / (GAUGE_CEIL - GAUGE_FLOOR)));
  const litSegments = Math.round(ratio * SEGMENT_COUNT);
  const band = slaBand(slaPercentage);
  const tone = toneFor("sla", band);

  return (
    <MeterShell kpi="sla" icon={ShieldCheck} iconClass={tone.text} label={t.topbar.slaShield} band={band}>
      <div className="flex gap-[2px]" aria-hidden>
        {SEGMENTS.map((i) => (
          <span
            key={i}
            className={`h-3.5 w-1.5 rounded-[1px] transition-colors duration-slow ${i < litSegments ? tone.bar : "bg-slate-700"}`}
          />
        ))}
      </div>
      <span className={`min-w-[3.4rem] text-sm font-bold tabular-nums transition-colors duration-slow ${tone.text}`}>
        {shown.toFixed(2)}%
      </span>
      <DeltaTag value={slaPercentage} threshold={0.01} format={(r) => `${r > 0 ? "+" : ""}${r.toFixed(2)}% / tick`} />
    </MeterShell>
  );
});
