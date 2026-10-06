import { Check, CornerDownRight, Lock } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { UpgradeCategoryKey } from "../../i18n/translations";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { claimLocalSpend } from "../../utils/localSpendClaims";
import { playCashSound, playClickSound, playErrorSound } from "../../utils/sound";
import { runExclusive, usePendingActions } from "../../hooks/useAsyncAction";
import { UpgradeDef, UPGRADES } from "./upgradeCatalog";

const CATEGORY_COLOR: Record<UpgradeCategoryKey, string> = {
  observability: "text-cyan-300 border-cyan-500/40 bg-cyan-950/20",
  resilience: "text-violet-300 border-violet-500/40 bg-violet-950/20",
  facility: "text-amber-300 border-amber-500/40 bg-amber-950/20",
};

const CATEGORY_GROUPS: UpgradeCategoryKey[] = ["observability", "resilience", "facility"];

const upgradeKey = (id: string) => `upgrade:${id}`;

// dependency tree: list of { upgradeId, children } per category
function buildTree(upgrades: UpgradeDef[]): Map<string | null, UpgradeDef[]> {
  const map = new Map<string | null, UpgradeDef[]>();
  for (const upg of upgrades) {
    const key = upg.prerequisite;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(upg);
  }
  return map;
}

interface UpgradeCardProps {
  upg: UpgradeDef;
  budget: number;
  purchasedUpgrades: string[];
  pending: boolean;
  onPurchase: (upg: UpgradeDef) => void;
}

const UpgradeCard = memo(function UpgradeCard({ upg, budget, purchasedUpgrades, pending, onPurchase }: UpgradeCardProps) {
  const t = useTranslation();
  const Icon = upg.icon;
  const copy = t.upgrades.actions[upg.upgradeId];
  const owned = purchasedUpgrades.includes(upg.upgradeId);
  const prereqMet = !upg.prerequisite || purchasedUpgrades.includes(upg.prerequisite);
  const prereqName = upg.prerequisite ? t.upgrades.actions[upg.prerequisite].name : null;
  const affordable = budget >= upg.cost;
  const disabled = owned || !prereqMet || !affordable || pending;
  const price = `−$${upg.cost.toLocaleString()}`;

  return (
    <button
      type="button"
      onClick={() => onPurchase(upg)}
      disabled={disabled}
      aria-busy={pending}
      title={owned ? copy.description : t.hud.upgrades.buyTitle(copy.name, price)}
      className={`group w-full rounded-xl border p-2.5 text-left transition-[background-color,border-color,box-shadow] duration-base disabled:cursor-not-allowed ${
        owned
          ? "border-emerald-500/40 bg-emerald-950/20 shadow-[0_0_12px_rgba(16,185,129,0.12)]"
          : !prereqMet
          ? "border-slate-800 bg-slate-900/40"
          : !affordable
          ? "border-slate-800 bg-slate-900/60"
          : "border-slate-600 bg-slate-900/80 hover:border-cyan-500/50 hover:bg-slate-800/80 hover:shadow-lg"
      }`}
    >
      <span className="mb-1.5 flex items-center gap-1.5">
        <span
          className={`rounded-lg border p-1.5 ${
            owned ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300" : "border-slate-700 bg-slate-950/50 text-slate-200"
          }`}
        >
          <Icon className="h-3 w-3" aria-hidden />
        </span>
        <span className={`truncate text-xs font-bold leading-tight ${prereqMet ? "text-slate-100" : "text-slate-400"}`}>{copy.name}</span>
      </span>

      <span className="mb-2 block line-clamp-2 text-caption leading-tight text-slate-300">{copy.description}</span>

      <span className="flex items-center justify-between gap-2 text-caption font-bold tabular-nums">
        {owned ? (
          <span className="flex items-center gap-1 text-emerald-300">
            <Check className="h-3 w-3" aria-hidden /> {t.upgrades.owned}
          </span>
        ) : !prereqMet ? (
          <span className="flex min-w-0 items-center gap-1 text-slate-300">
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{t.hud.upgrades.requires(prereqName ?? "")}</span>
          </span>
        ) : (
          <>
            {/* prices are a plain neutral: red is kept for alarms, a cost is not one */}
            <span className="text-slate-100">{price}</span>
            {!affordable && <span className="text-amber-300">{t.hud.upgrades.shortBy(`$${(upg.cost - budget).toLocaleString()}`)}</span>}
          </>
        )}
      </span>
    </button>
  );
});

// TECH TREE SHOP: VISUAL DEPENDENCY GRAPH + UPGRADE CARDS
export default function UpgradesTreePanel() {
  const t = useTranslation();
  const budget = useGameStore((s) => s.telemetry.budget);
  const purchasedUpgrades = useGameStore((s) => s.telemetry.purchased_upgrades);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);
  const pushKpiEvent = useGameStore((s) => s.pushKpiEvent);
  const pending = usePendingActions();

  const tree = useMemo(() => buildTree(UPGRADES), []);

  const handlePurchase = (upg: UpgradeDef) => {
    playClickSound();
    const copy = t.upgrades.actions[upg.upgradeId];
    void runExclusive(upgradeKey(upg.upgradeId), () => api.purchaseUpgrade(upg.upgradeId), {
      // pending until telemetry shows the upgrade as owned, so a double click cannot buy twice
      confirmed: (s) => s.telemetry.purchased_upgrades.includes(upg.upgradeId),
      onSuccess: () => {
        pushFloatingText(`-$${upg.cost.toLocaleString()} :: ${copy.name}`, "info");
        claimLocalSpend("UPGRADE_PURCHASED");
        pushKpiEvent("budget", -upg.cost, copy.name);
        playCashSound();
      },
      onError: (err) => {
        playErrorSound();
        pushFloatingText(err instanceof Error && err.message ? err.message : t.upgrades.insufficientBudget, "danger");
      },
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-3">
        {/* one column per tech branch on wide screens, so the whole tree is visible at a glance
            inside the short dock; narrow screens stack the branches */}
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {CATEGORY_GROUPS.map((cat) => {
            const rootNodes = (tree.get(null) ?? []).filter((u) => u.category === cat);
            if (rootNodes.length === 0) return null;

            return (
              <section key={cat}>
                <h3
                  className={`mb-2 w-fit rounded border px-2 py-0.5 font-heading text-xs font-bold uppercase tracking-widest ${CATEGORY_COLOR[cat]}`}
                >
                  {t.upgrades.categories[cat]}
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  {rootNodes.map((root) => {
                    const children = tree.get(root.upgradeId) ?? [];
                    return (
                      <div key={root.upgradeId} className="flex flex-col gap-2">
                        <UpgradeCard
                          upg={root}
                          budget={budget}
                          purchasedUpgrades={purchasedUpgrades}
                          pending={pending.has(upgradeKey(root.upgradeId))}
                          onPurchase={handlePurchase}
                        />
                        {children.length > 0 && (
                          <div className="ml-4 flex flex-col items-stretch gap-1 border-l-2 border-dashed border-slate-700 pl-3">
                            <span className="mb-0.5 flex items-center gap-1 text-micro text-slate-400">
                              <CornerDownRight className="h-3 w-3" aria-hidden />
                              {t.hud.upgrades.nextTier}
                            </span>
                            {children.map((child) => (
                              <UpgradeCard
                                key={child.upgradeId}
                                upg={child}
                                budget={budget}
                                purchasedUpgrades={purchasedUpgrades}
                                pending={pending.has(upgradeKey(child.upgradeId))}
                                onPurchase={handlePurchase}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
