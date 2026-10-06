import {
  Award,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Filter,
  Globe2,
  RefreshCw,
  ShieldAlert,
  Skull,
  Target,
  Trophy,
  User,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import {
  translateDifficulty,
  translateObjective,
  translateOperatorRank,
  translateOutcome,
} from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { CareerRecord, CareerSummary } from "../../types/game";
import { playUiConfirmSound, playUiHoverSound } from "../../utils/sound";
import Modal, { ModalBody, ModalHeader } from "../common/Modal";
import Spinner from "../common/Spinner";
import { scenarioName } from "../../utils/scenarioName";

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
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    const scenarioFilter = selectedScenario === "all" ? undefined : selectedScenario;

    const fetcher =
      scope === "global"
        ? () => api.getGlobalCareerRecords(orderBy === "recorded_at" ? "days_survived" : orderBy)
        : () => api.getCareerRecords(orderBy, scenarioFilter);

    Promise.all([fetcher().then((recs) => ({ recs, ok: true })).catch(() => ({ recs: [] as CareerRecord[], ok: false })), api.getCareerSummary().catch(() => null)])
      .then(([result, summary]) => {
        if (!cancelled) {
          setRecords(result.recs);
          setFailed(!result.ok);
          setCareerSummary(summary);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, scope, orderBy, selectedScenario, reloadSeq]);

  const toggleExpand = (id: string) => {
    playUiConfirmSound();
    setExpandedRecordId((prev) => (prev === id ? null : id));
  };

  const scenarioOptions = [
    { id: "all", label: t.hallOfFame.allScenarios },
    { id: "sandbox", label: t.hallOfFame.sandbox },
    { id: "black_friday_rush", label: t.scenarios.names.black_friday_rush },
    { id: "chaos_engineering_drill", label: t.scenarios.names.chaos_engineering_drill },
    { id: "ransomware_infiltration", label: t.scenarios.names.ransomware_infiltration },
  ];

  const segment = (active: boolean, tone: "sky" | "slate") =>
    `px-2.5 py-1 rounded-lg text-xs font-bold transition-colors duration-fast ${
      active ? (tone === "sky" ? "bg-sky-500 text-white shadow-sm" : "bg-slate-700 text-white shadow-sm") : "text-slate-400 hover:text-slate-200"
    }`;

  return (
    <Modal open={open} onClose={close} title={t.hallOfFame.title} size="xl" layer="system">
      <ModalHeader
        title={t.hallOfFame.title}
        onClose={close}
        closeLabel={t.common.close}
        icon={
          <div className="p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            <Award className="w-5 h-5" aria-hidden="true" />
          </div>
        }
      >
        {careerSummary && (
          <span className="hidden sm:inline text-xs text-slate-400 truncate">
            <span className="font-bold text-amber-400">
              {translateOperatorRank(careerSummary.operator_rank_key, careerSummary.operator_rank, language)}
            </span>{" "}
            · {careerSummary.lifetime_prestige} {t.flow.prestige} · {careerSummary.total_runs} {t.flow.runs}
          </span>
        )}
      </ModalHeader>

      {/* tabs and filters stay put; only the record list scrolls */}
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/40 shrink-0 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div role="group" aria-label={t.flow.scopeLabel} className="flex gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button type="button" aria-pressed={scope === "mine"} onClick={() => setScope("mine")} className={`flex items-center gap-1.5 ${segment(scope === "mine", "sky")}`}>
              <User className="w-3.5 h-3.5" aria-hidden="true" />
              {t.hallOfFame.myRecords}
            </button>
            <button type="button" aria-pressed={scope === "global"} onClick={() => setScope("global")} className={`flex items-center gap-1.5 ${segment(scope === "global", "sky")}`}>
              <Globe2 className="w-3.5 h-3.5" aria-hidden="true" />
              {t.hallOfFame.global}
            </button>
          </div>

          <div role="group" aria-label={t.flow.sortLabel} className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
            <button type="button" aria-pressed={orderBy === "recorded_at"} onClick={() => setOrderBy("recorded_at")} className={segment(orderBy === "recorded_at", "slate")}>
              {t.hallOfFame.recentRuns}
            </button>
            <button type="button" aria-pressed={orderBy === "days_survived"} onClick={() => setOrderBy("days_survived")} className={segment(orderBy === "days_survived", "slate")}>
              {t.hallOfFame.rankings}
            </button>
          </div>
        </div>

        {scope === "mine" && (
          <div role="group" aria-label={t.hallOfFame.filterScenario} className="flex items-center gap-1.5 overflow-x-auto py-0.5 no-scrollbar">
            <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
            {scenarioOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={selectedScenario === opt.id}
                onClick={() => setSelectedScenario(opt.id)}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors duration-fast border ${
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

      <ModalBody className="p-4 md:p-5 min-h-[14rem]">
        <div aria-live="polite" aria-busy={loading}>
          {loading && (
            <div className="py-12 flex justify-center">
              <Spinner label={t.flow.loading} />
            </div>
          )}

          {!loading && failed && (
            <div className="flex flex-col items-center justify-center text-center gap-3 py-12">
              <ShieldAlert className="w-10 h-10 text-amber-500/70" aria-hidden="true" />
              <p className="text-xs text-slate-400 max-w-xs">{t.flow.loadFailed}</p>
              <button
                type="button"
                onClick={() => setReloadSeq((n) => n + 1)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-200 text-xs font-bold hover:bg-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                {t.flow.retry}
              </button>
            </div>
          )}

          {!loading && !failed && records.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center gap-2.5 py-12">
              <Trophy className="w-10 h-10 text-slate-700" aria-hidden="true" />
              <p className="text-xs text-slate-400 max-w-xs">{t.hallOfFame.empty}</p>
            </div>
          )}
        </div>

        {!loading && !failed && records.length > 0 && (
          <ol className="flex flex-col gap-2.5">
            {records.map((r, i) => {
              const isExpanded = expandedRecordId === r.id;
              const isVictory = r.outcome === "victory";
              const isDefeat = r.outcome === "scenario_defeat";

              let formattedDate = "";
              if (r.recorded_at) {
                try {
                  formattedDate = new Date(r.recorded_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                } catch {
                  formattedDate = r.recorded_at;
                }
              }
              const detailsId = `hof-details-${r.id}`;

              return (
                <li
                  key={r.id}
                  className={`rounded-xl border transition-colors duration-fast ${
                    isExpanded
                      ? "border-slate-700 bg-slate-800/80 shadow-md"
                      : "border-slate-800/80 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/60"
                  }`}
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={detailsId}
                    onMouseEnter={playUiHoverSound}
                    onClick={() => toggleExpand(r.id)}
                    className="w-full flex items-center gap-3 p-3 text-left rounded-xl"
                  >
                    <span className="text-xs font-mono font-bold text-slate-500 w-6 shrink-0 text-center">#{i + 1}</span>

                    <div
                      className={`p-1.5 rounded-lg border shrink-0 ${
                        isVictory
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                          : isDefeat
                          ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                      }`}
                    >
                      {isVictory ? <Award className="w-4 h-4" aria-hidden="true" /> : isDefeat ? <ShieldAlert className="w-4 h-4" aria-hidden="true" /> : <Skull className="w-4 h-4" aria-hidden="true" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-white truncate">
                          {r.scenario_id ? scenarioName(t, r.scenario_id).toUpperCase() : t.hallOfFame.sandbox.toUpperCase()}
                        </p>
                        <span className="text-[9px] font-mono px-1.5 rounded border border-slate-700 bg-slate-900 text-slate-400">
                          {translateDifficulty(r.difficulty ?? "standard", language)}
                        </span>
                        {formattedDate && <span className="text-[10px] text-slate-500 font-mono hidden md:inline">· {formattedDate}</span>}
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
                          <span className="text-slate-500 hidden sm:inline">· {t.hallOfFame.anonymousPlayer(r.player_id.slice(0, 6))}</span>
                        )}
                      </div>
                    </div>

                    <span className="text-xs font-bold text-amber-400 font-mono shrink-0">+{r.prestige_earned} pts</span>
                    <span className="text-slate-500 p-1" aria-hidden="true">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div id={detailsId} className="px-4 pb-4 pt-2 border-t border-slate-700/60 bg-slate-900/60 flex flex-col gap-3 text-xs rounded-b-xl animate-panel-in">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono">
                        <div className="p-2 rounded-lg border border-slate-800 bg-slate-800/30">
                          <span className="text-[9px] text-slate-400 uppercase block">{t.hallOfFame.outcomeLabel}</span>
                          <span className={`font-bold ${isVictory ? "text-emerald-400" : isDefeat ? "text-amber-400" : "text-rose-400"}`}>
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
                          <span className="font-bold text-slate-200">{t.hallOfFame.resolvedOfTotal(r.incidents_resolved ?? 0, r.incidents_total ?? 0)}</span>
                        </div>
                        <div className="p-2 rounded-lg border border-slate-800 bg-slate-800/30">
                          <span className="text-[9px] text-slate-400 uppercase block">{t.hallOfFame.recordedAtLabel}</span>
                          <span className="font-bold text-slate-300 text-[10px] truncate block">{formattedDate || "—"}</span>
                        </div>
                      </div>

                      {r.objectives && r.objectives.length > 0 && (
                        <div className="rounded-lg border border-slate-800 bg-slate-800/20 p-2.5">
                          <span className="text-[10px] font-bold uppercase text-slate-400 mb-1.5 flex items-center gap-1">
                            <Target className="w-3 h-3 text-sky-400" aria-hidden="true" />
                            {t.hallOfFame.objectivesSnapshot}
                          </span>
                          <div className="flex flex-col gap-1">
                            {r.objectives.map((obj) => (
                              <div key={obj.id} className={`flex items-center gap-2 text-[11px] ${obj.done ? "text-emerald-300" : "text-rose-300"}`}>
                                {obj.done ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" aria-hidden="true" />
                                )}
                                <span>{translateObjective(obj.id, obj.description, language)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </ModalBody>
    </Modal>
  );
}
