import { ChevronDown, Radio } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";

// event types worth ever promoting to the single prominent slot, most urgent first
const CRITICAL_PRIORITY = [
  "BANKRUPTCY_LIQUIDATION",
  "SLA_BREACH_EMERGENCY_SANCTION",
  "FEATURE_FREEZE_ENGAGED",
  "INCIDENT_RAISED",
];
const RECENT_WINDOW = 15;

// GAME-STYLE OPS EVENT STRIP: SURFACES THE SINGLE MOST-IMPORTANT RECENT EVENT WITH WHY IT MATTERS,
// GROUPING THE REST INTO A COMPACT COUNT INSTEAD OF SCROLLING EVERY TECHNICAL LOG LINE PAST THE
// PLAYER LIKE A STOCK TICKER. THE FULL TECHNICAL LEDGER STILL LIVES IN THE COMPLIANCE DOCK TAB.
export default function CorporateNewsTicker() {
  const t = useTranslation();
  const recentAudits = useGameStore((s) => s.telemetry.recent_audits);
  const [expanded, setExpanded] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const onClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setExpanded(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [expanded]);

  const recentWindow = recentAudits.slice(-RECENT_WINDOW);
  const counts = new Map<string, number>();
  for (const audit of recentWindow) counts.set(audit.event_type, (counts.get(audit.event_type) ?? 0) + 1);

  const priorityType = CRITICAL_PRIORITY.find((type) => counts.has(type));
  const headlineAudit = priorityType
    ? [...recentWindow].reverse().find((a) => a.event_type === priorityType)
    : recentWindow[recentWindow.length - 1];
  const headline = headlineAudit ? t.newsTicker.eventHeadlines[headlineAudit.event_type] : undefined;

  // no recognizable ledger activity yet: a single quiet flavor line, purely ambient
  if (!headlineAudit || !headline) {
    return (
      <div className="h-7 bg-slate-900 border-b border-slate-800 flex items-center px-3 gap-2 shrink-0">
        <Radio className="w-3 h-3 text-slate-600" />
        <span className="text-[11px] text-slate-500 truncate">{t.newsTicker.flavorLines[0]}</span>
      </div>
    );
  }

  const consequence = t.newsTicker.eventConsequence[headlineAudit.event_type];
  const isCritical = Boolean(priorityType);
  const otherEntries = Array.from(counts.entries()).filter(([type]) => type !== headlineAudit.event_type);
  const otherCount = otherEntries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="relative bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 py-1 gap-2 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <Radio className={`w-3 h-3 shrink-0 ${isCritical ? "text-rose-400 animate-pulse" : "text-slate-500"}`} />
        <div className="min-w-0 leading-tight">
          <p className={`text-[11px] font-bold truncate ${isCritical ? "text-rose-300" : "text-slate-300"}`}>{headline}</p>
          {consequence && <p className="text-[10px] text-slate-500 truncate">{consequence}</p>}
        </div>
      </div>

      {otherCount > 0 && (
        <div className="relative shrink-0" ref={popoverRef}>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-700 bg-slate-800/60 text-slate-400 text-[10px] font-bold hover:text-slate-200 transition-colors"
          >
            {t.newsTicker.moreEvents(otherCount)}
            <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
          {expanded && (
            <div className="absolute top-full right-0 mt-1 w-64 rounded-lg border border-slate-800 bg-slate-950/95 backdrop-blur-md shadow-xl p-2 flex flex-col gap-1 z-30">
              {otherEntries.map(([type, count]) => (
                <div key={type} className="flex items-center justify-between gap-2 text-[10px] text-slate-400 px-1.5 py-1">
                  <span className="truncate">{t.newsTicker.eventHeadlines[type] ?? type}</span>
                  <span className="font-bold text-slate-300 shrink-0">×{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
