import { Wrench } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";

interface TechDebtMeterProps {
  techDebt: number;
}

// office-stress tone ramps from tidy blue through messy amber into chaotic red
function stressTone(tdi: number) {
  if (tdi >= 70) return { text: "text-rose-400", bar: "bg-rose-500" };
  if (tdi >= 40) return { text: "text-amber-400", bar: "bg-amber-500" };
  return { text: "text-sky-400", bar: "bg-sky-500" };
}

// office stress / messy-code meter standing in for the technical debt index
export default function TechDebtMeter({ techDebt }: TechDebtMeterProps) {
  const t = useTranslation();
  const tone = stressTone(techDebt);
  const ratio = Math.min(1, Math.max(0, techDebt / 100));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Wrench className={`w-3.5 h-3.5 ${tone.text}`} />
        <span className="hidden hd:inline text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{t.topbar.techDebt}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 rounded-full bg-slate-700 overflow-hidden">
          <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${ratio * 100}%` }} />
        </div>
        <span className={`font-bold text-sm ${tone.text}`}>{techDebt}</span>
      </div>
    </div>
  );
}
