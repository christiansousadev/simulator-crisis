import { AlertTriangle, Beaker, LucideIcon, ShieldAlert, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { ScenarioIdKey } from "../../i18n/translations";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { DifficultyId, ScenarioCatalogEntry } from "../../types/game";
import { playCashSound, playClickSound } from "../../utils/sound";
import Spinner from "../common/Spinner";

const DIFFICULTY_IDS: DifficultyId[] = ["intern", "standard", "chaos"];

const SCENARIO_ICONS: Record<ScenarioIdKey, LucideIcon> = {
  black_friday_rush: Zap,
  ransomware_infiltration: ShieldAlert,
  chaos_engineering_drill: AlertTriangle,
};

// FULL-SCREEN GAME MODE PICKER: SANDBOX PLUS EVERY SCRIPTED SCENARIO FROM THE BACKEND CATALOG
export default function ScenarioSelectModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.scenarioSelectOpen);
  const closeScenarioSelect = useGameStore((s) => s.closeScenarioSelect);
  const openScenarioBuilder = useGameStore((s) => s.openScenarioBuilder);
  const [catalog, setCatalog] = useState<ScenarioCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyId>("standard");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    api
      .getScenarioCatalog()
      .then((entries) => {
        if (!cancelled) setCatalog(entries);
      })
      .catch(() => {
        if (!cancelled) setCatalog([]);
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
    } catch {
      // best-effort; the next telemetry frame reconciles the actual engine state
    } finally {
      setLaunching(null);
      closeScenarioSelect();
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-backdrop-in">
      <div className="w-full max-w-3xl max-h-[85vh] rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-modal-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 bg-slate-800/60 shrink-0">
          <div>
            <h2 className="text-base font-extrabold font-heading text-white">{t.scenarios.selectModeTitle}</h2>
            <p className="text-xs text-slate-400 mt-0.5">{t.scenarios.selectModeSubtitle}</p>
          </div>
          <button onClick={closeScenarioSelect} className="text-slate-400 hover:text-slate-100 transition-colors" title={t.common.close}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-4 shrink-0">
          <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">{t.difficulty.label}</h3>
          <div className="grid grid-cols-3 gap-2">
            {DIFFICULTY_IDS.map((id) => (
              <button
                key={id}
                onClick={() => {
                  playClickSound();
                  setDifficulty(id);
                }}
                title={
                  id === "intern"
                    ? t.difficulty.internDescription
                    : id === "chaos"
                      ? t.difficulty.chaosDescription
                      : t.difficulty.standardDescription
                }
                className={`px-2 py-2 rounded-lg border text-xs font-bold transition-colors ${
                  difficulty === id
                    ? "border-sky-500 bg-sky-500/15 text-sky-300"
                    : "border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600"
                }`}
              >
                {t.difficulty[id]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* sandbox is always available and is not part of the backend scenario registry */}
            <ScenarioCard
              name={t.scenarios.sandbox}
              description={t.scenarios.sandboxDescription}
              victoryRequirement={t.scenarios.sandboxVictoryRequirement}
              durationLabel={t.scenarios.unlimitedDuration}
              icon={undefined}
              launchLabel={t.scenarios.launch}
              launching={launching === "sandbox"}
              onLaunch={() => handleLaunch(undefined)}
            />

            {catalog.map((entry) => {
              const key = entry.scenario_id as ScenarioIdKey;
              const name = t.scenarios.names[key] ?? entry.display_name;
              const description = t.scenarios.descriptions[key] ?? "";
              const victoryRequirement = t.scenarios.victoryRequirements[key] ?? "";
              return (
                <ScenarioCard
                  key={entry.scenario_id}
                  name={name}
                  description={description}
                  victoryRequirement={victoryRequirement}
                  durationLabel={t.scenarios.durationTicks(entry.duration_ticks)}
                  icon={SCENARIO_ICONS[key]}
                  launchLabel={t.scenarios.launch}
                  launching={launching === entry.scenario_id}
                  onLaunch={() => handleLaunch(entry.scenario_id)}
                />
              );
            })}

            {loading && catalog.length === 0 && (
              <div className="col-span-full">
                <Spinner />
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-700 shrink-0">
          <button
            onClick={openScenarioBuilder}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-dashed border-slate-600 text-slate-300 text-xs font-bold hover:bg-slate-800 transition-colors"
          >
            <Beaker className="w-3.5 h-3.5" />
            {t.scenarioBuilder.openBuilder}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ScenarioCardProps {
  name: string;
  description: string;
  victoryRequirement: string;
  durationLabel: string;
  icon: LucideIcon | undefined;
  launchLabel: string;
  launching: boolean;
  onLaunch: () => void;
}

// ONE SELECTABLE GAME MODE CARD: NARRATIVE, DURATION AND VICTORY REQUIREMENT
function ScenarioCard({ name, description, victoryRequirement, durationLabel, icon: Icon, launchLabel, launching, onLaunch }: ScenarioCardProps) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 flex flex-col gap-3 hover:border-sky-500/50 transition-colors">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-sky-400" />}
        <h3 className="text-sm font-bold font-heading text-white">{name}</h3>
      </div>
      <p className="text-xs text-slate-300 leading-relaxed flex-1">{description}</p>
      <div className="text-[10px] text-slate-400 font-mono">{durationLabel}</div>
      <div className="text-[11px] text-amber-300/90 border-t border-slate-700 pt-2">
        {victoryRequirement}
      </div>
      <button
        onClick={onLaunch}
        disabled={launching}
        className="mt-1 px-3 py-1.5 rounded-md text-xs font-bold bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
      >
        {launchLabel}
      </button>
    </div>
  );
}
