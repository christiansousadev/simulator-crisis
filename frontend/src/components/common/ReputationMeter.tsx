import { Landmark, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";

interface ReputationMeterProps {
  reputation: number;
}

// pick an icon and tone matching the current governance-reputation band
function reputationTone(reputation: number) {
  if (reputation >= 75) return { icon: ShieldCheck, text: "text-emerald-400", bar: "bg-emerald-500" };
  if (reputation >= 25) return { icon: Landmark, text: "text-sky-400", bar: "bg-sky-500" };
  return { icon: ShieldAlert, text: "text-rose-400", bar: "bg-rose-500" };
}

// board-of-directors trust meter, shaped by cumulative CAB dilemma choices across the run
export default function ReputationMeter({ reputation }: ReputationMeterProps) {
  const t = useTranslation();
  const tone = reputationTone(reputation);
  const Icon = tone.icon;
  const ratio = Math.min(1, Math.max(0, reputation / 100));

  return (
    <div className="flex flex-col gap-1" title={t.governance.reputationTooltip}>
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${tone.text}`} />
        <span className="hidden hd:inline text-[10px] text-slate-400 uppercase tracking-wide font-semibold">
          {t.governance.reputationLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${ratio * 100}%` }} />
        </div>
        <span className={`font-bold text-sm ${tone.text}`}>{reputation.toFixed(0)}</span>
      </div>
    </div>
  );
}
