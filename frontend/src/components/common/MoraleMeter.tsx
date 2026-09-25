import { Smile, Frown, Meh } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";

interface MoraleMeterProps {
  happiness: number;
}

// pick a face and tone that match the current morale band
function moraleTone(happiness: number) {
  if (happiness >= 70) return { icon: Smile, text: "text-emerald-400", bar: "bg-emerald-500" };
  if (happiness >= 40) return { icon: Meh, text: "text-amber-400", bar: "bg-amber-500" };
  return { icon: Frown, text: "text-rose-400", bar: "bg-rose-500" };
}

// clean morale meter for the office's overall satisfaction
export default function MoraleMeter({ happiness }: MoraleMeterProps) {
  const t = useTranslation();
  const tone = moraleTone(happiness);
  const Icon = tone.icon;
  const ratio = Math.min(1, Math.max(0, happiness / 100));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Icon className={`w-3.5 h-3.5 ${tone.text}`} />
        <span className="hidden hd:inline text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{t.topbar.morale}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${ratio * 100}%` }} />
        </div>
        <span className={`font-bold text-sm ${tone.text}`}>{happiness.toFixed(0)}%</span>
      </div>
    </div>
  );
}
