import {
  ArrowRight,
  Award,
  CheckCircle2,
  ChevronRight,
  Flame,
  RotateCcw,
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
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import {
  translateDifficulty,
  translateNextChallenge,
  translateObjective,
  translateOperatorRank,
  translateOutcome,
} from "../../i18n/dynamicContent";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useFlowStore } from "../../store/useFlowStore";
import { useGameStore } from "../../store/useGameStore";
import { DifficultyId, ScenarioObjective } from "../../types/game";
import { deriveRunPrestige, findPreviousBest, isNewPersonalRecord, rankProgress } from "../../utils/careerProgress";
import { DebriefStageId, planDebrief } from "../../utils/debriefTimeline";
import { gradeForSla, SlaGrade } from "../../utils/grading";
import { launchScenario } from "../../utils/launchFlow";
import {
  playDefeatSting,
  playStampSound,
  playSuccessSound,
  playUiConfirmSound,
  playUiHoverSound,
  playVictoryFanfare,
} from "../../utils/sound";
import ConfettiBurst from "../common/ConfettiBurst";
import Modal from "../common/Modal";
import { useDebriefData } from "../flow/useDebriefData";
import "../flow/flow.css";
import { scenarioName } from "../../utils/scenarioName";

// grade colours for the dark panel (the shared GRADE_TONE targets the old white letter paper)
const GRADE_DARK_TONE: Record<SlaGrade, string> = {
  S: "text-sky-300",
  A: "text-emerald-300",
  B: "text-amber-300",
  C: "text-rose-300",
};

const METRIC_COUNT = 5;

