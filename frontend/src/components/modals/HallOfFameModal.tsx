import {
  Armchair,
  Award,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coffee,
  Filter,
  Globe2,
  Landmark,
  RefreshCw,
  ShieldAlert,
  Skull,
  Sparkles,
  Target,
  Trophy,
  User,
  XCircle,
} from "lucide-react";
import { KeyboardEvent, useEffect, useState } from "react";
import type { CosmeticIdKey } from "../../i18n/translations";
import { useTranslation } from "../../i18n/useTranslation";
import {
  translateDifficulty,
  translateObjective,
  translateOperatorRank,
  translateOutcome,
} from "../../i18n/dynamicContent";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { CareerRecord, CareerSummary, CosmeticCatalogEntry } from "../../types/game";
import { playUiConfirmSound, playUiHoverSound } from "../../utils/sound";
import Modal, { ModalBody, ModalHeader } from "../common/Modal";
import Spinner from "../common/Spinner";
import { scenarioName } from "../../utils/scenarioName";

type LeaderboardScope = "mine" | "global";
type OrderByMode = "recorded_at" | "days_survived" | "sla";
type HallTab = "records" | "cosmetics";

// stable fallback so the selector never hands React a fresh [] on every store update
const NO_COSMETICS: string[] = [];

// mirrors app.engine.cosmetics.COSMETIC_CATALOG: shown when the catalog endpoint is unreachable so
// the shop still renders (names and descriptions are replaced by the localized copy anyway)
export const DEFAULT_COSMETICS: CosmeticCatalogEntry[] = [
  { id: "golden_coffee_machine", name: "Golden Coffee Machine", description: "", prestige_cost: 200 },
  { id: "executive_leather_sofa", name: "Executive Leather Sofa", description: "", prestige_cost: 150 },
  { id: "marble_reception_desk", name: "Marble Reception Desk", description: "", prestige_cost: 300 },
];

