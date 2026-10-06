import { Frown, Meh, Smile } from "lucide-react";
import { memo } from "react";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useTranslation } from "../../i18n/useTranslation";
import { moraleBand, toneFor } from "../../utils/kpiBands";
import DeltaTag from "./DeltaTag";
import MeterShell from "./MeterShell";

interface MoraleMeterProps {
  happiness: number;
}

const ICONS = [Frown, Meh, Smile] as const;

// clean morale meter for the office's overall satisfaction
export default memo(function MoraleMeter({ happiness }: MoraleMeterProps) {
  const t = useTranslation();
  const band = moraleBand(happiness);
  const tone = toneFor("morale", band);
  const ratio = Math.min(1, Math.max(0, happiness / 100));
  const shown = useAnimatedNumber(happiness);

  return (
    <MeterShell kpi="morale" icon={ICONS[band]} iconClass={tone.text} label={t.topbar.morale} band={band}>
      <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-slate-700">
        <div className={`h-full rounded-full transition-[width] duration-slow ease-out-expo ${tone.bar}`} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className={`min-w-[2.2rem] text-sm font-bold tabular-nums transition-colors duration-slow ${tone.text}`}>{shown.toFixed(0)}%</span>
      <DeltaTag value={happiness} threshold={0.05} format={(r) => `${r > 0 ? "+" : ""}${r.toFixed(1)}% / tick`} />
    </MeterShell>
  );
});
