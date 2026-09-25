import { AlertTriangle, Terminal, X } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";

export default function IncidentDetailModal() {
  const t = useTranslation();
  const incident = useGameStore((s) => s.selectedIncident);
  const close = useGameStore((s) => s.closeIncidentDetail);
  const openTriageTerminal = useGameStore((s) => s.openTriageTerminal);

  if (!incident) return null;

  const canInvestigate = incident.status === "active" || incident.status === "acknowledged";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-backdrop-in" onClick={close}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-700 bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-rose-500/15 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 mr-2">
                {t.severities[incident.severity]}
              </span>
              <span className="text-sm font-bold font-heading text-slate-100">{incident.title}</span>
            </div>
          </div>
          <button onClick={close} className="text-slate-400 hover:text-slate-100 transition-colors" title={t.common.close}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3 text-xs font-mono">
          <div>
            <span className="text-slate-500 uppercase text-[10px] tracking-wide font-sans font-semibold">
              {t.incidentDetail.incidentId}
            </span>
            <p className="text-slate-300">{incident.id}</p>
          </div>
          <div>
            <span className="text-slate-500 uppercase text-[10px] tracking-wide font-sans font-semibold">
              {t.incidentDetail.affectedService}
            </span>
            <p className="text-slate-300">{incident.service_id}</p>
          </div>
          <div>
            <span className="text-slate-500 uppercase text-[10px] tracking-wide font-sans font-semibold">
              {t.incidentDetail.rootCause}
            </span>
            <p className="text-rose-400">{incident.root_cause}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-700">
            <div>
              <span className="text-slate-500 uppercase text-[10px] tracking-wide font-sans font-semibold">{t.incidents.mtta}</span>
              <p className="text-slate-300 font-bold">{incident.mtta_seconds}t</p>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] tracking-wide font-sans font-semibold">{t.incidents.mttr}</span>
              <p className="text-slate-300 font-bold">{incident.mttr_seconds}t</p>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] tracking-wide font-sans font-semibold">{t.incidentDetail.status}</span>
              <p className="text-amber-400 font-bold uppercase">{incident.status}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-slate-500 uppercase text-[10px] tracking-wide font-sans font-semibold">
                {t.incidentDetail.createdTick}
              </span>
              <p className="text-slate-300">{incident.created_tick}</p>
            </div>
            <div>
              <span className="text-slate-500 uppercase text-[10px] tracking-wide font-sans font-semibold">
                {t.incidentDetail.acknowledgedTick}
              </span>
              <p className="text-slate-300">{incident.acknowledged_tick ?? "—"}</p>
            </div>
          </div>

          {canInvestigate && (
            <button
              onClick={() => {
                openTriageTerminal(incident.id);
                close();
              }}
              disabled={incident.triage_solved}
              className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold font-sans transition-colors"
            >
              <Terminal className="w-3.5 h-3.5" />
              {incident.triage_solved ? t.logTriage.alreadySolved : t.logTriage.investigateLogs}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
