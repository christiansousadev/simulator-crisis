import {
  AlertTriangle,
  Beaker,
  Flame,
  Globe2,
  Lock,
  LucideIcon,
  Shield,
  ShieldAlert,
  Target,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { ScenarioIdKey } from "../../i18n/translations";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { CareerRecord, DifficultyId, ScenarioCatalogEntry } from "../../types/game";
import { launchScenario } from "../../utils/launchFlow";
import { playUiConfirmSound, playUiHoverSound } from "../../utils/sound";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";
import Spinner from "../common/Spinner";

const DIFFICULTY_IDS: DifficultyId[] = ["intern", "standard", "chaos"];

const SCENARIO_ICONS: Partial<Record<string, LucideIcon>> = {
  black_friday_rush: Zap,
  ransomware_infiltration: ShieldAlert,
  chaos_engineering_drill: AlertTriangle,
};

// numeric parameters mirror the backend difficulty presets; the words around them are translated
const DIFFICULTY_CONFIG: Record<DifficultyId, { budget: string; hazard: string; hazardColor: string }> = {
  intern: { budget: "$320k (+28%)", hazard: "0.7x (-30%)", hazardColor: "text-emerald-400" },
  standard: { budget: "$250k", hazard: "1.0x", hazardColor: "text-sky-400" },
  chaos: { budget: "$180k (-28%)", hazard: "1.4x (+40%)", hazardColor: "text-rose-400" },
};

export default function ScenarioSelectModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.scenarioSelectOpen);
  const closeScenarioSelect = useGameStore((s) => s.closeScenarioSelect);
  const openScenarioBuilder = useGameStore((s) => s.openScenarioBuilder);

  const [catalog, setCatalog] = useState<ScenarioCatalogEntry[]>([]);
  const [sandboxBest, setSandboxBest] = useState<CareerRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyId>("standard");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([api.getScenarioCatalog().catch(() => []), api.getCareerRecords("recorded_at", "sandbox").catch(() => [])])
      .then(([entries, sandboxRecords]) => {
        if (cancelled) return;
        setCatalog(entries);
        if (sandboxRecords && sandboxRecords.length > 0) {
          const best = sandboxRecords.reduce((prev, curr) => {
            if (curr.outcome === "victory" && prev.outcome !== "victory") return curr;
            if (curr.outcome !== "victory" && prev.outcome === "victory") return prev;
            return curr.final_sla_percentage > prev.final_sla_percentage ? curr : prev;
          }, sandboxRecords[0]);
          setSandboxBest(best);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleLaunch = async (scenarioId: string | undefined, label: string) => {
    setLaunching(scenarioId ?? "sandbox");
    await launchScenario({ scenarioId, difficulty, label });
    setLaunching(null);
  };

  const sandboxName = t.scenarios.sandbox;

  return (
    <Modal open={open} onClose={closeScenarioSelect} title={t.scenarios.selectModeTitle} size="xl" layer="system">
      <ModalHeader
        title={t.scenarios.selectModeTitle}
        onClose={closeScenarioSelect}
        closeLabel={t.common.close}
        icon={<Shield className="w-4 h-4 text-sky-400" aria-hidden="true" />}
      />

      {/* difficulty stays pinned; only the scenario grid scrolls */}
      <div className="px-5 pt-3 pb-3 shrink-0 border-b border-slate-800 bg-slate-900/40">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h3 id="difficulty-heading" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            {t.difficulty.label} — {t.flow.difficultyHeading}
          </h3>
          <span className="text-[10px] font-mono text-slate-500">{t.flow.difficultyHint}</span>
        </div>

        <div role="radiogroup" aria-labelledby="difficulty-heading" className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {DIFFICULTY_IDS.map((id) => {
            const cfg = DIFFICULTY_CONFIG[id];
            const isSelected = difficulty === id;
            const cascade = id === "intern" ? t.flow.cascadeLow : id === "standard" ? t.flow.cascadeModerate : t.flow.cascadeSevere;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onMouseEnter={playUiHoverSound}
                onClick={() => {
                  playUiConfirmSound();
                  setDifficulty(id);
                }}
                className={`p-3 rounded-xl border text-left transition-colors duration-fast ${
                  isSelected
                    ? "border-sky-500 bg-sky-500/15 shadow-md shadow-sky-950/40 ring-1 ring-sky-500/50"
                    : "border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-xs font-bold uppercase ${isSelected ? "text-sky-300" : "text-slate-300"}`}>{t.difficulty[id]}</span>
                </div>
                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                  <div>
                    <span className="text-slate-500 block text-[9px]">{t.difficulty.budgetDim}</span>
                    <span className="font-semibold text-slate-200">{cfg.budget}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">{t.difficulty.incidentRateDim}</span>
                    <span className={`font-semibold ${cfg.hazardColor}`}>{cfg.hazard}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px]">{t.difficulty.cascadeDim}</span>
                    <span className="font-semibold text-slate-300">{cascade}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <ModalBody className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ScenarioCard
            name={sandboxName}
            description={t.scenarios.sandboxDescription}
            durationLabel={t.flow.durationLabel(720, 30)}
            objectives={t.flow.sandboxObjectives}
            specialConditions={t.flow.sandboxConditions}
            icon={Globe2}
            unlocked
            unlockRequirement={null}
            bestRecord={
              sandboxBest
                ? {
                    sla: sandboxBest.final_sla_percentage,
                    outcome: sandboxBest.outcome,
                    difficulty: (sandboxBest.difficulty ?? "standard").toUpperCase(),
                  }
                : null
            }
            launching={launching === "sandbox"}
            busy={launching !== null}
            onLaunch={() => handleLaunch(undefined, sandboxName)}
          />

          {catalog.map((entry) => {
            const key = entry.scenario_id as ScenarioIdKey;
            const name = t.scenarios.names[key] ?? entry.display_name;
            // our own translation wins over the backend's English copy where we have one
            const description = t.scenarios.descriptions[key] || entry.description || "";
            const objectives =
              entry.objectives && entry.objectives.length > 0
                ? entry.objectives
                : [t.scenarios.victoryRequirements[key] || t.flow.surviveWindow];
            return (
              <ScenarioCard
                key={entry.scenario_id}
                name={name}
                description={description}
                durationLabel={t.flow.durationLabel(entry.duration_ticks, Math.ceil(entry.duration_ticks / 24))}
                objectives={objectives}
                specialConditions={entry.special_conditions ?? []}
                icon={SCENARIO_ICONS[entry.scenario_id] ?? Zap}
                unlocked={entry.unlocked !== false}
                unlockRequirement={entry.unlock_requirement ?? null}
                bestRecord={
                  entry.best_record
                    ? {
                        sla: entry.best_record.final_sla_percentage,
                        outcome: entry.best_record.outcome,
                        difficulty: entry.best_record.difficulty.toUpperCase(),
                      }
                    : null
                }
                launching={launching === entry.scenario_id}
                busy={launching !== null}
                onLaunch={() => handleLaunch(entry.scenario_id, name)}
              />
            );
          })}

          {loading && catalog.length === 0 && (
            <>
              <div aria-hidden="true" className="h-56 rounded-2xl border border-slate-800 bg-slate-800/30 animate-pulse" />
              <div className="col-span-full flex justify-center">
                <Spinner label={t.flow.loading} />
              </div>
            </>
          )}
        </div>
      </ModalBody>

      <ModalFooter className="justify-between">
        <button
          type="button"
          onClick={openScenarioBuilder}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold hover:bg-slate-800 transition-colors duration-fast"
        >
          <Beaker className="w-3.5 h-3.5" aria-hidden="true" />
          {t.scenarioBuilder.openBuilder}
        </button>

        <span className="text-[11px] text-slate-500 font-mono">
          {t.flow.activeDifficulty}: <strong className="text-slate-300 font-bold uppercase">{t.difficulty[difficulty]}</strong>
        </span>
      </ModalFooter>
    </Modal>
  );
}

interface ScenarioCardProps {
  name: string;
  description: string;
  durationLabel: string;
  objectives: string[];
  specialConditions: string[];
  icon: LucideIcon;
  unlocked: boolean;
  unlockRequirement: string | null;
  bestRecord: { sla: number; outcome: string; difficulty: string } | null;
  launching: boolean;
  // any launch in flight: every card's button waits
  busy: boolean;
  onLaunch: () => void;
}

function ScenarioCard({
  name,
  description,
  durationLabel,
  objectives,
  specialConditions,
  icon: Icon,
  unlocked,
  unlockRequirement,
  bestRecord,
  launching,
  busy,
  onLaunch,
}: ScenarioCardProps) {
  const t = useTranslation();
  return (
    <div
      className={`rounded-2xl border p-5 flex flex-col gap-3.5 transition-colors duration-base ${
        unlocked
          ? "border-slate-800 bg-slate-800/40 hover:border-sky-500/50 hover:bg-slate-800/60"
          : "border-slate-800/60 bg-slate-900/60 opacity-75"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl border ${
              unlocked ? "border-sky-500/30 bg-sky-500/10 text-sky-400" : "border-slate-700 bg-slate-800 text-slate-500"
            }`}
          >
            <Icon className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-heading text-white">{name}</h3>
            <span className="text-[10px] text-slate-400 font-mono">{durationLabel}</span>
          </div>
        </div>

        {!unlocked ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-500/30 bg-amber-950/30 text-amber-400 flex items-center gap-1">
            <Lock className="w-3 h-3" aria-hidden="true" />
            {t.scenarios.locked}
          </span>
        ) : bestRecord ? (
          <span
            className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${
              bestRecord.outcome === "victory"
                ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300"
                : "border-slate-700 bg-slate-800 text-slate-400"
            }`}
          >
            {t.flow.bestLabel(bestRecord.sla, bestRecord.difficulty)}
          </span>
        ) : null}
      </div>

      <p className="text-xs text-slate-300 leading-relaxed">{description}</p>

      {objectives.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5 flex flex-col gap-1.5">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Target className="w-3 h-3 text-sky-400" aria-hidden="true" />
            {t.scenarios.objectives}
          </span>
          <ul className="flex flex-col gap-1 text-[11px] text-slate-300">
            {objectives.map((obj) => (
              <li key={obj} className="flex items-start gap-1.5">
                <span aria-hidden="true" className="w-1 h-1 mt-1.5 rounded-full bg-sky-400 shrink-0" />
                <span>{obj}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {specialConditions.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5 flex flex-col gap-1.5">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-400/90 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" aria-hidden="true" />
            {t.scenarios.specialConditions}
          </span>
          <ul className="flex flex-col gap-1 text-[10px] text-slate-400">
            {specialConditions.map((cond) => (
              <li key={cond} className="flex items-start gap-1.5">
                <span aria-hidden="true" className="w-1 h-1 mt-1.5 rounded-full bg-amber-400 shrink-0" />
                <span>{cond}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!unlocked && unlockRequirement && (
        <div className="text-[10px] text-amber-300/90 border border-amber-500/20 bg-amber-950/20 p-2 rounded-lg flex items-center gap-1.5">
          <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span>{unlockRequirement}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onLaunch}
        onMouseEnter={playUiHoverSound}
        disabled={!unlocked || busy}
        aria-label={unlocked ? `${t.scenarios.launch}: ${name}` : `${t.scenarios.locked}: ${name}`}
        className={`mt-auto px-4 py-2 rounded-xl text-xs font-bold transition-colors duration-fast flex items-center justify-center gap-2 ${
          unlocked
            ? "bg-sky-500 hover:bg-sky-400 text-white shadow-md shadow-sky-950/40 disabled:opacity-60"
            : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
        }`}
      >
        {unlocked ? (launching ? t.flow.launching : t.scenarios.launch) : t.scenarios.locked}
      </button>
    </div>
  );
}