function CosmeticIcon({ id }: { id: string }) {
  if (id === "golden_coffee_machine") return <Coffee className="w-6 h-6 text-amber-400" aria-hidden="true" />;
  if (id === "executive_leather_sofa") return <Armchair className="w-6 h-6 text-amber-600" aria-hidden="true" />;
  if (id === "marble_reception_desk") return <Landmark className="w-6 h-6 text-sky-400" aria-hidden="true" />;
  return <Sparkles className="w-6 h-6 text-cyan-400" aria-hidden="true" />;
}

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

  const [activeTab, setActiveTab] = useState<HallTab>("records");
  const [cosmeticsCatalog, setCosmeticsCatalog] = useState<CosmeticCatalogEntry[]>([]);
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockNotice, setUnlockNotice] = useState<string | null>(null);

  const prestigePoints = useGameStore((s) => s.telemetry.prestige_points ?? 0);
  const unlockedCosmetics = useGameStore((s) => s.telemetry.unlocked_cosmetics ?? NO_COSMETICS);
  const shop = t.hallOfFame.shop;

  // the catalog is static for the app's lifetime: fetch it once per opening, not on every
  // leaderboard filter change like the records below
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUnlockError(null);
    setUnlockNotice(null);
    api
      .getCosmeticCatalog()
      .then((cat) => {
        if (!cancelled && cat?.length) setCosmeticsCatalog(cat);
      })
      .catch(() => {
        // offline or older backend: the bundled DEFAULT_COSMETICS keep the shop usable
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

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

  // localized copy keyed by id; an id this client does not know yet keeps the backend's own text
  const localize = (entry: CosmeticCatalogEntry): CosmeticCatalogEntry => {
    const copy = shop.items[entry.id as CosmeticIdKey];
    return copy ? { ...entry, name: copy.name, description: copy.description } : entry;
  };
  const catalogItems = (cosmeticsCatalog.length > 0 ? cosmeticsCatalog : DEFAULT_COSMETICS).map(localize);

  const handleUnlockCosmetic = async (item: CosmeticCatalogEntry) => {
    if (unlockingId) return;
    setUnlockingId(item.id);
    setUnlockError(null);
    setUnlockNotice(null);
    try {
      const res = await api.unlockCosmetic(item.id);
      if (!res.success) throw new Error("unlock rejected");
      playUiConfirmSound();
      // optimistic mirror of the server's answer; the next telemetry frame carries the same values
      useGameStore.setState((prev) => {
        const owned = prev.telemetry.unlocked_cosmetics ?? [];
        return {
          telemetry: {
            ...prev.telemetry,
            prestige_points: res.prestige_points,
            unlocked_cosmetics: owned.includes(item.id) ? owned : [...owned, item.id],
          },
        };
      });
      setUnlockNotice(shop.unlockedToast(item.name));
    } catch {
      setUnlockError(shop.unlockFailed);
    } finally {
      setUnlockingId(null);
    }
  };

  // roving tab focus: Left / Right / Home / End move between the two views
  const handleTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const order: HallTab[] = ["records", "cosmetics"];
    const index = order.indexOf(activeTab);
    let next: HallTab | null = null;
    if (e.key === "ArrowRight") next = order[(index + 1) % order.length];
    else if (e.key === "ArrowLeft") next = order[(index - 1 + order.length) % order.length];
    else if (e.key === "Home") next = order[0];
    else if (e.key === "End") next = order[order.length - 1];
    if (!next) return;
    e.preventDefault();
    setActiveTab(next);
    document.getElementById(`hof-tab-${next}`)?.focus();
  };

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
        title={activeTab === "records" ? t.hallOfFame.title : shop.title}
        onClose={close}
        closeLabel={t.common.close}
        icon={
          <div className="p-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400">
            {activeTab === "records" ? <Award className="w-5 h-5" aria-hidden="true" /> : <Sparkles className="w-5 h-5 text-cyan-400" aria-hidden="true" />}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          {careerSummary && (
            <span className="hidden sm:inline text-xs text-slate-400 truncate">
              <span className="font-bold text-amber-400">
                {translateOperatorRank(careerSummary.operator_rank_key, careerSummary.operator_rank, language)}
              </span>{" "}
              · {careerSummary.lifetime_prestige} {t.flow.prestige} · {careerSummary.total_runs} {t.flow.runs}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full bg-cyan-950/80 text-[11px] text-cyan-300 border border-cyan-800/60 font-mono font-bold">
            {prestigePoints} {t.flow.prestige}
          </span>
        </div>
      </ModalHeader>

      {/* Mode navigation bar: Rankings vs Cosmetics Shop */}
      <div className="px-5 pt-3 pb-2.5 border-b border-slate-800 bg-slate-900/60 shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div role="tablist" aria-label={t.hallOfFame.viewsLabel} className="flex gap-2" onKeyDown={handleTabKeyDown}>
          <button
            type="button"
            role="tab"
            id="hof-tab-records"
            aria-selected={activeTab === "records"}
            aria-controls="hof-panel-records"
            tabIndex={activeTab === "records" ? 0 : -1}
            onClick={() => { playUiHoverSound(); setActiveTab("records"); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === "records"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <Trophy className="w-4 h-4" aria-hidden="true" />
            {t.hallOfFame.rankings}
          </button>
          <button
            type="button"
            role="tab"
            id="hof-tab-cosmetics"
            aria-selected={activeTab === "cosmetics"}
            aria-controls="hof-panel-cosmetics"
            tabIndex={activeTab === "cosmetics" ? 0 : -1}
            onClick={() => { playUiHoverSound(); setActiveTab("cosmetics"); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
              activeTab === "cosmetics"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 border border-transparent"
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-400" aria-hidden="true" />
            {shop.tab}
            <span aria-hidden="true" className="px-1.5 py-0.5 rounded-full bg-cyan-950 text-[10px] text-cyan-300 border border-cyan-800/60 font-mono">
              {prestigePoints}
            </span>
          </button>
        </div>
      </div>

      {activeTab === "cosmetics" ? (
        <ModalBody
          id="hof-panel-cosmetics"
          role="tabpanel"
          aria-labelledby="hof-tab-cosmetics"
          className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto"
        >
          {/* Header Card */}
          <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950/40 via-slate-900/60 to-slate-900/40 p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                <Sparkles className="w-6 h-6 animate-pulse" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2 flex-wrap">
                  {shop.heading}
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {shop.installedCount(catalogItems.filter((c) => unlockedCosmetics.includes(c.id)).length, catalogItems.length)}
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 max-w-xl">{shop.intro}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80">
              <span className="text-xs text-slate-400 font-medium">{shop.balance}</span>
              <span data-testid="shop-balance" className="text-sm font-extrabold text-amber-400 font-mono flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" aria-hidden="true" />
                {prestigePoints} {t.flow.prestige}
              </span>
            </div>
          </div>

          {/* unlock outcome: errors interrupt, confirmations are announced politely */}
          {unlockError && (
            <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs font-semibold text-rose-300">
              {unlockError}
            </p>
          )}
          <p role="status" className={unlockNotice ? "rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-300" : "sr-only"}>
            {unlockNotice ?? ""}
          </p>

          {/* Cards Grid */}
          <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {catalogItems.map((item) => {
              const isUnlocked = unlockedCosmetics.includes(item.id);
              const canAfford = prestigePoints >= item.prestige_cost;
              const isPending = unlockingId === item.id;

              return (
                <li
                  key={item.id}
                  data-testid={`cosmetic-${item.id}`}
                  className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                    isUnlocked
                      ? "border-emerald-500/40 bg-emerald-950/15"
                      : canAfford
                      ? "border-slate-700 bg-slate-900/60 hover:border-cyan-500/40"
                      : "border-slate-800/80 bg-slate-900/30 opacity-75"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="p-2.5 rounded-lg border border-slate-700/70 bg-slate-800/80">
                        <CosmeticIcon id={item.id} />
                      </div>
                      <span className="px-2 py-1 rounded-md text-[11px] font-bold font-mono bg-slate-800 border border-slate-700 text-amber-300">
                        {shop.cost(item.prestige_cost)}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-100 mb-1">{item.name}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    {isUnlocked ? (
                      <div className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                        <Check className="w-4 h-4 text-emerald-400" aria-hidden="true" />
                        {shop.installed}
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={!canAfford || unlockingId !== null}
                          aria-busy={isPending}
                          aria-label={`${shop.unlock(item.prestige_cost)}: ${item.name}`}
                          aria-describedby={canAfford ? undefined : `hof-need-${item.id}`}
                          onClick={() => handleUnlockCosmetic(item)}
                          className={`w-full py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                            canAfford
                              ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md active:scale-[0.98] disabled:opacity-70"
                              : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50"
                          }`}
                        >
                          {isPending ? (
                            <Spinner className="w-3.5 h-3.5" />
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                              {shop.unlock(item.prestige_cost)}
                            </>
                          )}
                        </button>
                        {!canAfford && (
                          <p id={`hof-need-${item.id}`} className="mt-1.5 text-center text-[10px] font-mono text-slate-500">
                            {shop.needMore(item.prestige_cost - prestigePoints)}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </ModalBody>
      ) : (
        <div id="hof-panel-records" role="tabpanel" aria-labelledby="hof-tab-records" className="flex flex-1 min-h-0 flex-col">
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

                        <span className="text-xs font-bold text-amber-400 font-mono shrink-0">+{shop.cost(r.prestige_earned)}</span>
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
        </div>
      )}
    </Modal>
  );
}
