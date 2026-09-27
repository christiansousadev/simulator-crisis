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

// tech tree shop: permanent infrastructure and facility upgrades purchased with runway budget
export default function UpgradesPanel() {
  const t = useTranslation();
  const budget = useGameStore((s) => s.telemetry.budget);
  const purchasedUpgrades = useGameStore((s) => s.telemetry.purchased_upgrades);
  const pushFloatingText = useGameStore((s) => s.pushFloatingText);

  const handlePurchase = async (upg: UpgradeDef) => {
    playClickSound();
    const copy = t.upgrades.actions[upg.upgradeId];
    try {
      await api.purchaseUpgrade(upg.upgradeId);
      pushFloatingText(`-$${upg.cost.toLocaleString()} :: ${copy.name}`, "info");
      playCashSound();
    } catch {
      pushFloatingText(t.upgrades.insufficientBudget, "danger");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-4 gap-1.5">
        {UPGRADES.map((upg) => {
          const Icon = upg.icon;
          const copy = t.upgrades.actions[upg.upgradeId];
          const owned = purchasedUpgrades.includes(upg.upgradeId);
          const prereqName = upg.prerequisite ? t.upgrades.actions[upg.prerequisite].name : null;
          const prereqMet = !upg.prerequisite || purchasedUpgrades.includes(upg.prerequisite);
          const disabled = owned || !prereqMet || budget < upg.cost;

          return (
            <button
              key={upg.upgradeId}
              onClick={() => handlePurchase(upg)}
              disabled={disabled}
              className={`rounded-lg border p-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                owned ? "border-emerald-500/40 bg-emerald-950/20" : "border-slate-800 bg-slate-900/80 hover:bg-slate-800/80"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  {t.upgrades.categories[upg.category]}
                </span>
                <Icon className={`w-3.5 h-3.5 ${owned ? "text-emerald-400" : "text-slate-400"}`} />
              </div>
              <div className="text-xs font-bold text-slate-200">{copy.name}</div>
              <p className="text-[10px] text-slate-400 leading-tight">{copy.description}</p>
              <div className="flex items-center justify-between mt-1 text-[10px] font-bold">
                {owned ? (
                  <span className="text-emerald-400">{t.upgrades.owned}</span>
                ) : !prereqMet ? (
                  <span className="text-amber-400">{t.upgrades.prerequisiteLocked(prereqName ?? "")}</span>
                ) : (
                  <span className="text-rose-400">-${upg.cost.toLocaleString()}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
