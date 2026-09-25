import { X } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";

// SIMPLE CREDITS ROLL, REACHABLE FROM THE TITLE SCREEN AND THE TOPBAR SETTINGS
export default function CreditsModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.creditsOpen);
  const close = useGameStore((s) => s.closeCredits);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4" onClick={close}>
      <div
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 bg-slate-800/60">
          <h2 className="text-sm font-bold text-white">{t.titleScreen.credits}</h2>
          <button onClick={close} className="text-slate-400 hover:text-slate-100" title={t.common.close}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-3 text-sm text-slate-300">
          <p className="font-heading font-bold text-lg text-white">IncidentZero Corp.</p>
          <p>{t.credits.body}</p>
          <p className="text-xs text-slate-500 mt-2">{t.credits.builtWith}</p>
        </div>
      </div>
    </div>
  );
}
