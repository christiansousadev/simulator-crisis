import { CheckCircle2, FileText, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore, type IncidentResolutionSummary as IncidentResolutionSummaryType } from "../../store/useGameStore";
import { severityTone } from "../../utils/severity";

// how long the card is readable, and how long its exit animation takes; the card is unmounted by a
// JS timer that matches what the player actually sees, never by a css animation end
const VISIBLE_MS = 5000;
const EXIT_MS = 220;

// compact, non-blocking "case closed" card shown the instant an incident leaves the active list --
// mtta/mttr/cost the moment it has them, a postmortem link that never forces itself open. It has
// its own lifecycle: enter, dwell (paused while hovered), exit. While leaving it ignores the
// pointer, so it can never be invisible yet clickable over the camera controls.
const ResolutionCard = memo(function ResolutionCard({
  summary,
  onDismiss,
  onPostMortem,
}: {
  summary: IncidentResolutionSummaryType;
  onDismiss: (id: string) => void;
  onPostMortem: (incidentId: string) => void;
}) {
  const t = useTranslation();
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(VISIBLE_MS);
  const startedAt = useRef(0);

  useEffect(() => {
    if (leaving || hovered) return;
    startedAt.current = performance.now();
    const timer = setTimeout(() => {
      if (reduced) onDismiss(summary.id);
      else setLeaving(true);
    }, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(500, remaining.current - (performance.now() - startedAt.current));
    };
  }, [hovered, leaving, reduced, summary.id, onDismiss]);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => onDismiss(summary.id), EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, summary.id, onDismiss]);

  const tone = severityTone(summary.severity);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`flex flex-col gap-1 rounded border bg-slate-950/90 px-3 py-2 ${tone.ring} ${
        leaving ? "pointer-events-none animate-item-out" : "pointer-events-auto animate-slide-up-in"
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t.resolutionSummary.header(summary.serviceId)}</span>
        <button
          type="button"
          onClick={() => setLeaving(true)}
          aria-label={t.hud.resolution.dismiss}
          className="shrink-0 text-slate-500 transition-colors hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-caption text-slate-400">
        <span>{t.resolutionSummary.mtta(summary.mttaSeconds)}</span>
        <span>{t.resolutionSummary.mttr(summary.mttrSeconds)}</span>
        <span className={summary.cost === null ? "text-slate-400" : "text-amber-300"}>
          {summary.cost === null ? t.resolutionSummary.costUnknown : t.resolutionSummary.cost(summary.cost.toLocaleString())}
        </span>
        {summary.techDebtDelta !== null && summary.techDebtDelta !== undefined && (
          <span className={summary.techDebtDelta > 0 ? "text-amber-300" : "text-emerald-300"}>
            {t.resolutionSummary.techDebt(summary.techDebtDelta)}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => onPostMortem(summary.incidentId)}
        className="flex items-center gap-1 self-start text-caption font-semibold text-sky-300 transition-colors hover:text-sky-200"
      >
        <FileText className="h-3 w-3" aria-hidden />
        {t.resolutionSummary.viewPostmortem}
      </button>
    </div>
  );
});

export default function IncidentResolutionSummary() {
  const t = useTranslation();
  const summaries = useGameStore((s) => s.resolutionSummaries);
  const dismiss = useGameStore((s) => s.dismissResolutionSummary);
  const openPostMortem = useGameStore((s) => s.openPostMortem);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);

  const handlePostMortem = useCallback(
    async (incidentId: string) => {
      try {
        const result = await api.generatePostmortem(incidentId);
        openPostMortem(result.incident_id, result.markdown);
      } catch {
        pushFloatingText(t.ledger.postmortemUnavailable, "warning");
      }
    },
    [openPostMortem, pushFloatingText, t]
  );

  if (summaries.length === 0) return null;

  // top-left, below the camera control bar (top-3/left-3 of the office), never over it
  return (
    <div
      role="status"
      aria-label={t.hud.resolution.region}
      className="pointer-events-none fixed left-4 top-[10.75rem] z-hud flex max-w-xs flex-col gap-1.5"
    >
      {summaries.map((s) => (
        <ResolutionCard key={s.id} summary={s} onDismiss={dismiss} onPostMortem={handlePostMortem} />
      ))}
    </div>
  );
}
