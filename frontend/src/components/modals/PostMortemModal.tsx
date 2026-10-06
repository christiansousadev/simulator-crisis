import { Check, Copy, Download, FileText, Film } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { useDialogSounds } from "../../hooks/useDialogSounds";
import { usePresence } from "../../hooks/usePresence";
import { playUiConfirmSound } from "../../utils/sound";
import Markdown from "../../utils/markdown";
import AuditorChat from "../auditor/AuditorChat";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";

const TITLE_ID = "post-mortem-title";

// the backend's rendered post-mortem, shown as a formatted document with fixed header/footer
export default function PostMortemModal() {
  const t = useTranslation();
  const copy = t.gameplayModals.postMortem;
  const postMortem = useGameStore((s) => s.postMortem);
  const close = useGameStore((s) => s.closePostMortem);
  const openIncidentReplay = useGameStore((s) => s.openIncidentReplay);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const auditorCopy = t.auditorChat;
  const [copied, setCopied] = useState(false);
  const [tabState, setTabState] = useState<{ id: string; tab: "report" | "auditor"; auditorOpened: boolean }>({
    id: "",
    tab: "report",
    auditorOpened: false,
  });
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: report } = usePresence(postMortem);
  const open = postMortem !== null;
  useDialogSounds(open, "close");

  useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  if (!report) return null;

  // tab state is scoped to the incident so opening another report starts on the report tab
  const tab = tabState.id === report.incidentId ? tabState.tab : "report";
  const auditorOpened = tabState.id === report.incidentId && tabState.auditorOpened;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(report.markdown);
      playUiConfirmSound();
      setCopied(true);
      pushFloatingText(copy.copiedToast, "success");
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      pushFloatingText(copy.copyFailedToast, "danger");
    }
  };

  return (
    <Modal open={open} onClose={close} labelledBy={TITLE_ID} layer="dialog" size="xl">
      <ModalHeader
        id={TITLE_ID}
        title={t.postMortem.title(report.incidentId)}
        icon={<FileText className="w-4 h-4 text-sky-400 shrink-0" />}
        onClose={close}
        closeLabel={t.common.close}
      />
      <div role="group" aria-label={auditorCopy.tabsLabel} className="flex gap-1.5 px-5 py-2 border-b border-slate-800 bg-slate-900 shrink-0">
        {(["report", "auditor"] as const).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTabState({ id: report.incidentId, tab: id, auditorOpened: auditorOpened || id === "auditor" })}
            className={`px-3 py-1 rounded-md border text-[11px] font-bold transition-colors duration-fast ${
              tab === id
                ? "bg-sky-500/20 border-sky-500/60 text-sky-200"
                : "bg-transparent border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            {id === "report" ? auditorCopy.reportTab : auditorCopy.auditorTab}
          </button>
        ))}
      </div>
      <ModalBody className={tab === "report" ? "px-6 py-5" : "hidden"}>
        {report.markdown.trim() ? <Markdown source={report.markdown} /> : <p className="text-sm text-slate-500">{copy.empty}</p>}
      </ModalBody>
      {/* mounted on first visit and kept, so a half-typed answer survives a peek at the report */}
      {auditorOpened && (
        <ModalBody className={tab === "auditor" ? "" : "hidden"}>
          <AuditorChat key={report.incidentId} incidentId={report.incidentId} />
        </ModalBody>
      )}
      <ModalFooter className="flex-wrap" >
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold transition-colors duration-fast"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? copy.copied : copy.copy}
        </button>
        <a
          href={api.exportPostmortemPdfUrl(report.incidentId)}
          download={`postmortem_${report.incidentId}.pdf`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold transition-colors duration-fast"
        >
          <Download className="w-3.5 h-3.5" />
          {t.postMortem.exportPdf}
        </a>
        <button
          type="button"
          onClick={() => {
            playUiConfirmSound();
            openIncidentReplay(report.incidentId);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-bold transition-colors duration-fast"
        >
          <Film className="w-3.5 h-3.5" />
          {t.incidentReplay.openButton}
        </button>
      </ModalFooter>
    </Modal>
  );
}
