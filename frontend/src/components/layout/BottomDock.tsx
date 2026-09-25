import { AlertTriangle, ChevronDown, ChevronUp, MoreHorizontal, ScrollText, Trophy, TrendingUp, Users, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import AchievementsPanel from "../dock/AchievementsPanel";
import AuditTicker from "../dock/AuditTicker";
import EngineerRosterPanel from "../dock/EngineerRosterPanel";
import IncidentsPanel from "../dock/IncidentsPanel";
import MitigationsPanel from "../dock/MitigationsPanel";
import UpgradesPanel from "../dock/UpgradesPanel";

type DockTab = "incidents" | "directives" | "compliance" | "upgrades" | "roster" | "achievements";

// the three most-used tabs stay directly on the bar; the rest live behind "more" to avoid overflow
const PRIMARY_TAB_IDS: DockTab[] = ["incidents", "directives", "compliance"];

// COMPACT TABBED TYCOON DOCK: INCIDENTS, DIRECTIVES AND COMPLIANCE ON THE BAR, THE REST UNDER "MORE"
export default function BottomDock() {
  const t = useTranslation();
  const openCount = useGameStore((s) => s.telemetry.active_incidents.length);
  const [activeTab, setActiveTab] = useState<DockTab>("incidents");
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const allTabs: { id: DockTab; label: string; icon: typeof AlertTriangle }[] = [
    { id: "incidents", label: t.incidents.header, icon: AlertTriangle },
    { id: "directives", label: t.mitigations.header, icon: Wrench },
    { id: "compliance", label: t.ledger.header, icon: ScrollText },
    { id: "upgrades", label: t.upgrades.header, icon: TrendingUp },
    { id: "roster", label: t.staff.header, icon: Users },
    { id: "achievements", label: t.achievements.header, icon: Trophy },
  ];
  const primaryTabs = allTabs.filter((tab) => PRIMARY_TAB_IDS.includes(tab.id));
  const moreTabs = allTabs.filter((tab) => !PRIMARY_TAB_IDS.includes(tab.id));
  const activeIsInMore = moreTabs.some((tab) => tab.id === activeTab);

  useEffect(() => {
    if (!moreOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moreOpen]);

  const selectTab = (id: DockTab) => {
    setActiveTab(id);
    setCollapsed(false);
    setMoreOpen(false);
  };

  return (
    <footer data-tour="bottom-dock" className="bg-slate-100 border-t border-slate-300 panel-shadow flex flex-col">
      <div className="h-10 flex items-center justify-between px-2 border-b border-slate-200 shrink-0 gap-1">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id && !collapsed;
            return (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-bold transition-colors shrink-0 ${
                  active ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === "incidents" && openCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-blink">
                    {openCount}
                  </span>
                )}
              </button>
            );
          })}

          <div className="relative shrink-0" ref={moreRef}>
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                activeIsInMore && !collapsed ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-200"
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.common.more}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            {moreOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-44 rounded-lg border border-slate-200 bg-white shadow-xl overflow-hidden z-30">
                {moreTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id && !collapsed;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => selectTab(tab.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold transition-colors ${
                        active ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="p-1.5 rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors shrink-0"
          title={collapsed ? t.common.expandDock : t.common.collapseDock}
        >
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="h-40">
          {activeTab === "incidents" && <IncidentsPanel />}
          {activeTab === "directives" && <MitigationsPanel />}
          {activeTab === "compliance" && <AuditTicker />}
          {activeTab === "upgrades" && <UpgradesPanel />}
          {activeTab === "roster" && <EngineerRosterPanel />}
          {activeTab === "achievements" && <AchievementsPanel />}
        </div>
      )}
    </footer>
  );
}
