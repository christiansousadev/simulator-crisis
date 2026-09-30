import {
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronRight,
  Flame,
  Globe2,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Stamp,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import {
  translateDifficulty,
  translateNextChallenge,
  translateObjective,
  translateOperatorRank,
  translateOutcome,
} from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import {
  CareerRecord,
  CareerSummary,
  DifficultyId,
  ScenarioCatalogEntry,
  ScenarioObjective,
} from "../../types/game";
import { GRADE_TONE, gradeForSla } from "../../utils/grading";
import { playCashSound, playClickSound, playDefeatSting, playVictoryFanfare } from "../../utils/sound";
import ConfettiBurst from "../common/ConfettiBurst";
import Spinner from "../common/Spinner";

export default function PostMatchDebriefModal() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const telemetry = useGameStore((s) => s.telemetry);
  const status = telemetry.status;
  const isVictory = status === "victory";
  const isScenarioDefeat = !isVictory && Boolean(telemetry.active_scenario);

  const openScenarioSelect = useGameStore((s) => s.openScenarioSelect);
  const openHallOfFame = useGameStore((s) => s.openHallOfFame);

  const [loading, setLoading] = useState(true);
  const [careerRecords, setCareerRecords] = useState<CareerRecord[]>([]);
  const [careerSummary, setCareerSummary] = useState<CareerSummary | null>(null);
  const [scenarioCatalog, setScenarioCatalog] = useState<ScenarioCatalogEntry[]>([]);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (isVictory) {
      playVictoryFanfare();
    } else {
      playDefeatSting();
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      api.getCareerRecords("recorded_at").catch(() => []),
      api.getCareerSummary().catch(() => null),
      api.getScenarioCatalog().catch(() => []),
    ])
      .then(([records, summary, catalog]) => {
        if (!cancelled) {
          setCareerRecords(records);
          setCareerSummary(summary);
          setScenarioCatalog(catalog);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isVictory]);

  // Current run's recorded or active state
  const scenarioId = telemetry.active_scenario?.scenario_id ?? null;
  const difficulty: DifficultyId = telemetry.difficulty ?? "standard";
  const tick = telemetry.tick;
  const daysSurvived = Math.floor(tick / 24) + 1;
  const finalSla = telemetry.sla_percentage;
  const finalBudget = telemetry.budget;
  const finalTechDebt = telemetry.tech_debt;
  const finalReputation = telemetry.reputation;
  const objectives = telemetry.active_scenario?.objectives ?? [];

  const latestRecord = careerRecords[0];
  const auditResolved = (telemetry.recent_audits || []).filter(
    (a) => a.event_type === "INCIDENT_RESOLVED"
  ).length;
  const auditTriggered = (telemetry.recent_audits || []).filter(
    (a) => a.event_type === "INCIDENT_TRIGGERED"
  ).length;
  const activeCount = (telemetry.active_incidents || []).length;
  const fallbackTotal = Math.max(auditTriggered, auditResolved + activeCount);

  const resolvedIncidentsCount = latestRecord?.incidents_resolved ?? auditResolved;
  const totalIncidentsCount = latestRecord?.incidents_total ?? fallbackTotal;

  // Find previous best run for this scenario & difficulty (excluding the record just saved)
  const previousBest = useMemo(() => {
    if (careerRecords.length <= 1) return null;
    const candidates = careerRecords.slice(1).filter((r) => {
      const matchSc = scenarioId ? r.scenario_id === scenarioId : r.scenario_id === null;
      const matchDiff = (r.difficulty ?? "standard") === difficulty;
      return matchSc && matchDiff;
    });
    if (candidates.length === 0) return null;
    return candidates.reduce((best, curr) => {
      if (curr.outcome === "victory" && best.outcome !== "victory") return curr;
      if (curr.outcome !== "victory" && best.outcome === "victory") return best;
      if (curr.final_sla_percentage > best.final_sla_percentage) return curr;
      if (curr.days_survived > best.days_survived) return curr;
      return best;
    }, candidates[0]);
  }, [careerRecords, scenarioId, difficulty]);

  // Derived achievements from this run or recent progression
  const unlockedAchievementIds = telemetry.achievements_unlocked ?? [];

  // Grade
  const grade = gradeForSla(finalSla);
  const gradeTone = GRADE_TONE[grade];

  const handleRestart = async (targetScenarioId?: string | null, targetDifficulty?: DifficultyId) => {
    playClickSound();
    setLaunching(true);
    try {
      await api.resetSimulation(
        targetScenarioId === null ? undefined : targetScenarioId,
        targetDifficulty ?? difficulty
      );
      playCashSound();
    } catch {
      // Reconciled by socket tick
    } finally {
      setLaunching(false);
    }
  };

  const handleSelectAnother = () => {
    playClickSound();
    openScenarioSelect();
  };

  const handleOpenCareer = () => {
    playClickSound();
    openHallOfFame();
  };

  const scenarioMeta = scenarioCatalog.find((s) => s.scenario_id === scenarioId);
  const scenarioDisplayName = scenarioId
    ? scenarioMeta?.display_name ?? scenarioId
    : t.scenarios.sandbox;

  // Comparison metrics with previous best
  const slaDelta = previousBest ? finalSla - previousBest.final_sla_percentage : null;
  const budgetDelta = previousBest ? finalBudget - previousBest.final_budget : null;
  const isNewRecord = Boolean(previousBest && (slaDelta !== null && slaDelta > 0.05 || (isVictory && previousBest.outcome !== "victory")));

  const recommended = careerSummary?.recommended_challenge;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 md:p-6 overflow-y-auto animate-backdrop-in">
      {isVictory && <ConfettiBurst />}

      <div className="w-full max-w-3xl my-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col animate-modal-in">
        {/* TOP BANNER */}
        <div
          className={`p-6 border-b relative flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            isVictory
              ? "bg-gradient-to-r from-emerald-950/80 via-slate-900 to-sky-950/60 border-emerald-500/40"
              : isScenarioDefeat
              ? "bg-gradient-to-r from-amber-950/80 via-slate-900 to-rose-950/60 border-amber-500/40"
              : "bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-950 border-rose-600/40"
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-xl flex items-center justify-center border shadow-lg ${
                isVictory
                  ? "bg-emerald-500/20 border-emerald-400 text-emerald-400"
                  : isScenarioDefeat
                  ? "bg-amber-500/20 border-amber-400 text-amber-400"
                  : "bg-rose-500/20 border-rose-500 text-rose-400"
              }`}
            >
              {isVictory ? (
                <Trophy className="w-8 h-8 animate-pulse" />
              ) : isScenarioDefeat ? (
                <ShieldAlert className="w-8 h-8" />
              ) : (
                <Skull className="w-8 h-8" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                    isVictory
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : isScenarioDefeat
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  }`}
                >
                  {isVictory
                    ? t.debrief.titleVictory
                    : isScenarioDefeat
                    ? t.debrief.titleDefeat
                    : t.debrief.titleLiquidation}
                </span>
                <span className="text-[10px] font-mono text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md bg-slate-800">
                  {translateDifficulty(difficulty, language)}
                </span>
              </div>

              <h1 className="text-xl md:text-2xl font-black font-heading text-white mt-1">
                {scenarioDisplayName}
              </h1>

              <p className="text-xs text-slate-300 mt-0.5">
                {isVictory
                  ? t.debrief.subtitleVictory
                  : isScenarioDefeat
                  ? t.debrief.subtitleDefeat
                  : t.debrief.subtitleLiquidation}
              </p>
            </div>
          </div>

          {/* Grade or Stamp badge */}
          {isVictory ? (
            <div
              className={`self-start md:self-auto border-2 rounded-xl px-4 py-2 flex items-center gap-2.5 bg-slate-900/60 shadow-inner ${gradeTone}`}
              style={{ borderColor: "currentColor" }}
            >
              <Award className="w-6 h-6" />
              <div>
                <span className="block text-[10px] uppercase font-bold text-slate-400">{t.debrief.auditGrade}</span>
                <span className="block font-black text-2xl leading-none">{grade}</span>
              </div>
            </div>
          ) : (
            <div className="self-start md:self-auto rotate-[-4deg] border-2 border-rose-500 text-rose-400 rounded-lg px-3 py-1 flex items-center gap-1.5 bg-rose-950/30">
              <Stamp className="w-4 h-4" />
              <span className="font-extrabold text-xs tracking-wider uppercase">
                {isScenarioDefeat ? t.debrief.stampBreached : t.debrief.stampLiquidated}
              </span>
            </div>
          )}
        </div>

        {/* BODY CONTENT */}
        <div className="p-5 md:p-6 flex flex-col gap-6 max-h-[60vh] overflow-y-auto">
          {/* 1. METRICS GRID */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              {t.debrief.runSummary}
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-800/40 flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">
                  {t.debrief.survivalDuration}
                </span>
                <span className="text-base font-bold font-mono text-white mt-0.5">
                  {tick} ticks <span className="text-xs text-slate-400 font-normal">({daysSurvived}d)</span>
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-800/40 flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">
                  {t.debrief.finalSla}
                </span>
                <span
                  className={`text-base font-bold font-mono mt-0.5 ${
                    finalSla >= 99.9
                      ? "text-emerald-400"
                      : finalSla >= 99.0
                      ? "text-sky-400"
                      : "text-rose-400"
                  }`}
                >
                  {finalSla.toFixed(2)}%
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-800/40 flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">
                  {t.debrief.remainingBudget}
                </span>
                <span
                  className={`text-base font-bold font-mono mt-0.5 ${
                    finalBudget > 0 ? "text-slate-100" : "text-rose-400"
                  }`}
                >
                  ${Math.max(0, finalBudget).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-800/40 flex flex-col">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">
                  {t.debrief.techDebt} / Rep
                </span>
                <span className="text-base font-bold font-mono text-slate-100 mt-0.5">
                  TDI {finalTechDebt} · <span className="text-xs text-sky-400">{finalReputation.toFixed(0)}</span>
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-800 bg-slate-800/40 flex flex-col col-span-2 md:col-span-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">
                  {t.debrief.incidentsResolved}
                </span>
                <span className="text-base font-bold font-mono text-emerald-400 mt-0.5">
                  {resolvedIncidentsCount}
                  {totalIncidentsCount !== null && (
                    <span className="text-xs text-slate-400 font-normal"> / {totalIncidentsCount}</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* 2. OBJECTIVES CHECKLIST (IF SCENARIO HAS THEM) */}
          {objectives.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  {t.debrief.scenarioObjectives}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {t.debrief.completedCount(objectives.filter((o) => o.done).length, objectives.length)}
                </span>
              </h3>

              <div className="flex flex-col gap-2">
                {objectives.map((obj: ScenarioObjective) => (
                  <div
                    key={obj.id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-medium ${
                      obj.done
                        ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200"
                        : "border-rose-500/30 bg-rose-950/20 text-rose-300"
                    }`}
                  >
                    {obj.done ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="flex-1">{translateObjective(obj.id, obj.description, language)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. COMPARISON WITH PERSONAL BEST */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                {t.debrief.comparisonHeader}
              </h3>
              {isNewRecord && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 border border-amber-400 text-amber-300 flex items-center gap-1 animate-pulse">
                  <Flame className="w-3 h-3 text-amber-400" />
                  {t.debrief.newPersonalBest}
                </span>
              )}
            </div>

            {previousBest ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                <div className="p-2.5 rounded-lg border border-slate-700/60 bg-slate-900/60">
                  <span className="text-[10px] text-slate-400 uppercase block">{t.debrief.slaVsPriorBest}</span>
                  <div className="flex items-center gap-1.5 mt-0.5 font-mono text-xs">
                    <span className="font-bold text-white">{finalSla.toFixed(2)}%</span>
                    <span className="text-slate-500 text-[10px]">vs {previousBest.final_sla_percentage.toFixed(2)}%</span>
                    {slaDelta !== null && slaDelta !== 0 && (
                      <span
                        className={`text-[10px] font-bold flex items-center ${
                          slaDelta > 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {slaDelta > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                        {slaDelta > 0 ? `+${slaDelta.toFixed(2)}%` : `${slaDelta.toFixed(2)}%`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-700/60 bg-slate-900/60">
                  <span className="text-[10px] text-slate-400 uppercase block">{t.debrief.survivalVsPriorBest}</span>
                  <div className="flex items-center gap-1.5 mt-0.5 font-mono text-xs">
                    <span className="font-bold text-white">{daysSurvived}d</span>
                    <span className="text-slate-500 text-[10px]">vs {previousBest.days_survived}d</span>
                    {daysSurvived !== previousBest.days_survived && (
                      <span
                        className={`text-[10px] font-bold flex items-center ${
                          daysSurvived > previousBest.days_survived ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {daysSurvived > previousBest.days_survived ? `+${daysSurvived - previousBest.days_survived}d` : `${daysSurvived - previousBest.days_survived}d`}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-slate-700/60 bg-slate-900/60">
                  <span className="text-[10px] text-slate-400 uppercase block">{t.debrief.priorOutcome}</span>
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs font-semibold">
                    <span className={previousBest.outcome === "victory" ? "text-emerald-400" : "text-rose-400"}>
                      {translateOutcome(previousBest.outcome, language)}
                    </span>
                    <span className="text-slate-500 text-[10px]">
                      ({translateDifficulty(previousBest.difficulty ?? "standard", language)})
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic py-1">
                {t.debrief.firstRunRecord}
              </p>
            )}
          </div>

          {/* 4. CAREER PROGRESSION & OPERATOR RANK */}
          <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                {t.debrief.careerProgression}
              </span>
              {careerSummary && (
                <span className="text-xs font-bold text-amber-400 border border-amber-500/30 bg-amber-950/30 px-2 py-0.5 rounded-full">
                  {translateOperatorRank(careerSummary.operator_rank_key, careerSummary.operator_rank, language)}
                </span>
              )}
            </h3>

            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-300">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">{t.debrief.totalRunsLabel}</span>
                <span className="font-bold text-white">{careerSummary?.total_runs ?? 1}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">{t.debrief.victoriesLabel}</span>
                <span className="font-bold text-emerald-400">{careerSummary?.victories ?? (isVictory ? 1 : 0)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500">{t.debrief.lifetimePrestigeLabel}</span>
                <span className="font-bold text-amber-400">{careerSummary?.lifetime_prestige ?? telemetry.prestige_points} pts</span>
              </div>
            </div>

            {/* Unlocked achievements badge */}
            <div className="mt-3 border-t border-slate-700/60 pt-2.5 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                {t.debrief.achievementsUnlockedCount(unlockedAchievementIds.length, 12)}
              </span>
              <button
                onClick={handleOpenCareer}
                className="text-xs text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
              >
                {t.debrief.viewCareerRecord}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 5. RECOMMENDED NEXT CHALLENGE */}
          {recommended && (() => {
            const challengeCopy = translateNextChallenge(recommended, language);
            return (
              <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />
                    {t.debrief.nextChallengeHeader}
                  </span>
                  <span className="text-[10px] font-mono border border-sky-500/30 px-2 py-0.5 rounded text-sky-300 bg-sky-900/40">
                    {translateDifficulty(recommended.difficulty, language)}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-white">{challengeCopy.title}</h4>
                <p className="text-xs text-slate-300 leading-relaxed">{challengeCopy.description}</p>

                {recommended.target_achievement_name && (
                  <div className="text-[11px] text-amber-300/90 font-medium">
                    {t.debrief.targetGoal(recommended.target_achievement_name)}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="p-4 md:p-5 border-t border-slate-800 bg-slate-900/80 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={handleSelectAnother}
            className="px-4 py-2 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white transition-colors"
          >
            {t.debrief.selectAnotherScenario}
          </button>

          <div className="flex items-center gap-2">
            {recommended && (
              <button
                onClick={() => handleRestart(recommended.scenario_id, recommended.difficulty)}
                disabled={launching}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-sky-500 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 transition-colors flex items-center gap-1.5"
              >
                <span>{t.debrief.acceptChallenge}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={() => handleRestart(scenarioId, difficulty)}
              disabled={launching}
              className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-colors flex items-center gap-2 shadow-lg ${
                isVictory
                  ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50"
                  : "bg-slate-700 hover:bg-slate-600 shadow-slate-950/50"
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t.debrief.playAgain}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
