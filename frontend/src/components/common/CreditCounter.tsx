import { DollarSign } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";

interface CreditCounterProps {
  budget: number;
}

// low runway threshold below which the counter flips to a critical red warning
const LOW_RUNWAY_THRESHOLD = 20000;

// clean digital currency counter for the runway budget
export default function CreditCounter({ budget }: CreditCounterProps) {
  const t = useTranslation();
  const critical = budget < LOW_RUNWAY_THRESHOLD;
  const tone = critical ? "text-rose-400" : "text-emerald-400";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <DollarSign className={`w-3.5 h-3.5 ${tone}`} />
        <span className="hidden hd:inline text-[10px] text-slate-400 uppercase tracking-wide font-semibold">{t.topbar.runway}</span>
      </div>
      <span className={`font-bold text-base tabular-nums ${tone}`}>
        ${budget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </span>
    </div>
  );
}
