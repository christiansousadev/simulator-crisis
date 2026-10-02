import { useMemo } from "react";
import { Coffee, Eye, LucideIcon, Radar, Shuffle, Sofa, Workflow } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { UpgradeActionId, UpgradeCategoryKey } from "../../i18n/translations";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { playCashSound, playClickSound } from "../../utils/sound";

interface UpgradeDef {
  upgradeId: UpgradeActionId;
  cost: number;
  category: UpgradeCategoryKey;
  prerequisite: UpgradeActionId | null;
  icon: LucideIcon;
}

// mirrors app.engine.upgrades.UPGRADE_CATALOG on the backend; display copy lives in i18n
const UPGRADES: UpgradeDef[] = [
  { upgradeId: "apm_tracing", cost: 18000, category: "observability", prerequisite: null, icon: Eye },
  { upgradeId: "predictive_anomaly_detection", cost: 32000, category: "observability", prerequisite: "apm_tracing", icon: Radar },
  { upgradeId: "multi_az_clusters", cost: 45000, category: "resilience", prerequisite: null, icon: Shuffle },
  { upgradeId: "automated_cicd", cost: 28000, category: "resilience", prerequisite: null, icon: Workflow },
  { upgradeId: "espresso_machine", cost: 9500, category: "facility", prerequisite: null, icon: Coffee },
  { upgradeId: "ergonomic_chairs", cost: 14000, category: "facility", prerequisite: null, icon: Sofa },
];

const CATEGORY_COLOR: Record<UpgradeCategoryKey, string> = {
  observability: "text-cyan-400 border-cyan-500/40 bg-cyan-950/20",
  resilience: "text-violet-400 border-violet-500/40 bg-violet-950/20",
  facility: "text-amber-400 border-amber-500/40 bg-amber-950/20",
};

const CATEGORY_GROUPS: UpgradeCategoryKey[] = ["observability", "resilience", "facility"];

// dependency tree: list of { upgradeId, children } per category
function buildTree(upgrades: UpgradeDef[]): Map<UpgradeActionId | null, UpgradeDef[]> {
  const map = new Map<UpgradeActionId | null, UpgradeDef[]>();
  for (const upg of upgrades) {
    const key = upg.prerequisite;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(upg);
  }
  return map;
}

// TECH TREE SHOP: VISUAL DEPENDENCY GRAPH + UPGRADE CARDS
export default function UpgradesTreePanel() {
  const t = useTranslation();
  const budget = useGameStore((s) => s.telemetry.budget);
  const purchasedUpgrades = useGameStore((s) => s.telemetry.purchased_upgrades);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);

  const tree = useMemo(() => buildTree(UPGRADES), []);

  const handlePurchase = async (upg: UpgradeDef) => {
    playClickSound();
    const copy = t.upgrades.actions[upg.upgradeId];
    try {
      await api.purchaseUpgrade(upg.upgradeId);
      pushFloatingText(`-$${upg.cost.toLocaleString()} :: ${copy.name}`, "info");
      playCashSound();
    } catch (err) {
      pushFloatingText(
        err instanceof Error && err.message ? err.message : t.upgrades.insufficientBudget,
        "danger"
      );
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-4">
          {CATEGORY_GROUPS.map((cat) => {
            const rootNodes = (tree.get(null) ?? []).filter((u) => u.category === cat);
            if (rootNodes.length === 0) return null;

            return (
              <div key={cat}>
                {/* Category header */}
                <div
                  className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded w-fit mb-2 border ${CATEGORY_COLOR[cat]}`}
                >
                  {t.upgrades.categories[cat]}
                </div>

                <div className="flex flex-wrap gap-3">
                  {rootNodes.map((root) => {
                    const children = (tree.get(root.upgradeId) ?? []);
                    return (
                      <div key={root.upgradeId} className="flex flex-col gap-2">
                        <UpgradeCard
                          upg={root}
                          budget={budget}
                          purchasedUpgrades={purchasedUpgrades}
                          t={t}
                          onPurchase={handlePurchase}
                          categoryColor={CATEGORY_COLOR[cat]}
                        />
                        {/* Dependency connector + children */}
                        {children.length > 0 && (
                          <div className="flex flex-col items-start gap-1 pl-3 border-l-2 border-dashed border-slate-700/60 ml-4">
                            <span className="text-[9px] text-slate-500 font-mono mb-0.5">↳ requires above</span>
                            {children.map((child) => (
                              <UpgradeCard
                                key={child.upgradeId}
                                upg={child}
                                budget={budget}
                                purchasedUpgrades={purchasedUpgrades}
                                t={t}
                                onPurchase={handlePurchase}
                                categoryColor={CATEGORY_COLOR[cat]}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface UpgradeCardProps {
  upg: UpgradeDef;
  budget: number;
  purchasedUpgrades: string[];
  t: ReturnType<typeof useTranslation>;
  onPurchase: (upg: UpgradeDef) => void;
  categoryColor: string;
}

function UpgradeCard({ upg, budget, purchasedUpgrades, t, onPurchase, categoryColor }: UpgradeCardProps) {
  const Icon = upg.icon;
  const copy = t.upgrades.actions[upg.upgradeId];
  const owned = purchasedUpgrades.includes(upg.upgradeId);
  const prereqMet = !upg.prerequisite || purchasedUpgrades.includes(upg.prerequisite);
  const prereqName = upg.prerequisite ? t.upgrades.actions[upg.prerequisite].name : null;
  const disabled = owned || !prereqMet || budget < upg.cost;

  return (
    <button
      onClick={() => onPurchase(upg)}
      disabled={disabled}
      title={copy.description}
      className={`w-44 rounded-xl border p-2.5 text-left transition-all active:scale-95 group ${
        owned
          ? "border-emerald-500/40 bg-emerald-950/20 shadow-[0_0_12px_rgba(16,185,129,0.12)]"
          : !prereqMet
          ? "border-slate-800/50 bg-slate-900/40 opacity-40 cursor-not-allowed"
          : budget < upg.cost
          ? "border-slate-800 bg-slate-900/60 opacity-50 cursor-not-allowed"
          : `border-slate-700/60 bg-slate-900/80 hover:bg-slate-800/80 hover:border-slate-600/60 hover:shadow-lg`
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <div
          className={`p-1.5 rounded-lg border ${
            owned
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400"
              : `${categoryColor} text-current opacity-80`
          }`}
        >
          <Icon className="w-3 h-3" />
        </div>
        <span className="text-xs font-bold text-slate-200 leading-tight truncate">{copy.name}</span>
      </div>

      <p className="text-[10px] text-slate-400 leading-tight line-clamp-2 mb-2">{copy.description}</p>

      <div className="flex items-center justify-between text-[10px] font-bold">
        {owned ? (
          <span className="flex items-center gap-1 text-emerald-400">
            <span>✓</span> {t.upgrades.owned}
          </span>
        ) : !prereqMet ? (
          <span className="text-slate-500 truncate">🔒 {prereqName}</span>
        ) : (
          <span className={budget < upg.cost ? "text-slate-500" : "text-rose-400"}>
            -${upg.cost.toLocaleString()}
          </span>
        )}
      </div>
    </button>
  );
}
