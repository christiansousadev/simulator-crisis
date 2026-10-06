import { Coffee, Eye, LucideIcon, Radar, Shuffle, Sofa, Workflow } from "lucide-react";
import { UpgradeActionId, UpgradeCategoryKey } from "../../i18n/translations";

export interface UpgradeDef {
  upgradeId: UpgradeActionId;
  cost: number;
  category: UpgradeCategoryKey;
  prerequisite: UpgradeActionId | null;
  icon: LucideIcon;
}

// mirrors app.engine.upgrades.UPGRADE_CATALOG on the backend; display copy lives in i18n
export const UPGRADES: UpgradeDef[] = [
  { upgradeId: "apm_tracing", cost: 18000, category: "observability", prerequisite: null, icon: Eye },
  { upgradeId: "predictive_anomaly_detection", cost: 32000, category: "observability", prerequisite: "apm_tracing", icon: Radar },
  { upgradeId: "multi_az_clusters", cost: 45000, category: "resilience", prerequisite: null, icon: Shuffle },
  { upgradeId: "automated_cicd", cost: 28000, category: "resilience", prerequisite: null, icon: Workflow },
  { upgradeId: "espresso_machine", cost: 9500, category: "facility", prerequisite: null, icon: Coffee },
  { upgradeId: "ergonomic_chairs", cost: 14000, category: "facility", prerequisite: null, icon: Sofa },
];

// HOW MANY UPGRADES THE PLAYER COULD BUY RIGHT NOW (not owned, prerequisite met, cash is enough);
// drives the dock tab badge
export function countAffordableUpgrades(budget: number, purchased: string[], catalog: UpgradeDef[] = UPGRADES): number {
  return catalog.filter(
    (u) => !purchased.includes(u.upgradeId) && (!u.prerequisite || purchased.includes(u.prerequisite)) && budget >= u.cost
  ).length;
}
