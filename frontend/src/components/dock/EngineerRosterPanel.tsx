import { Moon, UserPlus, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { CompetencyKey } from "../../i18n/translations";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { playClickSound } from "../../utils/sound";

const HIRING_COST = 15000;
const COMPETENCIES: CompetencyKey[] = ["auth", "payments", "gateway", "db"];

// tone for a 0-100 stat bar, shared between stress (high = bad) and stamina (low = bad)
function barTone(value: number, invert: boolean) {
  const effective = invert ? 100 - value : value;
  if (effective < 50) return "bg-emerald-500";
  if (effective < 75) return "bg-amber-500";
  return "bg-rose-500";
}

// on-call staff roster: hiring, per-engineer stress/stamina, and shift rotation
export default function EngineerRosterPanel() {
  const t = useTranslation();
  const engineers = useGameStore((s) => s.telemetry.engineers);
  const budget = useGameStore((s) => s.telemetry.budget);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const [hiring, setHiring] = useState(false);

  const handleHire = async (competency: CompetencyKey) => {
    playClickSound();
    try {
      await api.hireEngineer(competency);
      pushFloatingText(`-$${HIRING_COST.toLocaleString()} :: ${t.staff.hireEngineer}`, "info");
      setHiring(false);
    } catch {
      pushFloatingText(t.upgrades.insufficientBudget, "danger");
    }
  };

  const handleRotate = async (engineerId: string) => {
    playClickSound();
    try {
      await api.rotateShift(engineerId);
    } catch {
      pushFloatingText(t.staff.insufficientStamina, "danger");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {engineers.length === 0 && (
          <div className="text-[11px] text-slate-400 px-1 py-2">{t.common.none}</div>
        )}
        {engineers.map((eng) => (
          <div key={eng.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 truncate">{eng.name}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                  {t.staff.competencies[eng.core_competency]}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[9px] text-slate-400">
                    <span>{t.staff.stress}</span>
                    <span>{Math.round(eng.stress_index)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barTone(eng.stress_index, false)}`}
                      style={{ width: `${eng.stress_index}%` }}
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[9px] text-slate-400">
                    <span>{t.staff.stamina}</span>
                    <span>{Math.round(eng.stamina)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barTone(eng.stamina, true)}`}
                      style={{ width: `${eng.stamina}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleRotate(eng.id)}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border border-slate-200 text-slate-600 hover:bg-slate-50"
              title={t.staff.rotateShift}
            >
              {eng.on_call_status === "on_duty" ? <Moon className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
              {t.staff.onCallStatus[eng.on_call_status]}
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 p-2">
        {!hiring ? (
          <button
            onClick={() => setHiring(true)}
            disabled={budget < HIRING_COST}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {t.staff.hireEngineer} ({t.staff.hiringCost(`$${HIRING_COST.toLocaleString()}`)})
          </button>
        ) : (
          <div className="flex gap-1">
            {COMPETENCIES.map((c) => (
              <button
                key={c}
                onClick={() => handleHire(c)}
                className="flex-1 rounded-md bg-slate-800 text-white text-[10px] font-bold py-1.5 hover:bg-slate-700"
              >
                {t.staff.competencies[c]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
