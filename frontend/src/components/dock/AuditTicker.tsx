import { AlertTriangle, CheckCircle2, FileText, ScrollText } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { AuditLogEntry } from "../../types/game";
import { auditDetailSummary, auditEventName } from "../../utils/auditText";
import EmptyState from "../common/EmptyState";
import TransitionList from "../common/TransitionList";

const LedgerRow = memo(function LedgerRow({ audit }: { audit: AuditLogEntry }) {
  const t = useTranslation();
  const detail = auditDetailSummary(audit, t);
  const ok = audit.compliance_flag;

  return (
    <div
      // the untouched record stays one hover away for anyone who wants the raw data
      title={`${t.hud.ledger.raw}: ${JSON.stringify(audit.details)}`}
      className="flex items-center gap-2.5 rounded border border-slate-800/70 bg-slate-900/60 px-2 py-1 text-caption text-slate-300"
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label={t.hud.ledger.compliant} />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-label={t.hud.ledger.flagged} />
      )}
      <span className="w-14 shrink-0 font-mono tabular-nums text-slate-400">{audit.timestamp.substring(11, 19)}</span>
      <span className={`shrink-0 font-semibold ${ok ? "text-slate-100" : "text-rose-300"}`}>{auditEventName(audit.event_type, t)}</span>
      {detail && <span className="min-w-0 flex-1 truncate font-mono text-slate-300">{detail}</span>}
      <span className="ml-auto hidden shrink-0 font-mono text-micro uppercase text-sky-300 sm:inline">{audit.actor}</span>
    </div>
  );
});

// COMPLIANCE LEDGER WITH THE SOX-404 POST-MORTEM GENERATOR. Newest entry on top and highlighted as
// it arrives; event names and details are written for people, the raw record is the tooltip.
export default function AuditTicker() {
  const t = useTranslation();
  const audits = useGameStore((s) => s.telemetry.recent_audits);
  const resolvedHistory = useGameStore((s) => s.resolvedHistory);
  const openPostMortem = useGameStore((s) => s.openPostMortem);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);

  const newestFirst = useMemo(() => audits.slice().reverse(), [audits]);

  const handlePostMortem = async (incidentId: string) => {
    try {
      const result = await api.generatePostmortem(incidentId);
      openPostMortem(result.incident_id, result.markdown);
    } catch {
      pushFloatingText(t.ledger.postmortemUnavailable, "warning");
    }
  };

  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2">
      {resolvedHistory.length > 0 && (
        <div className="border-b border-slate-800 pb-2">
          <p className="mb-1.5 font-heading text-xs font-bold uppercase tracking-wider text-slate-300">{t.ledger.generatePostmortem}</p>
          <div className="flex flex-wrap gap-1.5">
            {resolvedHistory.map((inc) => (
              <button
                type="button"
                key={inc.id}
                onClick={() => handlePostMortem(inc.id)}
                className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 text-caption font-medium text-slate-300 transition-colors hover:border-sky-500/50 hover:text-sky-300"
              >
                <FileText className="h-3 w-3" aria-hidden />
                {inc.id}
              </button>
            ))}
          </div>
        </div>
      )}
      {audits.length === 0 ? (
        <EmptyState icon={ScrollText} title={t.ledger.noActivity} hint={t.hud.ledger.emptyHint} />
      ) : (
        <TransitionList items={newestFirst} getKey={(a) => a.id} exitMs={0} className="flex flex-col gap-1">
          {(audit) => <LedgerRow audit={audit} />}
        </TransitionList>
      )}
    </div>
  );
}
