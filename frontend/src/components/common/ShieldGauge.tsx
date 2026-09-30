import { ShieldCheck } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import DeltaTag from "./DeltaTag";

interface ShieldGaugeProps {
  slaPercentage: number;
}

const SEGMENT_COUNT = 16;
// zoom the visible band into the range that actually matters for gameplay
const GAUGE_FLOOR = 95.0;
const GAUGE_CEIL = 100.0;

// maps sla percentage to a color tone matching the three breach tiers
function toneFor(sla: number) {
  if (sla >= 99.9) return { text: "text-emerald-600", bar: "bg-emerald-500" };
  if (sla >= 99.5) return { text: "text-amber-600", bar: "bg-amber-500" };
  return { text: "text-rose-600", bar: "bg-rose-500" };
}

// segmented sla shield meter, zoomed into the 95-100% band where breaches actually happen
export default function ShieldGauge({ slaPercentage }: ShieldGaugeProps) {
  const t = useTranslation();
  const ratio = Math.min(1, Math.max(0, (slaPercentage - GAUGE_FLOOR) / (GAUGE_CEIL - GAUGE_FLOOR)));
  const litSegments = Math.round(ratio * SEGMENT_COUNT);
  const tone = toneFor(slaPercentage);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className={`w-3.5 h-3.5 ${tone.text}`} />
        <span className="hidden hd:inline text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{t.topbar.slaShield}</span>
      </div>
      <div className="relative flex items-center gap-2">
        <div className="flex gap-[2px]">
          {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-3.5 rounded-[1px] transition-colors duration-300 ${
                i < litSegments ? tone.bar : "bg-slate-700"
              }`}
            />
          ))}
        </div>
        <span className={`font-bold text-sm tabular-nums ${tone.text}`}>{slaPercentage.toFixed(2)}%</span>
        <DeltaTag
          value={Math.round(slaPercentage * 10) / 10}
          format={(d) => `${d > 0 ? "+" : ""}${d.toFixed(1)}%`}
          threshold={0.05}
          className="top-0 left-full ml-1"
        />
      </div>
    </div>
  );
}
