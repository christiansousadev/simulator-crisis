import { Radio } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";

// FLAVOR HEADLINES DERIVED FROM RECENT AUDIT EVENTS, SCROLLING LIKE A STOCK TICKER
export default function CorporateNewsTicker() {
  const t = useTranslation();
  const recentAudits = useGameStore((s) => s.telemetry.recent_audits);
  const tick = useGameStore((s) => s.telemetry.tick);

  const headlines = useMemo(() => {
    const fromAudits = recentAudits
      .slice(-8)
      .map((entry) => t.newsTicker.eventHeadlines[entry.event_type as keyof typeof t.newsTicker.eventHeadlines])
      .filter((headline): headline is string => Boolean(headline));
    const flavor = t.newsTicker.flavorLines;
    return fromAudits.length > 0 ? [...fromAudits, ...flavor] : flavor;
  }, [recentAudits, t]);

  const line = headlines.join("     ★     ");

  return (
    <div className="h-6 bg-slate-900 border-b border-slate-800 flex items-center overflow-hidden shrink-0">
      <div className="flex items-center gap-1 px-2 text-[10px] font-bold text-rose-400 uppercase shrink-0 bg-slate-900 z-10">
        <Radio className="w-3 h-3 animate-pulse" />
        {t.newsTicker.label}
      </div>
      <div className="flex-1 overflow-hidden whitespace-nowrap relative h-full">
        <div
          key={tick > 0 ? Math.floor(tick / 20) : 0}
          className="absolute inset-y-0 flex items-center text-[11px] text-slate-400 font-mono animate-ticker-scroll"
        >
          {line}
        </div>
      </div>
    </div>
  );
}
