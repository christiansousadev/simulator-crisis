import { RotateCcw, Stamp } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { playDefeatSting } from "../../utils/sound";

// OFFICIAL BOARD TERMINATION NOTICE SHOWN WHEN THE COMPANY GOES BANKRUPT
export default function LiquidationScreen() {
  const t = useTranslation();
  const tick = useGameStore((s) => s.telemetry.tick);
  const slaPercentage = useGameStore((s) => s.telemetry.sla_percentage);
  const techDebt = useGameStore((s) => s.telemetry.tech_debt);

  useEffect(() => {
    playDefeatSting();
  }, []);

  const handleRestart = async () => {
    try {
      await api.resetSimulation();
    } catch {
      // engine reset is idempotent; the next telemetry frame reflects the fresh run
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-backdrop-in">
      <div className="w-full max-w-lg bg-white rounded-sm shadow-2xl border border-slate-300 relative animate-modal-in">
        <div className="absolute top-6 right-8 rotate-[-8deg] border-4 border-rose-600 text-rose-600 rounded-md px-3 py-1 flex items-center gap-1.5 opacity-80">
          <Stamp className="w-4 h-4" />
          <span className="font-extrabold text-sm tracking-wider">{t.liquidation.stamp}</span>
        </div>

        <div className="p-8 border-b-2 border-slate-800">
          <p className="text-[11px] text-slate-400 uppercase tracking-widest">{t.liquidation.eyebrow}</p>
          <h1 className="font-extrabold text-2xl text-slate-900 mt-1">{t.liquidation.title}</h1>
          <p className="text-xs text-slate-500 mt-1">{t.liquidation.reference(Math.floor(tick / 24) + 1)}</p>
        </div>

        <div className="p-8 flex flex-col gap-4 text-sm text-slate-700 leading-relaxed">
          <p>{t.liquidation.salutation}</p>
          <p>{t.liquidation.body}</p>

          <div className="grid grid-cols-3 gap-3 my-2">
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-center">
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">{t.liquidation.ticksSurvived}</span>
              <span className="block font-mono font-bold text-lg text-slate-800">{tick}</span>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-center">
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">{t.liquidation.finalSla}</span>
              <span className="block font-mono font-bold text-lg text-slate-800">{slaPercentage.toFixed(2)}%</span>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-center">
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">{t.liquidation.finalTechDebt}</span>
              <span className="block font-mono font-bold text-lg text-slate-800">{techDebt}</span>
            </div>
          </div>

          <p className="text-slate-500 text-xs italic">{t.liquidation.footer}</p>
        </div>

        <div className="px-8 pb-8">
          <button
            onClick={handleRestart}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-sm text-white font-bold transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {t.liquidation.button}
          </button>
        </div>
      </div>
    </div>
  );
}
