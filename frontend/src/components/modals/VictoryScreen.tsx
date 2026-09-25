import { Award, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { GRADE_TONE, gradeForSla } from "../../utils/grading";
import { playVictoryFanfare } from "../../utils/sound";
import ConfettiBurst from "../common/ConfettiBurst";

// OFFICIAL AUDIT CERTIFICATION LETTER SHOWN AFTER SURVIVING A FULL SLA AUDIT CYCLE
export default function VictoryScreen() {
  const t = useTranslation();
  const tick = useGameStore((s) => s.telemetry.tick);
  const slaPercentage = useGameStore((s) => s.telemetry.sla_percentage);
  const budget = useGameStore((s) => s.telemetry.budget);

  const grade = gradeForSla(slaPercentage);
  const gradeTone = GRADE_TONE[grade];

  useEffect(() => {
    playVictoryFanfare();
  }, []);

  const handleRestart = async () => {
    try {
      await api.resetSimulation();
    } catch {
      // engine reset is idempotent; the next telemetry frame reflects the fresh run
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
      <ConfettiBurst />
      <div className="w-full max-w-lg bg-white rounded-sm shadow-2xl border border-slate-300 relative">
        <div
          className={`absolute top-6 right-8 rotate-[-8deg] border-4 rounded-full w-20 h-20 flex flex-col items-center justify-center opacity-90 ${gradeTone}`}
          style={{ borderColor: "currentColor" }}
        >
          <Award className="w-5 h-5" />
          <span className="font-extrabold text-lg leading-none mt-0.5">{grade}</span>
        </div>

        <div className="p-8 border-b-2 border-slate-800">
          <p className="text-[11px] text-slate-400 uppercase tracking-widest">{t.victory.eyebrow}</p>
          <h1 className="font-extrabold text-2xl text-slate-900 mt-1">{t.victory.title}</h1>
          <p className="text-xs text-slate-500 mt-1">{t.victory.reference(Math.floor(tick / 24) + 1)}</p>
        </div>

        <div className="p-8 flex flex-col gap-4 text-sm text-slate-700 leading-relaxed">
          <p>{t.victory.salutation}</p>
          <p>{t.victory.body}</p>

          <div className="grid grid-cols-3 gap-3 my-2">
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-center">
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">{t.victory.ticksSurvived}</span>
              <span className="block font-mono font-bold text-lg text-slate-800">{tick}</span>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-center">
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">{t.victory.finalSla}</span>
              <span className="block font-mono font-bold text-lg text-slate-800">{slaPercentage.toFixed(2)}%</span>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-center">
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">{t.victory.runwayLeft}</span>
              <span className="block font-mono font-bold text-lg text-slate-800">
                ${budget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>

          <p className="text-slate-500 text-xs italic">{t.victory.footer}</p>
        </div>

        <div className="px-8 pb-8">
          <button
            onClick={handleRestart}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm text-white font-bold transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            {t.victory.button}
          </button>
        </div>
      </div>
    </div>
  );
}
