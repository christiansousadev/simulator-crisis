import {
  AlertTriangle,
  Award,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Globe2,
  Lock,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Target,
  Trophy,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { ScenarioIdKey } from "../../i18n/translations";
import {
  translateDifficulty,
  translateObjective,
  translateOperatorRank,
  translateOutcome,
} from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { CareerRecord, CareerSummary } from "../../types/game";
import { playClickSound } from "../../utils/sound";
import Spinner from "../common/Spinner";

type LeaderboardScope = "mine" | "global";
type OrderByMode = "recorded_at" | "days_survived" | "sla";

export default function HallOfFameModal() {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const open = useGameStore((s) => s.hallOfFameOpen);
  const close = useGameStore((s) => s.closeHallOfFame);

  const [scope, setScope] = useState<LeaderboardScope>("mine");
  const [orderBy, setOrderBy] = useState<OrderByMode>("recorded_at");
  const [selectedScenario, setSelectedScenario] = useState<string>("all");
  const [records, setRecords] = useState<CareerRecord[]>([]);
  const [careerSummary, setCareerSummary] = useState<CareerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    const scenarioFilter = selectedScenario === "all" ? undefined : selectedScenario;

    const fetcher =
      scope === "global"
        ? () => api.getGlobalCareerRecords(orderBy === "recorded_at" ? "days_survived" : orderBy)
        : () => api.getCareerRecords(orderBy, scenarioFilter);

    Promise.all([
      fetcher().catch(() => []),
      api.getCareerSummary().catch(() => null),
    ])
      .then(([recs, summary]) => {
        if (!cancelled) {
          setRecords(recs);
          setCareerSummary(summary);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, scope, orderBy, selectedScenario]);

  if (!open) return null;

  const toggleExpand = (id: string) => {
    playClickSound();
    setExpandedRecordId((prev) => (prev === id ? null : id));
  };

  const scenarioOptions = [
    { id: "all", label: t.hallOfFame.allScenarios },
    { id: "sandbox", label: t.hallOfFame.sandbox },
    { id: "black_friday_rush", label: t.scenarios.names.black_friday_rush },
    { id: "chaos_engineering_drill", label: t.scenarios.names.chaos_engineering_drill },
    { id: "ransomware_infiltration", label: t.scenarios.names.ransomware_infiltration },
  ];

  return (
    <div
      className="fixed inset-0 z-[92] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 md:p-6 animate-backdrop-in"
      onClick={close}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold font-heading text-white">
                {t.hallOfFame.title}
              </h2>
              {careerSummary && (
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="font-bold text-amber-400">
                    {translateOperatorRank(careerSummary.operator_rank_key, careerSummary.operator_rank, language)}
                  </span> ·{" "}
                  {careerSummary.lifetime_prestige} Prestige · {careerSummary.total_runs} Runs
                </p>
              )}
            </div>
          </div>
          <button
            onClick={close}
            className="text-slate-400 hover:text-slate-100 p-1 rounded-lg hover:bg-slate-800 transition-colors"
            title={t.common.close}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* TABS & FILTERS */}
        <div className="px-6 pt-3 pb-3 border-b border-slate-800 bg-slate-900/40 shrink-0 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* Scope segmented buttons */}
            <div className="flex gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              <button
                onClick={() => {
                  playClickSound();
                  setScope("mine");
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  scope === "mine"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                {t.hallOfFame.myRecords}
              </button>
              <button
                onClick={() => {
                  playClickSound();
                  setScope("global");
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  scope === "global"
                    ? "bg-sky-500 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Globe2 className="w-3.5 h-3.5" />
                {t.hallOfFame.global}
              </button>
            </div>

            {/* Sort order buttons */}
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs">
              <button
                onClick={() => {
                  playClickSound();
                  setOrderBy("recorded_at");
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  orderBy === "recorded_at"
                    ? "bg-slate-700 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.hallOfFame.recentRuns}
              </button>
              <button
                onClick={() => {
                  playClickSound();
                  setOrderBy("days_survived");
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  orderBy === "days_survived"
                    ? "bg-slate-700 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.hallOfFame.rankings}
              </button>
            </div>
          </div>

          {/* Scenario Filter Pills */}
          {scope === "mine" && (
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
              <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              {scenarioOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    playClickSound();
                    setSelectedScenario(opt.id);
                  }}
                  className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors border ${
                    selectedScenario === opt.id
                      ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                      : "border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RECORDS LIST */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading && (
            <div className="py-12 flex justify-center">
              <Spinner />
            </div>
          )}

          {!loading && records.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center gap-2.5 py-12">
              <Trophy className="w-10 h-10 text-slate-700" />
              <p className="text-xs text-slate-400 max-w-xs">{t.hallOfFame.empty}</p>
            </div>
          )}

          <div className="flex flex-col gap-2.5">
            {records.map((r, i) => {
              const isExpanded = expandedRecordId === r.id;
              const isVictory = r.outcome === "victory";
              const isDefeat = r.outcome === "scenario_defeat";
              const diff = (r.difficulty ?? "standard").toUpperCase();

              // Date formatting
              let formattedDate = "";
              if (r.recorded_at) {
                try {
                  const d = new Date(r.recorded_at);
                  formattedDate = d.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                } catch {
                  formattedDate = r.recorded_at;
                }
              }

              return (
                <div
                  key={r.id}
                  className={`rounded-xl border transition-all ${
                    isExpanded
                      ? "border-slate-700 bg-slate-800/80 shadow-md"
                      : "border-slate-800/80 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/60"
                  }`}
                >
                  {/* MAIN ROW */}
                  <div
                    onClick={() => toggleExpand(r.id)}
                    className="flex items-center gap-3 p-3 cursor-pointer select-none"
                  >
                    <span className="text-xs font-mono font-bold text-slate-500 w-6 shrink-0 text-center">
                      #{i + 1}
                    </span>

                    {/* Outcome Icon */}
                    <div
                      className={`p-1.5 rounded-lg border shrink-0 ${
                        isVictory
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : isDefeat
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {isVictory ? (
                        <Award className="w-4 h-4" />
                      ) : isDefeat ? (
                        <ShieldAlert className="w-4 h-4" />
                      ) : (
                        <Skull className="w-4 h-4" />
                      )}
                    </div>

                    {/* Scenario + Summary */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-white truncate">
                          {r.scenario_id
                            ? (t.scenarios.names[r.scenario_id as ScenarioIdKey] ?? r.scenario_id.replace(/_/g, " ").toUpperCase())
                            : t.hallOfFame.sandbox.toUpperCase()}
                        </p>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border border-slate-700 bg-slate-900 text-slate-400">
                          {translateDifficulty(r.difficulty ?? "standard", language)}
                        </span>
                        {formattedDate && (
                          <span className="text-[10px] text-slate-500 font-mono hidden md:inline">
                            · {formattedDate}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400 mt-0.5">
                        <span
                          className={
                            r.final_sla_percentage >= 99.9
                              ? "text-emerald-400 font-bold"
                              : r.final_sla_percentage >= 99.0
                              ? "text-sky-400 font-bold"
                              : "text-rose-400 font-bold"
                          }
                        >
                          SLA {r.final_sla_percentage.toFixed(2)}%
                        </span>
                        <span>·</span>
                        <span>{t.hallOfFame.daysSurvived(r.days_survived)}</span>
                        <span>·</span>
                        <span>${r.final_budget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        {scope === "global" && (
                          <span className="text-slate-500 hidden sm:inline">
                            · {t.hallOfFame.anonymousPlayer(r.player_id.slice(0, 6))}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Prestige Pill */}
                    <span className="text-xs font-bold text-amber-400 font-mono shrink-0">
                      +{r.prestige_earned} pts
                    </span>

                    {/* Expand arrow */}
                    <button className="text-slate-500 hover:text-slate-300 p-1">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* EXPANDED DETAILS (Consolidated CareerRecord) */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-slate-700/60 bg-slate-900/60 flex flex-col gap-3 text-xs">
                      {/* Metric Breakdown Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono">
                        <div className="p-2 rounded-lg border border-slate-800 bg-slate-800/30">
                          <span className="text-[9px] text-slate-400 uppercase block">{t.hallOfFame.outcomeLabel}</span>
                          <span
                            className={`font-bold ${
                              isVictory
                                ? "text-emerald-400"
                                : isDefeat
                                ? "text-amber-400"
                                : "text-rose-400"
                            }`}
                          >
                            {translateOutcome(r.outcome, language)}
                          </span>
                        </div>

                        <div className="p-2 rounded-lg border border-slate-800 bg-slate-800/30">
                          <span className="text-[9px] text-slate-400 uppercase block">{t.hallOfFame.techDebtRepLabel}</span>
                          <span className="font-bold text-slate-200">
                            TDI {r.final_tech_debt ?? "—"} · Rep {r.final_reputation?.toFixed(0) ?? "—"}
                          </span>
                        </div>

                        <div className="p-2 rounded-lg border border-slate-800 bg-slate-800/30">
                          <span className="text-[9px] text-slate-400 uppercase block">{t.hallOfFame.incidentsLabel}</span>
                          <span className="font-bold text-slate-200">
                            {t.hallOfFame.resolvedOfTotal(r.incidents_resolved ?? 0, r.incidents_total ?? 0)}
                          </span>
                        </div>

                        <div className="p-2 rounded-lg border border-slate-800 bg-slate-800/30">
                          <span className="text-[9px] text-slate-400 uppercase block">{t.hallOfFame.recordedAtLabel}</span>
                          <span className="font-bold text-slate-300 text-[10px] truncate block">
                            {formattedDate || "Recorded"}
                          </span>
                        </div>
                      </div>

                      {/* Objectives Checklist if present in this CareerRecord */}
                      {r.objectives && r.objectives.length > 0 && (
                        <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1.5 flex items-center gap-1">
                            <Target className="w-3 h-3 text-sky-400" />
                            {t.hallOfFame.objectivesSnapshot}
                          </span>
                          <div className="flex flex-col gap-1">
                            {r.objectives.map((obj) => (
                              <div
                                key={obj.id}
                                className={`flex items-center gap-2 text-[11px] ${
                                  obj.done ? "text-emerald-300" : "text-rose-300"
                                }`}
                              >
                                {obj.done ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                )}
                                <span>{translateObjective(obj.id, obj.description, language)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
