import { Download, FileText, Film, X } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";

export default function PostMortemModal() {
  const t = useTranslation();
  const postMortem = useGameStore((s) => s.postMortem);
  const close = useGameStore((s) => s.closePostMortem);
  const openIncidentReplay = useGameStore((s) => s.openIncidentReplay);

  if (!postMortem) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-backdrop-in" onClick={close}>
      <div
        className="w-full max-w-2xl max-h-[80vh] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/60 shrink-0">
          <div className="flex items-center gap-2 text-sm font-bold font-heading text-slate-100">
            <FileText className="w-4 h-4 text-sky-400" />
            {t.postMortem.title(postMortem.incidentId)}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => openIncidentReplay(postMortem.incidentId)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-bold transition-colors"
            >
              <Film className="w-3.5 h-3.5" />
              {t.incidentReplay.openButton}
            </button>
            <a
              href={api.exportPostmortemPdfUrl(postMortem.incidentId)}
              download={`postmortem_${postMortem.incidentId}.pdf`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {t.postMortem.exportPdf}
            </a>
            <button onClick={close} className="text-slate-400 hover:text-slate-100 transition-colors" title={t.common.close}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-y-auto p-5 text-[11px] font-mono text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-900">
          {postMortem.markdown}
        </pre>
      </div>
    </div>
  );
}
