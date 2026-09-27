import { FileText, ScrollText } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";

// COMPLIANCE LEDGER WITH THE SOX-404 POST-MORTEM GENERATOR
export default function AuditTicker() {
  const t = useTranslation();
  const audits = useGameStore((s) => s.telemetry.recent_audits);
  const resolvedHistory = useGameStore((s) => s.resolvedHistory);
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

  return (
    <div className="h-full overflow-y-auto p-2 flex flex-col gap-2">
      {resolvedHistory.length > 0 && (
        <div className="pb-2 border-b border-slate-800">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">{t.ledger.generatePostmortem}</p>
          <div className="flex flex-wrap gap-1.5">
            {resolvedHistory.map((inc) => (
              <button
                key={inc.id}
                onClick={() => handlePostMortem(inc.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-slate-800 bg-slate-900/80 hover:border-sky-500/50 text-[10px] font-medium text-slate-400 hover:text-sky-400 transition-colors"
              >
                <FileText className="w-3 h-3" />
                {inc.id}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1 font-mono text-[11px]">
        {audits.length === 0 ? (
          <div className="flex items-center gap-1.5 text-slate-400 py-1">
            <ScrollText className="w-3.5 h-3.5" />
            <span>{t.ledger.noActivity}</span>
          </div>
        ) : (
          audits
            .slice()
            .reverse()
            .map((audit) => (
              <div
                key={audit.id}
                className="flex items-center gap-3 text-slate-400 bg-slate-900/60 border border-slate-800/70 rounded px-2 py-1"
              >
                <span className="text-slate-500">{audit.timestamp.substring(11, 19)}</span>
                <span className="text-sky-400 font-semibold">[{audit.actor}]</span>
                <span className={audit.compliance_flag ? "text-emerald-400" : "text-rose-400 font-bold"}>
                  {audit.event_type}
                </span>
                <span className="text-slate-500 truncate">{JSON.stringify(audit.details)}</span>
              </div>
            ))
        )}
      </div>
    </div>
  );
}
