import { AlertTriangle, BarChart2, ChevronDown, ChevronUp, MoreHorizontal, ScrollText, Trophy, TrendingUp, Users, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import AchievementsPanel from "../dock/AchievementsPanel";
import AuditTicker from "../dock/AuditTicker";
import EngineerRosterPanel from "../dock/EngineerRosterPanel";
import IncidentsPanel from "../dock/IncidentsPanel";
import MetricsPanel from "../dock/MetricsPanel";
import MitigationsPanel from "../dock/MitigationsPanel";
import UpgradesTreePanel from "../dock/UpgradesTreePanel";

type DockTab = "incidents" | "directives" | "compliance" | "upgrades" | "roster" | "achievements" | "metrics";

// the three most-used tabs stay directly on the bar; the rest live behind "more" to avoid overflow
const PRIMARY_TAB_IDS: DockTab[] = ["incidents", "directives", "compliance"];

// COMPACT TABBED TYCOON DOCK: INCIDENTS, DIRECTIVES AND COMPLIANCE ON THE BAR, THE REST UNDER "MORE"
export default function BottomDock() {
  const t = useTranslation();
  const openCount = useGameStore((s) => s.telemetry.active_incidents.length);
  const activeTab = useGameStore((s) => s.dockTab);
  const collapsed = useGameStore((s) => s.dockCollapsed);
  const selectTab = useGameStore((s) => s.setDockTab);
  const toggleCollapsed = useGameStore((s) => s.toggleDockCollapsed);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const allTabs: { id: DockTab; label: string; icon: typeof AlertTriangle; hotkey: string }[] = [
    { id: "incidents", label: t.incidents.header, icon: AlertTriangle, hotkey: "I" },
    { id: "directives", label: t.mitigations.header, icon: Wrench, hotkey: "M" },
    { id: "compliance", label: t.ledger.header, icon: ScrollText, hotkey: "C" },
    { id: "upgrades", label: t.upgrades.header, icon: TrendingUp, hotkey: "U" },
    { id: "roster", label: t.staff.header, icon: Users, hotkey: "R" },
    { id: "achievements", label: t.achievements.header, icon: Trophy, hotkey: "A" },
    { id: "metrics", label: "Metrics", icon: BarChart2, hotkey: "G" },
  ];
  const primaryTabs = allTabs.filter((tab) => PRIMARY_TAB_IDS.includes(tab.id));
  const moreTabs = allTabs.filter((tab) => !PRIMARY_TAB_IDS.includes(tab.id));
  const activeIsInMore = moreTabs.some((tab) => tab.id === activeTab);

  const handleSelectTab = (id: DockTab) => {
    selectTab(id);
    setMoreOpen(false);
  };

  useEffect(() => {
    if (!moreOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [moreOpen]);

  return (
    <footer
      data-tour="bottom-dock"
      className="bg-slate-950/90 backdrop-blur-md border-t border-slate-800 text-slate-200 panel-shadow flex flex-col"
    >
      <div className="h-10 flex items-center justify-between px-2 border-b border-slate-800/80 shrink-0 gap-1">
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id && !collapsed;
            return (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-bold transition-colors shrink-0 ${
                  active
                    ? "bg-cyan-950/60 text-cyan-400 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)] font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="hidden md:inline-block text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 font-mono font-normal border border-slate-700/50">
                  {tab.hotkey}
                </span>
                {tab.id === "incidents" && openCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white font-black text-[10px] flex items-center justify-center animate-pulse">
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
                activeIsInMore && !collapsed
                  ? "bg-cyan-950/60 text-cyan-400 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)] font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.common.more}</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            {moreOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-48 rounded-lg border border-slate-800 bg-slate-950/95 backdrop-blur-md shadow-xl overflow-hidden z-30">
                {moreTabs.map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id && !collapsed;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => handleSelectTab(tab.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold transition-colors ${
                        active ? "bg-cyan-950/60 text-cyan-400" : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="w-3.5 h-3.5" />
                        <span>{tab.label}</span>
                      </div>
                      <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-400 font-mono font-normal border border-slate-700/50">
                        {tab.hotkey}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={toggleCollapsed}
          className="flex items-center gap-1 p-1.5 rounded-md text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 transition-colors shrink-0"
          title={collapsed ? `${t.common.expandDock} [D]` : `${t.common.collapseDock} [D]`}
        >
          <span className="hidden md:inline-block text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-500 font-mono font-normal border border-slate-700/50">
            D
          </span>
          {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && (
        <div className="h-56">
          {activeTab === "incidents" && <IncidentsPanel />}
          {activeTab === "directives" && <MitigationsPanel />}
          {activeTab === "compliance" && <AuditTicker />}
          {activeTab === "upgrades" && <UpgradesTreePanel />}
          {activeTab === "roster" && <EngineerRosterPanel />}
          {activeTab === "achievements" && <AchievementsPanel />}
          {activeTab === "metrics" && <MetricsPanel />}
        </div>
      )}
    </footer>
  );
}
