import {
  AlertTriangle,
  Award,
  Beaker,
  CheckCircle2,
  DollarSign,
  Flame,
  Globe2,
  Lock,
  LucideIcon,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Target,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { ScenarioIdKey } from "../../i18n/translations";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { CareerRecord, DifficultyId, DifficultyPresetInfo, ScenarioCatalogEntry } from "../../types/game";
import { playCashSound, playClickSound } from "../../utils/sound";
import Spinner from "../common/Spinner";

const DIFFICULTY_IDS: DifficultyId[] = ["intern", "standard", "chaos"];

const SCENARIO_ICONS: Record<ScenarioIdKey, LucideIcon> = {
  black_friday_rush: Zap,
  ransomware_infiltration: ShieldAlert,
  chaos_engineering_drill: AlertTriangle,
};

const DIFFICULTY_CONFIG: Record<
  DifficultyId,
  {
    budget: string;
    hazard: string;
    cascade: string;
    hazardColor: string;
  }
> = {
  intern: {
    budget: "$320k (+28%)",
    hazard: "0.7x (-30%)",
    cascade: "Low",
    hazardColor: "text-emerald-400",
  },
  standard: {
    budget: "$250k (Baseline)",
    hazard: "1.0x (Baseline)",
    cascade: "Moderate",
    hazardColor: "text-sky-400",
  },
  chaos: {
    budget: "$180k (-28%)",
    hazard: "1.4x (+40%)",
    cascade: "Severe",
    hazardColor: "text-rose-400",
  },
};

export default function ScenarioSelectModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.scenarioSelectOpen);
  const closeScenarioSelect = useGameStore((s) => s.closeScenarioSelect);
  const openScenarioBuilder = useGameStore((s) => s.openScenarioBuilder);
  const openScenarioBriefing = useGameStore((s) => s.openScenarioBriefing);

  const [catalog, setCatalog] = useState<ScenarioCatalogEntry[]>([]);
  const [sandboxBest, setSandboxBest] = useState<CareerRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyId>("standard");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.getScenarioCatalog().catch(() => []),
      api.getCareerRecords("recorded_at", "sandbox").catch(() => []),
    ])
      .then(([entries, sandboxRecords]) => {
        if (!cancelled) {
          setCatalog(entries);
          if (sandboxRecords && sandboxRecords.length > 0) {
            const best = sandboxRecords.reduce((prev, curr) => {
              if (curr.outcome === "victory" && prev.outcome !== "victory") return curr;
              if (curr.outcome !== "victory" && prev.outcome === "victory") return prev;
              return curr.final_sla_percentage > prev.final_sla_percentage ? curr : prev;
            }, sandboxRecords[0]);
            setSandboxBest(best);
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const handleLaunch = async (scenarioId?: string) => {
    playClickSound();
    setLaunching(scenarioId ?? "sandbox");
    try {
      await api.resetSimulation(scenarioId, difficulty);
      playCashSound();
      try {
        const active = await api.getActiveScenario();
        if (
          active.active &&
          active.scenario_id &&
          active.elapsed_ticks !== undefined &&
          active.duration_ticks !== undefined
        ) {
          openScenarioBriefing({
            scenario_id: active.scenario_id,
            elapsed_ticks: active.elapsed_ticks,
            duration_ticks: active.duration_ticks,
            completed: active.completed ?? false,
            outcome: active.outcome ?? null,
            objectives: active.objectives ?? [],
          });
        }
      } catch {
        // best-effort briefing
      }
    } catch {
      // socket reconciles
    } finally {
      setLaunching(null);
      closeScenarioSelect();
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-backdrop-in">
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-modal-in">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div>
            <h2 className="text-base font-extrabold font-heading text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-sky-400" />
              {t.scenarios.selectModeTitle}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{t.scenarios.selectModeSubtitle}</p>
          </div>
          <button
            onClick={closeScenarioSelect}
            className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title={t.common.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* DIFFICULTY SELECTOR WITH REAL BACKEND IMPACT METRICS */}
        <div className="px-6 pt-4 pb-2 shrink-0 border-b border-slate-800 bg-slate-900/40">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              {t.difficulty.label} — Simulation Operating Parameters
            </h3>
            <span className="text-[10px] font-mono text-slate-500">
              Affects starting budget runway & spontaneous incident rate
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {DIFFICULTY_IDS.map((id) => {
              const cfg = DIFFICULTY_CONFIG[id];
              const isSelected = difficulty === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    playClickSound();
                    setDifficulty(id);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? "border-sky-500 bg-sky-500/15 shadow-md shadow-sky-950/40 ring-1 ring-sky-500/50"
                      : "border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-xs font-bold uppercase ${
                        isSelected ? "text-sky-300" : "text-slate-300"
                      }`}
                    >
                      {t.difficulty[id]}
                    </span>
                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                        isSelected
                          ? "border-sky-400/40 bg-sky-950/60 text-sky-300"
                          : "border-slate-700 bg-slate-800 text-slate-400"
                      }`}
                    >
                      {id.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                    <div>
                      <span className="text-slate-500 block text-[9px]">Capital</span>
                      <span className="font-semibold text-slate-200">{cfg.budget}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">Failure Rate</span>
                      <span className={`font-semibold ${cfg.hazardColor}`}>{cfg.hazard}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">Cascade</span>
                      <span className="font-semibold text-slate-300">{cfg.cascade}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* SCENARIOS GRID */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* SANDBOX CARD */}
            <ScenarioCard
              name={t.scenarios.sandbox}
              description={t.scenarios.sandboxDescription}
              durationLabel="720 ticks (30 in-game days)"
              objectives={[
                "Survive full 720-tick monthly operational audit",
                "Maintain SLA at or above 99.0% threshold",
                "Maintain fiscal solvency (Runway > $0)",
              ]}
              specialConditions={[
                "Standard operational failure hazard model",
                "Randomized CAB dilemma proposals every 45-80 ticks",
                "Quiet periods grant gradual technical debt relief",
              ]}
              icon={Globe2}
              unlocked={true}
              unlockRequirement={null}
              bestRecord={
                sandboxBest
                  ? {
                      sla: sandboxBest.final_sla_percentage,
                      days: sandboxBest.days_survived,
                      outcome: sandboxBest.outcome,
                      difficulty: (sandboxBest.difficulty ?? "standard").toUpperCase(),
                    }
                  : null
              }
              launchLabel={t.scenarios.launch}
              launching={launching === "sandbox"}
              onLaunch={() => handleLaunch(undefined)}
            />

            {/* SCRIPTED SCENARIOS FROM BACKEND CATALOG */}
            {catalog.map((entry) => {
              const key = entry.scenario_id as ScenarioIdKey;
              const name = t.scenarios.names[key] ?? entry.display_name;
              const description = entry.description || t.scenarios.descriptions[key] || "";
              const objectives =
                entry.objectives && entry.objectives.length > 0
                  ? entry.objectives
                  : [t.scenarios.victoryRequirements[key] || "Survive scenario window"];
              const specialConditions = entry.special_conditions ?? [];
              const isUnlocked = entry.unlocked !== false;

              const bestRec = entry.best_record
                ? {
                    sla: entry.best_record.final_sla_percentage,
                    days: entry.best_record.days_survived,
                    outcome: entry.best_record.outcome,
                    difficulty: entry.best_record.difficulty.toUpperCase(),
                  }
                : null;

              return (
                <ScenarioCard
                  key={entry.scenario_id}
                  name={name}
                  description={description}
                  durationLabel={`${entry.duration_ticks} ticks (${Math.ceil(entry.duration_ticks / 24)}d window)`}
                  objectives={objectives}
                  specialConditions={specialConditions}
                  icon={SCENARIO_ICONS[key] ?? Zap}
                  unlocked={isUnlocked}
                  unlockRequirement={entry.unlock_requirement ?? null}
                  bestRecord={bestRec}
                  launchLabel={t.scenarios.launch}
                  launching={launching === entry.scenario_id}
                  onLaunch={() => handleLaunch(entry.scenario_id)}
                />
              );
            })}

            {loading && catalog.length === 0 && (
              <div className="col-span-full py-12 flex justify-center">
                <Spinner />
              </div>
            )}
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 shrink-0 flex items-center justify-between gap-4">
          <button
            onClick={openScenarioBuilder}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:text-slate-200 text-xs font-semibold hover:bg-slate-800 transition-colors"
          >
            <Beaker className="w-3.5 h-3.5" />
            {t.scenarioBuilder.openBuilder}
          </button>

          <span className="text-[11px] text-slate-500 font-mono">
            Active Difficulty: <strong className="text-slate-300 font-bold uppercase">{difficulty}</strong>
          </span>
        </div>
      </div>
    </div>
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
  bestRecord: {
    sla: number;
    days: number;
    outcome: string;
    difficulty: string;
  } | null;
  launchLabel: string;
  launching: boolean;
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
  launchLabel,
  launching,
  onLaunch,
}: ScenarioCardProps) {
  return (
    <div
      className={`rounded-2xl border p-5 flex flex-col gap-3.5 transition-all ${
        unlocked
          ? "border-slate-800 bg-slate-800/40 hover:border-sky-500/50 hover:bg-slate-800/60"
          : "border-slate-800/60 bg-slate-900/60 opacity-75"
      }`}
    >
      {/* CARD HEADER */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl border ${
              unlocked
                ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
                : "border-slate-700 bg-slate-800 text-slate-500"
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold font-heading text-white">{name}</h3>
            <span className="text-[10px] text-slate-400 font-mono">{durationLabel}</span>
          </div>
        </div>

        {/* Lock or Status pill */}
        {!unlocked ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-500/30 bg-amber-950/30 text-amber-400 flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Locked
          </span>
        ) : bestRecord ? (
          <span
            className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold border ${
              bestRecord.outcome === "victory"
                ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300"
                : "border-slate-700 bg-slate-800 text-slate-400"
            }`}
          >
            Best: {bestRecord.sla.toFixed(1)}% ({bestRecord.difficulty})
          </span>
        ) : null}
      </div>

      {/* DESCRIPTION */}
      <p className="text-xs text-slate-300 leading-relaxed">{description}</p>

      {/* CORE OBJECTIVES */}
      {objectives.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5 flex flex-col gap-1.5">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <Target className="w-3 h-3 text-sky-400" />
            Objectives
          </span>
          <ul className="flex flex-col gap-1 text-[11px] text-slate-300">
            {objectives.map((obj, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-sky-400 shrink-0" />
                <span className="truncate">{obj}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SPECIAL CONDITIONS */}
      {specialConditions.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2.5 flex flex-col gap-1.5">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-amber-400/90 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Special Conditions
          </span>
          <ul className="flex flex-col gap-1 text-[10px] text-slate-400">
            {specialConditions.map((cond, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                <span>{cond}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* UNLOCK REQUIREMENT NOTICE IF LOCKED */}
      {!unlocked && unlockRequirement && (
        <div className="text-[10px] text-amber-300/90 border border-amber-500/20 bg-amber-950/20 p-2 rounded-lg flex items-center gap-1.5">
          <Lock className="w-3 h-3 shrink-0" />
          <span>{unlockRequirement}</span>
        </div>
      )}

      {/* ACTION BUTTON */}
      <button
        onClick={onLaunch}
        disabled={!unlocked || launching}
        className={`mt-auto px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
          unlocked
            ? "bg-sky-500 hover:bg-sky-400 text-white shadow-md shadow-sky-950/40"
            : "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
        }`}
      >
        {unlocked ? launchLabel : "Locked"}
      </button>
    </div>
  );
}