// number that counts up from zero once its tile is revealed; shows the final value when skipped
function CountUp({ value, active, skipped, format }: { value: number; active: boolean; skipped: boolean; format: (n: number) => string }) {
  const tween = useAnimatedNumber(active ? value : 0, 800);
  return <>{format(skipped ? value : tween)}</>;
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="rounded-xl border border-slate-800 bg-slate-800/20 p-4">
      <div className="h-3 w-1/3 rounded bg-slate-700/60 animate-pulse" />
      <div className="mt-3 h-8 rounded bg-slate-700/40 animate-pulse" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default function PostMatchDebriefModal() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const status = useGameStore((s) => s.telemetry.status);
  const tick = useGameStore((s) => s.telemetry.tick);
  const finalSla = useGameStore((s) => s.telemetry.sla_percentage);
  const finalBudget = useGameStore((s) => s.telemetry.budget);
  const finalTechDebt = useGameStore((s) => s.telemetry.tech_debt);
  const finalReputation = useGameStore((s) => s.telemetry.reputation);
  const difficulty: DifficultyId = useGameStore((s) => s.telemetry.difficulty) ?? "standard";
  const scenarioId = useGameStore((s) => s.telemetry.active_scenario?.scenario_id ?? null);
  const objectives = useGameStore((s) => s.telemetry.active_scenario?.objectives);
  const recentAudits = useGameStore((s) => s.telemetry.recent_audits);
  const activeCount = useGameStore((s) => s.telemetry.active_incidents.length);
  const unlockedCount = useGameStore((s) => s.telemetry.achievements_unlocked?.length ?? 0);
  const lifetimeFromTelemetry = useGameStore((s) => s.telemetry.prestige_points);
  const runAchievements = useFlowStore((s) => s.runAchievements);
  const openScenarioSelect = useGameStore((s) => s.openScenarioSelect);
  const openHallOfFame = useGameStore((s) => s.openHallOfFame);
  const reduced = useReducedMotion();

  const isVictory = status === "victory";
  const isScenarioDefeat = !isVictory && Boolean(scenarioId);
  const data = useDebriefData(isVictory);
  const [launching, setLaunching] = useState(false);
  const playAgainRef = useRef<HTMLButtonElement>(null);

  const objectiveList: ScenarioObjective[] = objectives ?? [];

  // ---- staged reveal -------------------------------------------------------------------------
  const plan = useMemo(
    () =>
      planDebrief({
        metricCount: METRIC_COUNT,
        objectiveCount: objectiveList.length,
        hasRecord: true,
        hasPrestige: true,
        hasAchievements: true,
        reduced,
      }),
    [objectiveList.length, reduced]
  );
  const [reached, setReached] = useState<Set<DebriefStageId>>(() => (reduced ? new Set(plan.steps.map((s) => s.id)) : new Set()));
  const [skipped, setSkipped] = useState(reduced);
  const done = reached.has("actions");

  useEffect(() => {
    if (plan.totalMs === 0) {
      setReached(new Set(plan.steps.map((s) => s.id)));
      setSkipped(true);
      return;
    }
    // the first stage waits a beat so the backdrop transition has a state to animate from
    const timers = plan.steps.map((step) =>
      setTimeout(() => setReached((prev) => new Set(prev).add(step.id)), Math.max(step.at, 40))
    );
    return () => timers.forEach(clearTimeout);
  }, [plan]);

  // any key or click skips straight to the final state
  const skipAll = () => {
    setSkipped(true);
    setReached(new Set(plan.steps.map((s) => s.id)));
  };
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      e.stopPropagation();
      skipAll();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // skipAll only closes over the stable plan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, plan]);

  const has = (id: DebriefStageId) => reached.has(id);

  // sounds: the result sting once, a stamp thud per stamp
  useEffect(() => {
    if (isVictory) playVictoryFanfare();
    else playDefeatSting();
  }, [isVictory]);
  const stampSeen = has("stamp");
  const gradeSeen = has("grade");
  useEffect(() => {
    if (stampSeen && !skipped) playStampSound();
  }, [stampSeen, skipped]);
  useEffect(() => {
    if (gradeSeen && !skipped) playStampSound();
  }, [gradeSeen, skipped]);

  // keyboard users land on "Play again" the moment the buttons appear
  useEffect(() => {
    if (done) playAgainRef.current?.focus({ preventScroll: true });
  }, [done]);

  // ---- derived run facts ----------------------------------------------------------------------
  const daysSurvived = Math.floor(tick / 24) + 1;
  const latestRecord = data.records[0];
  const auditResolved = (recentAudits || []).filter((a) => a.event_type === "INCIDENT_RESOLVED").length;
  const auditTriggered = (recentAudits || []).filter((a) => a.event_type === "INCIDENT_TRIGGERED").length;
  const fallbackTotal = Math.max(auditTriggered, auditResolved + activeCount);
  const resolvedIncidents = latestRecord?.incidents_resolved ?? auditResolved;
  const totalIncidents = latestRecord?.incidents_total ?? fallbackTotal;

  const previousBest = useMemo(() => findPreviousBest(data.records, scenarioId, difficulty), [data.records, scenarioId, difficulty]);
  const isNewRecord = isNewPersonalRecord(finalSla, isVictory, previousBest);
  const recordRevealed = has("record") && !data.loading && isNewRecord;
  useEffect(() => {
    if (recordRevealed && !skipped) playSuccessSound();
  }, [recordRevealed, skipped]);
  const slaDelta = previousBest ? finalSla - previousBest.final_sla_percentage : null;
  const grade = gradeForSla(finalSla);
  const runPrestige = deriveRunPrestige(latestRecord, data.summary, isVictory);

  const scenarioTitle = scenarioName(
    t,
    scenarioId,
    data.scenarios.find((s) => s.scenario_id === scenarioId)?.display_name
  );
  const recommended = data.summary?.recommended_challenge;

  const newAchievementNames = runAchievements.map((id) => data.achievements.find((a) => a.id === id)?.name ?? id);
  const totalAchievements = data.achievements.length;

  // ---- actions -------------------------------------------------------------------------------
  const handleLaunch = async (targetScenario: string | null, targetDifficulty: DifficultyId) => {
    setLaunching(true);
    const label = scenarioName(t, targetScenario);
    await launchScenario({ scenarioId: targetScenario, difficulty: targetDifficulty, label });
    setLaunching(false);
  };

  const tones = isVictory
    ? { icon: "bg-emerald-500/20 border-emerald-400 text-emerald-400", chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" }
    : isScenarioDefeat
    ? { icon: "bg-amber-500/20 border-amber-400 text-amber-400", chip: "border-amber-500/40 bg-amber-500/10 text-amber-300" }
    : { icon: "bg-rose-500/20 border-rose-500 text-rose-400", chip: "border-rose-500/40 bg-rose-500/10 text-rose-300" };
  const bannerBg = isVictory
    ? "bg-gradient-to-r from-emerald-950/80 via-slate-900 to-sky-950/60 border-emerald-500/40"
    : isScenarioDefeat
    ? "bg-gradient-to-r from-amber-950/80 via-slate-900 to-rose-950/60 border-amber-500/40"
    : "bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-950 border-rose-600/40";

  const reveal = (id: DebriefStageId, extra = "") => (has(id) ? extra : "invisible");
  const tileClass = () => (has("metrics") ? "animate-item-in" : "invisible");
  const tileStyle = (i: number) => ({ animationDelay: `${i * 90}ms` });

  const title = isVictory ? t.debrief.titleVictory : isScenarioDefeat ? t.debrief.titleDefeat : t.debrief.titleLiquidation;
  const resultStamp = isVictory ? t.flow.stampCertified : isScenarioDefeat ? t.debrief.stampBreached : t.debrief.stampLiquidated;

  const metric = (label: string, content: ReactNode, index: number, extra = "") => (
    <div className={`p-3 rounded-xl border border-slate-800 bg-slate-800/40 flex flex-col ${tileClass()} ${extra}`} style={tileStyle(index)}>
      <span className="text-[10px] font-semibold text-slate-400 uppercase">{label}</span>
      <span className="text-base font-bold font-mono mt-0.5">{content}</span>
    </div>
  );

  const slaTone = finalSla >= 99.9 ? "text-emerald-400" : finalSla >= 99.0 ? "text-sky-400" : "text-rose-400";
  const rpAfter = runPrestige ? rankProgress(runPrestige.after) : null;
  const rpBefore = runPrestige ? rankProgress(runPrestige.before) : null;
  const barBase = rpAfter && rpBefore ? (rpAfter.tier === rpBefore.tier ? rpBefore.fraction : 0) : 0;
  const barGain = rpAfter ? Math.max(0, rpAfter.fraction - barBase) : 0;

  return (
    <>
      {isVictory && has("grade") && !skipped && <ConfettiBurst />}
      <Modal
        open
        title={title}
        layer="system"
        size="xl"
        closeOnBackdrop={false}
        backdropClass={`transition-[background-color,backdrop-filter] duration-700 ${
          has("backdrop") ? "bg-slate-950/85 backdrop-blur-md backdrop-saturate-50" : "bg-slate-950/30 backdrop-blur-none backdrop-saturate-100"
        }`}
      >
        {/* any click skips the staged reveal */}
        <div onPointerDown={() => !done && skipAll()} className="flex flex-col flex-1 min-h-0">
          <p role="status" className="sr-only">
            {`${title}. ${scenarioTitle}. SLA ${finalSla.toFixed(2)}%. ${t.debrief.auditGrade} ${grade}.`}
          </p>

          {/* banner: pinned */}
          <div className={`p-5 md:p-6 border-b relative shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4 ${bannerBg}`}>
            <div className="flex items-center gap-4 min-w-0">
              <div
                className={`w-14 h-14 shrink-0 rounded-xl flex items-center justify-center border shadow-lg ${tones.icon}`}
              >
                {isVictory ? <Trophy className="w-8 h-8" aria-hidden="true" /> : isScenarioDefeat ? <ShieldAlert className="w-8 h-8" aria-hidden="true" /> : <Skull className="w-8 h-8" aria-hidden="true" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border ${tones.chip}`}>
                    {title}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 border border-slate-700 px-2 py-0.5 rounded-md bg-slate-800">
                    {translateDifficulty(difficulty, language)}
                  </span>
                </div>
                <h1 className="text-xl md:text-2xl font-black font-heading text-white mt-1 truncate">{scenarioTitle}</h1>
                <p className="text-xs text-slate-300 mt-0.5">
                  {isVictory ? t.debrief.subtitleVictory : isScenarioDefeat ? t.debrief.subtitleDefeat : t.debrief.subtitleLiquidation}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-start md:self-auto">
              {/* result stamp: slams in first */}
              <div
                aria-hidden="true"
                className={`flex items-center gap-1.5 rounded-lg border-4 px-3 py-1 ${
                  isVictory ? "border-emerald-500 text-emerald-300 bg-emerald-950/30" : "border-rose-500 text-rose-400 bg-rose-950/30"
                } ${has("stamp") ? "animate-stamp-in" : "invisible"}`}
              >
                <Stamp className="w-4 h-4" />
                <span className="font-extrabold text-xs tracking-wider uppercase">{resultStamp}</span>
              </div>
              {/* grade seal */}
              <div
                className={`w-20 h-20 rounded-full border-4 flex flex-col items-center justify-center bg-slate-900/60 ${GRADE_DARK_TONE[grade]} ${
                  has("grade") ? "animate-stamp-in" : "invisible"
                }`}
                style={{ borderColor: "currentColor" }}
              >
                <Award className="w-4 h-4" aria-hidden="true" />
                <span className="font-black text-2xl leading-none">{grade}</span>
                <span className="text-[8px] uppercase font-bold text-slate-400">{t.debrief.auditGrade}</span>
              </div>
            </div>
          </div>

          {/* body: the single scroll area */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6 flex flex-col gap-5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                {t.debrief.runSummary}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                {metric(
                  t.debrief.survivalDuration,
                  <span className="text-white">
                    <CountUp value={tick} active={has("metrics")} skipped={skipped} format={(n) => t.flow.ticksUnit(Math.round(n))} />{" "}
                    <span className="text-xs text-slate-400 font-normal">({daysSurvived}d)</span>
                  </span>,
                  0
                )}
                {metric(
                  t.debrief.finalSla,
                  <span className={slaTone}>
                    <CountUp value={finalSla} active={has("metrics")} skipped={skipped} format={(n) => `${n.toFixed(2)}%`} />
                  </span>,
                  1
                )}
                {metric(
                  t.debrief.remainingBudget,
                  <span className={finalBudget > 0 ? "text-slate-100" : "text-rose-400"}>
                    <CountUp value={Math.max(0, finalBudget)} active={has("metrics")} skipped={skipped} format={(n) => `$${Math.round(n).toLocaleString()}`} />
                  </span>,
                  2
                )}
                {metric(
                  `${t.debrief.techDebt} / ${t.debrief.reputation}`,
                  <span className="text-slate-100">
                    TDI <CountUp value={finalTechDebt} active={has("metrics")} skipped={skipped} format={(n) => String(Math.round(n))} /> ·{" "}
                    <span className="text-xs text-sky-400">
                      <CountUp value={finalReputation} active={has("metrics")} skipped={skipped} format={(n) => String(Math.round(n))} />
                    </span>
                  </span>,
                  3
                )}
                {metric(
                  t.debrief.incidentsResolved,
                  <span className="text-emerald-400">
                    <CountUp value={resolvedIncidents} active={has("metrics")} skipped={skipped} format={(n) => String(Math.round(n))} />
                    {totalIncidents !== null && <span className="text-xs text-slate-400 font-normal"> / {totalIncidents}</span>}
                  </span>,
                  4,
                  "col-span-2 md:col-span-1"
                )}
              </div>
            </div>

            {objectiveList.length > 0 && (
              <div className={`rounded-xl border border-slate-800 bg-slate-800/30 p-4 ${reveal("objectives")}`}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2.5 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Target className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    {t.debrief.scenarioObjectives}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    {t.debrief.completedCount(objectiveList.filter((o) => o.done).length, objectiveList.length)}
                  </span>
                </h3>
                <ul className="flex flex-col gap-2">
                  {objectiveList.map((obj, i) => (
                    <li
                      key={obj.id}
                      style={{ animationDelay: `${i * 140}ms` }}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-xs font-medium ${has("objectives") ? "animate-item-in" : ""} ${
                        obj.done ? "border-emerald-500/30 bg-emerald-950/20 text-emerald-200" : "border-rose-500/30 bg-rose-950/20 text-rose-300"
                      }`}
                    >
                      <span
                        className={has("objectives") ? "animate-badge-bump" : ""}
                        style={{ animationDelay: `${i * 140 + 180}ms` }}
                      >
                        {obj.done ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />}
                      </span>
                      <span className="flex-1">{translateObjective(obj.id, obj.description, language)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* comparison with the previous best */}
            {!has("record") ? (
              <div className="invisible h-16" aria-hidden="true" />
            ) : data.loading ? (
              <SectionSkeleton label={t.flow.comparisonLoading} />
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4 animate-item-in">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                    {t.debrief.comparisonHeader}
                  </h3>
                  {isNewRecord && (
                    <span className="flow-record-glint px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-500/20 border border-amber-400 text-amber-300 flex items-center gap-1">
                      <Flame className="w-3 h-3 text-amber-400" aria-hidden="true" />
                      {t.flow.newRecord}
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
                        {slaDelta !== null && Math.abs(slaDelta) >= 0.005 && (
                          <span className={`text-[10px] font-bold flex items-center ${slaDelta > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {slaDelta > 0 ? <TrendingUp className="w-3 h-3 mr-0.5" aria-hidden="true" /> : <TrendingDown className="w-3 h-3 mr-0.5" aria-hidden="true" />}
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
                          <span className={`text-[10px] font-bold ${daysSurvived > previousBest.days_survived ? "text-emerald-400" : "text-rose-400"}`}>
                            {daysSurvived > previousBest.days_survived ? "+" : ""}
                            {daysSurvived - previousBest.days_survived}d
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
                        <span className="text-slate-500 text-[10px]">({translateDifficulty(previousBest.difficulty ?? "standard", language)})</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic py-1">{t.debrief.firstRunRecord}</p>
                )}
              </div>
            )}

            {/* career progression: prestige earned this run counts into the rank bar */}
            {!has("prestige") ? (
              <div className="invisible h-24" aria-hidden="true" />
            ) : data.loading ? (
              <SectionSkeleton label={t.flow.loading} />
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4 animate-item-in">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Award className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                    {t.debrief.careerProgression}
                  </span>
                  {data.summary && (
                    <span className="text-xs font-bold text-amber-400 border border-amber-500/30 bg-amber-950/30 px-2 py-0.5 rounded-full">
                      {translateOperatorRank(data.summary.operator_rank_key, data.summary.operator_rank, language)}
                    </span>
                  )}
                </h3>

                {runPrestige && rpAfter ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between text-xs font-mono">
                      <span className="font-bold text-amber-300">
                        <CountUp value={runPrestige.earned} active={has("prestige")} skipped={skipped} format={(n) => t.flow.prestigeEarnedRun(Math.round(n))} />
                      </span>
                      <span className="text-slate-400">
                        {runPrestige.after}
                        {rpAfter.next !== null ? ` / ${rpAfter.next}` : ""} pts
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={rpAfter.next ?? runPrestige.after}
                      aria-valuenow={runPrestige.after}
                      className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-800"
                    >
                      <div className="absolute inset-y-0 left-0 bg-amber-700/80" style={{ width: `${barBase * 100}%` }} />
                      <div
                        className="flow-bar-fill absolute inset-y-0 bg-gradient-to-r from-amber-400 to-yellow-300"
                        style={{ left: `${barBase * 100}%`, width: `${barGain * 100}%`, animationDelay: "250ms" }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-500">{rpAfter.next === null ? t.flow.topRankReached : t.flow.nextRankAt(rpAfter.next)}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">{t.flow.prestigeUnavailable}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-mono text-slate-300">
                  <span>
                    <span className="text-slate-500">{t.debrief.totalRunsLabel}</span> <b className="text-white">{data.summary?.total_runs ?? 1}</b>
                  </span>
                  <span>
                    <span className="text-slate-500">{t.debrief.victoriesLabel}</span> <b className="text-emerald-400">{data.summary?.victories ?? (isVictory ? 1 : 0)}</b>
                  </span>
                  <span>
                    <span className="text-slate-500">{t.debrief.lifetimePrestigeLabel}</span>{" "}
                    <b className="text-amber-400">{data.summary?.lifetime_prestige ?? lifetimeFromTelemetry} pts</b>
                  </span>
                </div>
              </div>
            )}

            {/* achievements */}
            {!has("achievements") ? (
              <div className="invisible h-16" aria-hidden="true" />
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-800/30 p-4 animate-item-in">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center justify-between gap-2">
                  <span>{t.flow.newAchievementsHeader}</span>
                  {totalAchievements > 0 && <span className="text-[10px] font-mono text-slate-400">{t.flow.achievementsProgress(unlockedCount, totalAchievements)}</span>}
                </h3>
                {newAchievementNames.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {newAchievementNames.map((name) => (
                      <li key={name} className="flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-950/30 px-2.5 py-1 text-xs font-semibold text-amber-200">
                        <Award className="w-3 h-3 text-amber-400" aria-hidden="true" />
                        {name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">{t.flow.noNewAchievements}</p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    playUiConfirmSound();
                    openHallOfFame();
                  }}
                  className="mt-3 text-xs text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1"
                >
                  {t.debrief.viewCareerRecord}
                  <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            {done && recommended && (() => {
              const copy = translateNextChallenge(recommended, language);
              return (
                <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-4 flex flex-col gap-2 animate-item-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5" aria-hidden="true" />
                      {t.debrief.nextChallengeHeader}
                    </span>
                    <span className="text-[10px] font-mono border border-sky-500/30 px-2 py-0.5 rounded text-sky-300 bg-sky-900/40">
                      {translateDifficulty(recommended.difficulty, language)}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white">{copy.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{copy.description}</p>
                  {recommended.target_achievement_name && (
                    <div className="text-[11px] text-amber-300/90 font-medium">{t.debrief.targetGoal(recommended.target_achievement_name)}</div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* actions: pinned, revealed last */}
          <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/80 shrink-0 flex flex-wrap items-center justify-between gap-3">
            {done ? (
              <>
                <button
                  type="button"
                  onMouseEnter={playUiHoverSound}
                  onClick={() => {
                    playUiConfirmSound();
                    openScenarioSelect();
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:border-slate-500 bg-slate-800 text-xs font-bold text-slate-300 hover:text-white transition-colors duration-fast"
                >
                  {t.debrief.selectAnotherScenario}
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  {recommended && (
                    <button
                      type="button"
                      onMouseEnter={playUiHoverSound}
                      onClick={() => handleLaunch(recommended.scenario_id, recommended.difficulty)}
                      disabled={launching}
                      className="px-4 py-2 rounded-xl text-xs font-bold border border-sky-500 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 transition-colors duration-fast flex items-center gap-1.5 disabled:opacity-60"
                    >
                      {t.debrief.acceptChallenge}
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    ref={playAgainRef}
                    type="button"
                    onMouseEnter={playUiHoverSound}
                    onClick={() => handleLaunch(scenarioId, difficulty)}
                    disabled={launching}
                    className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-colors duration-fast flex items-center gap-2 shadow-lg disabled:opacity-60 ${
                      isVictory ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/50" : "bg-slate-700 hover:bg-slate-600 shadow-slate-950/50"
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                    {t.debrief.playAgain}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-[11px] text-slate-500 mx-auto" aria-hidden="true">
                {t.flow.skipHint}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
