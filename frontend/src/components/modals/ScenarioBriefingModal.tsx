import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { ScenarioIdKey } from "../../i18n/translations";
import { translateObjective } from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { playClickSound } from "../../utils/sound";

// brief, dismissible presentation shown once right after a scripted scenario launches -- name,
// narrative context (the same i18n copy ScenarioSelectModal already used to sell the pick) and
// the real objective list the backend just started computing, framed as the win/loss condition.
// safely pauses simulation while open so the player can read without wasting scenario time.
// never blocks past a single click; sandbox never triggers this (it has no scenario objectives).
export default function ScenarioBriefingModal() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const scenario = useGameStore((s) => s.scenarioBriefing);
  const close = useGameStore((s) => s.closeScenarioBriefing);

  useEffect(() => {
    if (!scenario || scenario.scenario_id === "custom") return;
    api.pauseSimulation().catch(() => {});
  }, [scenario]);

  if (!scenario || scenario.scenario_id === "custom") return null;
  const key = scenario.scenario_id as ScenarioIdKey;
  const name = t.scenarios.names[key];
  const description = t.scenarios.descriptions[key];
  if (!name) return null;

  const handleBegin = () => {
    playClickSound();
    api.startSimulation().catch(() => {});
    close();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-backdrop-in">
      <div className="w-full max-w-md rounded-xl border border-sky-500/40 bg-slate-900 shadow-2xl overflow-hidden animate-modal-in">
        <div className="px-5 py-4 border-b border-slate-700 bg-sky-950/40">
          <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400 mb-1">{t.scenarios.briefingContext}</p>
          <h2 className="text-lg font-extrabold font-heading text-white">{name}</h2>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-xs text-slate-300 leading-relaxed">{description}</p>

          {scenario.objectives.length > 0 && (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">{t.scenarios.briefingObjectives}</h3>
              <div className="flex flex-col gap-1">
                {scenario.objectives.map((o) => (
                  <div key={o.id} className="flex items-start gap-1.5 text-xs text-slate-300">
                    {o.done ? (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 mt-0.5 text-slate-500 shrink-0" />
                    )}
                    <span>{translateObjective(o.id, o.description, language)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleBegin}
            className="mt-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-colors"
          >
            <Rocket className="w-4 h-4" />
            {t.scenarios.briefingBegin}
          </button>
        </div>
      </div>
    </div>
  );
}
