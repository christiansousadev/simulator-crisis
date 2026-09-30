import { CheckCircle2, FileText } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore, type IncidentResolutionSummary as IncidentResolutionSummaryType } from "../../store/useGameStore";
import { severityTone } from "../../utils/severity";

const AUTO_DISMISS_MS = 3500;

// compact, non-blocking "case closed" card shown the instant an incident leaves the active list --
// mtta/mttr/cost the moment it has them, a postmortem link that never forces itself open. same
// auto-dismiss shape as FloatingCombatText (per-item setTimeout + cleanup), just longer-lived and
// roomier since it carries more information than a one-line callout.
function ResolutionCard({
  summary,
  onDismiss,
  onPostMortem,
}: {
  summary: IncidentResolutionSummaryType;
  onDismiss: (id: string) => void;
  onPostMortem: (incidentId: string) => void;
}) {
  const t = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(summary.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [summary.id, onDismiss]);

  const tone = severityTone(summary.severity);

  return (
    <div
      className={`pointer-events-auto flex flex-col gap-1 px-3 py-2 rounded border bg-slate-950/90 animate-combat-text-pop ${tone.ring}`}
    >
      <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs uppercase tracking-wide">
        <CheckCircle2 className="w-3.5 h-3.5" />
        {t.resolutionSummary.header(summary.serviceId)}
      </div>
      <div className="flex items-center flex-wrap gap-2.5 font-mono text-[10px] text-slate-400">
        <span>{t.resolutionSummary.mtta(summary.mttaSeconds)}</span>
        <span>{t.resolutionSummary.mttr(summary.mttrSeconds)}</span>
        <span className={summary.cost === null ? "text-slate-500" : "text-amber-400"}>
          {summary.cost === null ? t.resolutionSummary.costUnknown : t.resolutionSummary.cost(summary.cost)}
        </span>
        {summary.techDebtDelta !== null && summary.techDebtDelta !== undefined && (
          <span className={summary.techDebtDelta > 0 ? "text-amber-400" : "text-emerald-400"}>
            {t.resolutionSummary.techDebt(summary.techDebtDelta)}
          </span>
        )}
      </div>
      <button
        onClick={() => onPostMortem(summary.incidentId)}
        className="self-start flex items-center gap-1 text-[10px] font-semibold text-sky-400 hover:text-sky-300"
      >
        <FileText className="w-3 h-3" />
        {t.resolutionSummary.viewPostmortem}
      </button>
    </div>
  );
}

export default function IncidentResolutionSummary() {
  const t = useTranslation();
  const summaries = useGameStore((s) => s.resolutionSummaries);
  const dismiss = useGameStore((s) => s.dismissResolutionSummary);
  const openPostMortem = useGameStore((s) => s.openPostMortem);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);

  const handlePostMortem = async (incidentId: string) => {
    try {
      const result = await api.generatePostmortem(incidentId);
      openPostMortem(result.incident_id, result.markdown);
    } catch {
      pushFloatingText(t.ledger.postmortemUnavailable, "warning");
    }
  };

  if (summaries.length === 0) return null;

  return (
    <div className="fixed top-24 left-4 z-50 flex flex-col gap-1.5 pointer-events-none max-w-xs">
      {summaries.map((s) => (
        <ResolutionCard
          key={s.id}
          summary={s}
          onDismiss={dismiss}
          onPostMortem={handlePostMortem}
        />
      ))}
    </div>
  );
}
