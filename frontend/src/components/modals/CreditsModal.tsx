import { Building2 } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useGameStore } from "../../store/useGameStore";
import { FRONTEND_VERSION } from "../../utils/appInfo";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";
import "../flow/flow.css";

const TECH = ["FastAPI", "React", "TypeScript", "Zustand", "Tailwind CSS", "SVG", "Web Audio API"];

// CREDITS. A rolling sequence that pauses while hovered or focused; with reduced motion it is the
// same content as a plain scrollable list.
export default function CreditsModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.creditsOpen);
  const close = useGameStore((s) => s.closeCredits);
  const reduced = useReducedMotion();

  const sections = [
    { heading: t.flow.creditsDesign, lines: [t.credits.body] },
    { heading: t.flow.creditsTech, lines: [t.credits.builtWith, TECH.join("  ·  ")] },
    { heading: t.flow.creditsPractice, lines: t.flow.creditsPracticeLines },
    { heading: t.flow.creditsThanks, lines: [t.flow.creditsThanksLine] },
  ];

  const content = (
    <div className="flex flex-col items-center gap-8 px-8 py-10 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="p-3 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-400">
          <Building2 className="w-8 h-8" aria-hidden="true" />
        </div>
        <p className="font-heading font-black text-3xl tracking-wider text-white">IncidentZero Corp.</p>
        <p className="text-xs font-mono text-slate-400">{t.titleScreen.tagline}</p>
      </div>
      {sections.map((section) => (
        <div key={section.heading} className="flex flex-col gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400">{section.heading}</h3>
          {section.lines.map((line) => (
            <p key={line} className="text-sm text-slate-300 leading-relaxed max-w-xs mx-auto">
              {line}
            </p>
          ))}
        </div>
      ))}
      <p className="text-[11px] font-mono text-slate-500">v{FRONTEND_VERSION}</p>
    </div>
  );

  return (
    <Modal open={open} onClose={close} title={t.titleScreen.credits} size="sm" layer="system">
      <ModalHeader title={t.titleScreen.credits} onClose={close} closeLabel={t.common.close} />
      {reduced ? (
        <ModalBody className="max-h-[60vh]">{content}</ModalBody>
      ) : (
        <div
          className="flow-credits-viewport relative h-[24rem] max-h-[60vh] overflow-hidden"
          tabIndex={0}
          role="region"
          aria-label={t.titleScreen.credits}
          // fade the rolling text in and out at the edges
          style={{
            maskImage: "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, black 12%, black 88%, transparent)",
          }}
        >
          <div className="flow-credits-roll min-h-full" style={{ ["--roll-seconds" as string]: "42s" }}>
            {content}
          </div>
        </div>
      )}
      <ModalFooter className="justify-between">
        <span className="text-[11px] text-slate-500">{reduced ? "" : t.flow.creditsHoverHint}</span>
        <button
          type="button"
          onClick={close}
          className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold transition-colors duration-fast"
        >
          {t.common.close}
        </button>
      </ModalFooter>
    </Modal>
  );
}
