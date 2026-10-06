import { ChevronDown, Radio } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import HudPopover from "../common/HudPopover";

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
// One fixed height in every state (headline and consequence share a single line), so the office
// below never jumps when the strip switches between quiet and breaking-news.
export default function CorporateNewsTicker() {
  const t = useTranslation();
  const recentAudits = useGameStore((s) => s.telemetry.recent_audits);
  const [expanded, setExpanded] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const { headlineAudit, priorityType, counts } = useMemo(() => {
    const recentWindow = recentAudits.slice(-RECENT_WINDOW);
    const tally = new Map<string, number>();
    for (const audit of recentWindow) tally.set(audit.event_type, (tally.get(audit.event_type) ?? 0) + 1);
    const priority = CRITICAL_PRIORITY.find((type) => tally.has(type));
    const headline = priority
      ? [...recentWindow].reverse().find((a) => a.event_type === priority)
      : recentWindow[recentWindow.length - 1];
    return { headlineAudit: headline, priorityType: priority, counts: tally };
  }, [recentAudits]);

  const headline = headlineAudit ? t.newsTicker.eventHeadlines[headlineAudit.event_type] : undefined;
  const shell = "flex h-8 shrink-0 items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3";

  // no recognizable ledger activity yet: a single quiet flavor line, purely ambient
  if (!headlineAudit || !headline) {
    return (
      <div className={shell} role="status" aria-label={t.hud.ticker.region}>
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
          <span className="truncate text-caption text-slate-400">{t.newsTicker.flavorLines[0]}</span>
        </div>
      </div>
    );
  }

  const consequence = t.newsTicker.eventConsequence[headlineAudit.event_type];
  const isCritical = Boolean(priorityType);
  const otherEntries = Array.from(counts.entries()).filter(([type]) => type !== headlineAudit.event_type);
  const otherCount = otherEntries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className={shell} role="status" aria-label={t.hud.ticker.region}>
      <div className="flex min-w-0 items-center gap-2">
        <Radio className={`h-3 w-3 shrink-0 ${isCritical ? "text-rose-400" : "text-slate-500"}`} aria-hidden />
        <p className="min-w-0 truncate text-caption leading-none">
          <span className={`font-bold ${isCritical ? "text-rose-300" : "text-slate-200"}`}>{headline}</span>
          {consequence && <span className="text-slate-400"> — {consequence}</span>}
        </p>
      </div>

      {otherCount > 0 && (
        <div className="relative shrink-0">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-haspopup="dialog"
            className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-micro font-bold text-slate-300 transition-colors hover:text-slate-100"
          >
            {t.newsTicker.moreEvents(otherCount)}
            <ChevronDown className={`h-3 w-3 transition-transform duration-base ${expanded ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <HudPopover
            open={expanded}
            onClose={() => setExpanded(false)}
            anchorRef={triggerRef}
            placement="bottom-end"
            id="news-ticker-events"
            label={t.newsTicker.label}
            className="flex w-64 flex-col gap-1 p-2"
          >
            {otherEntries.map(([type, count]) => (
              <div key={type} className="flex items-center justify-between gap-2 px-1.5 py-1 text-caption text-slate-300">
                <span className="truncate">{t.newsTicker.eventHeadlines[type] ?? t.hud.ledger.events[type] ?? type}</span>
                <span className="shrink-0 font-bold tabular-nums text-slate-100">×{count}</span>
              </div>
            ))}
          </HudPopover>
        </div>
      )}
    </div>
  );
}
