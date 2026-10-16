import { BookOpen, CheckCircle2, GraduationCap } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { playUiConfirmSound } from "../../utils/sound";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";
import { moduleRange, TUTORIAL_MODULES } from "./tutorialSteps";

const TITLE_ID = "academy-title";

// SRE FLIGHT ACADEMY MENU (the help button and the pause menu open it): four independent missions,
// each starting at its own first tutorial step, with a check mark once its last step was reached.
export default function AcademyModal() {
  const t = useTranslation();
  const copy = t.evolution.academy;
  const open = useGameStore((s) => s.academyOpen);
  const done = useGameStore((s) => s.academyDone);
  const close = useGameStore((s) => s.closeAcademy);
  const openOnboarding = useGameStore((s) => s.openOnboarding);
  const openGlossary = useGameStore((s) => s.openGlossary);
  const firstRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal open={open} onClose={close} labelledBy={TITLE_ID} layer="dialog" size="lg" initialFocusRef={firstRef}>
      <ModalHeader
        id={TITLE_ID}
        title={copy.title}
        icon={<GraduationCap className="h-5 w-5 text-cyan-300" aria-hidden />}
        onClose={close}
        closeLabel={copy.close}
      />
      <ModalBody className="space-y-3 px-5 py-4">
        <p className="text-sm leading-relaxed text-slate-300">{copy.intro}</p>
        <p className="text-caption font-semibold uppercase tracking-wider text-slate-400">{copy.progress(done.length, TUTORIAL_MODULES.length)}</p>
        <ol className="grid gap-2 sm:grid-cols-2">
          {TUTORIAL_MODULES.map((module, i) => {
            const completed = done.includes(module);
            const info = copy.modules[i];
            return (
              <li key={module} className={`flex flex-col gap-2 rounded-lg border p-3 ${completed ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-700 bg-slate-800/40"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-micro font-bold uppercase tracking-wider text-cyan-300">
                      {copy.moduleLabel(module)} · {moduleRange(module).count}
                    </p>
                    <h3 className="font-heading text-base font-bold text-white">{info.title}</h3>
                  </div>
                  {completed && (
                    <span className="flex shrink-0 items-center gap-1 text-micro font-bold text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      {copy.done}
                    </span>
                  )}
                </div>
                <p className="flex-1 text-caption leading-relaxed text-slate-300">{info.summary}</p>
                <button
                  ref={module === 1 ? firstRef : undefined}
                  type="button"
                  onClick={() => {
                    playUiConfirmSound();
                    openOnboarding(module);
                  }}
                  aria-label={`${completed ? copy.replay : copy.start}: ${copy.moduleLabel(module)} — ${info.title}`}
                  className="self-start rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition-colors duration-fast hover:bg-cyan-400"
                >
                  {completed ? copy.replay : copy.start}
                </button>
              </li>
            );
          })}
        </ol>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={() => {
            close();
            openGlossary();
          }}
          className="flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-xs font-bold text-slate-200 transition-colors duration-fast hover:bg-slate-800"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          {copy.glossary}
        </button>
      </ModalFooter>
    </Modal>
  );
}
