import { GraduationCap } from "lucide-react";
import { useRef } from "react";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { playUiBackSound, playUiConfirmSound } from "../../utils/sound";

// FIRST-RUN CHOICE: do the guided tutorial or skip it. Either answer is remembered, so it never
// comes back on its own; the help button and the pause menu replay it any time.
export default function TutorialOffer({ open }: { open: boolean }) {
  const t = useTranslation();
  const openOnboarding = useGameStore((s) => s.openOnboarding);
  const closeOnboarding = useGameStore((s) => s.closeOnboarding);
  const startRef = useRef<HTMLButtonElement>(null);

  const start = () => {
    playUiConfirmSound();
    openOnboarding();
  };
  const skip = () => {
    playUiBackSound();
    closeOnboarding();
  };

  return (
    <Modal open={open} onClose={skip} labelledBy="tutorial-offer-title" layer="tutorial" size="sm" initialFocusRef={startRef}>
      <ModalHeader
        id="tutorial-offer-title"
        title={t.onboarding.offerTitle}
        icon={<GraduationCap className="w-5 h-5 text-cyan-300" />}
      />
      <ModalBody className="px-5 py-4">
        <p className="text-sm leading-relaxed text-slate-300">{t.onboarding.offerBody}</p>
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          onClick={skip}
          className="px-3 py-1.5 rounded-md text-xs font-bold text-slate-300 border border-slate-600 hover:bg-slate-800 transition-colors duration-fast"
        >
          {t.onboarding.offerSkip}
        </button>
        <button
          ref={startRef}
          type="button"
          onClick={start}
          className="px-4 py-1.5 rounded-md text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors duration-fast"
        >
          {t.onboarding.offerStart}
        </button>
      </ModalFooter>
    </Modal>
  );
}
