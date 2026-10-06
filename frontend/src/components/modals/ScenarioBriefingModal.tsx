import { CheckCircle2, Circle, Clock, Flame, Rocket } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { ScenarioIdKey } from "../../i18n/translations";
import { translateDifficulty, translateObjective } from "../../i18n/dynamicContent";
import { usePresence } from "../../hooks/usePresence";
import { useFlowStore } from "../../store/useFlowStore";
import { useGameStore } from "../../store/useGameStore";
import { SANDBOX_BRIEFING_ID } from "../../utils/launchFlow";
import { playReadySound } from "../../utils/sound";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";

// brief presentation shown right after a run launches: name, narrative, the real objective list
// the backend just started computing (or the sandbox rules), and a Begin button. While it is open
// the simulation is held (useSimulationHolds), so the player reads without burning scenario time;
// closing it by any route, Escape included, simply begins the shift.
export default function ScenarioBriefingModal() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const difficulty = useGameStore((s) => s.telemetry.difficulty);
  const live = useGameStore((s) => s.scenarioBriefing);
  const close = useGameStore((s) => s.closeScenarioBriefing);
  // keep the card content on screen while it animates out
  const { data: scenario } = usePresence(live, 160);
  const beginRef = useRef<HTMLButtonElement>(null);

  const handleBegin = () => {
    playReadySound();
    close();
    useFlowStore.getState().announceShiftStarted();
  };

  const isSandbox = scenario?.scenario_id === SANDBOX_BRIEFING_ID;
  const isCustom = scenario?.scenario_id === "custom";
  const key = scenario?.scenario_id as ScenarioIdKey | undefined;
  const name = isSandbox ? t.scenarios.sandbox : isCustom ? t.flow.customScenario : key ? t.scenarios.names[key] : undefined;
  const description = isSandbox
    ? t.scenarios.sandboxDescription
    : isCustom
    ? t.flow.customDescription
    : key
    ? t.scenarios.descriptions[key]
    : undefined;
  const title = name ?? t.scenarios.briefingContext;

  return (
    <Modal
      open={live !== null && Boolean(name)}
      onClose={handleBegin}
      closeOnBackdrop={false}
      title={title}
      size="md"
      layer="system"
      initialFocusRef={beginRef}
      panelClass="border-sky-500/40"
    >
      <ModalHeader title={title} className="bg-sky-950/40" />

      <ModalBody className="p-5 flex flex-col gap-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-sky-400 -mb-2">{t.scenarios.briefingContext}</p>
        <p className="text-xs text-slate-300 leading-relaxed">{description}</p>

        <div className="flex flex-wrap gap-2 text-[11px] font-mono text-slate-300">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1">
            <Flame className="w-3 h-3 text-amber-400" aria-hidden="true" />
            {translateDifficulty(difficulty ?? "standard", language)}
          </span>
          {scenario && !isCustom && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/60 px-2 py-1">
              <Clock className="w-3 h-3 text-sky-400" aria-hidden="true" />
              {isSandbox ? t.flow.durationLabel(720, 30) : t.flow.durationLabel(scenario.duration_ticks, Math.ceil(scenario.duration_ticks / 24))}
            </span>
          )}
        </div>

        {scenario && !isSandbox && !isCustom && scenario.objectives.length > 0 && (
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">{t.scenarios.briefingObjectives}</h3>
            <ul className="flex flex-col gap-1">
              {scenario.objectives.map((o) => (
                <li key={o.id} className="flex items-start gap-1.5 text-xs text-slate-300">
                  {o.done ? (
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" aria-hidden="true" />
                  ) : (
                    <Circle className="w-3.5 h-3.5 mt-0.5 text-slate-500 shrink-0" aria-hidden="true" />
                  )}
                  <span>{translateObjective(o.id, o.description, language)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isSandbox && (
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">{t.scenarios.briefingObjectives}</h3>
            <ul className="flex flex-col gap-1">
              {t.flow.sandboxObjectives.map((o) => (
                <li key={o} className="flex items-start gap-1.5 text-xs text-slate-300">
                  <Circle className="w-3.5 h-3.5 mt-0.5 text-slate-500 shrink-0" aria-hidden="true" />
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <button
          ref={beginRef}
          type="button"
          onClick={handleBegin}
          className="flex items-center justify-center gap-2 px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm transition-colors duration-fast"
        >
          <Rocket className="w-4 h-4" aria-hidden="true" />
          {t.scenarios.briefingBegin}
        </button>
      </ModalFooter>
    </Modal>
  );
}
