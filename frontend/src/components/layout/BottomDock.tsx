import { AlertTriangle, BarChart2, ChevronDown, ChevronUp, MoreHorizontal, ScrollText, Trophy, TrendingUp, Users, Wrench } from "lucide-react";
import { LucideIcon } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { prefetchCatalogs } from "../../hooks/useCatalogs";
import { DockBadges, useDockBadges } from "../../hooks/useDockBadges";
import { useChangeSeq } from "../../hooks/useChangeSeq";
import { usePresenceFlag } from "../../hooks/usePresence";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import HudPopover from "../common/HudPopover";
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

const PANEL_HEIGHT = "h-56";
const COLLAPSE_MS = 340;

interface TabDef {
  id: DockTab;
  label: string;
  icon: LucideIcon;
  hotkey: string;
  badge: number;
  badgeLabel: string;
  badgeTone: string;
}

// consistent hotkey chip, used on every tab, in the menu and on the collapse button
function Hotkey({ children, className = "" }: { children: string; className?: string }) {
  return (
    <kbd
      aria-hidden
      className={`hidden rounded border border-slate-700 bg-slate-900 px-1 font-mono text-micro font-normal leading-4 text-slate-400 md:inline-block ${className}`}
    >
      {children}
    </kbd>
  );
}

// small count bubble. It bumps once when the count changes (it used to pulse forever, which made
// a long-standing open incident feel like a constantly new one)
function Badge({ count, label, tone, className = "" }: { count: number; label: string; tone: string; className?: string }) {
  const seq = useChangeSeq(count);
  if (count <= 0) return null;
  return (
    <span
      key={seq}
      role="img"
      aria-label={label}
      className={`flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-micro font-black leading-none text-white tabular-nums ${tone} ${
        seq > 0 ? "animate-badge-bump" : ""
      } ${className}`}
    >
      {count}
    </span>
  );
}

const TAB_BASE =
  "relative flex shrink-0 items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 font-heading text-sm font-semibold tracking-wide transition-colors duration-base sm:px-3";
const TAB_ACTIVE = "bg-cyan-950/60 text-cyan-300";
const TAB_IDLE = "text-slate-300 hover:bg-slate-900/60 hover:text-slate-100";

// COMPACT TABBED TYCOON DOCK: INCIDENTS, DIRECTIVES AND COMPLIANCE ON THE BAR, THE REST UNDER "MORE"
export default memo(function BottomDock() {
  const t = useTranslation();
  const activeTab = useGameStore((s) => s.dockTab);
  const collapsed = useGameStore((s) => s.dockCollapsed);
  const selectTab = useGameStore((s) => s.setDockTab);
  const toggleCollapsed = useGameStore((s) => s.toggleDockCollapsed);
  const badges: DockBadges = useDockBadges(activeTab === "achievements" && !collapsed);
  const [moreOpen, setMoreOpen] = useState(false);
  const { mounted: panelMounted } = usePresenceFlag(!collapsed, COLLAPSE_MS);

  const footerRef = useRef<HTMLElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLElement>());
  const moreRef = useRef<HTMLButtonElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  const [animateIndicator, setAnimateIndicator] = useState(false);

  const allTabs: TabDef[] = useMemo(
    () => [
      { id: "incidents", label: t.incidents.header, icon: AlertTriangle, hotkey: "I", badge: badges.incidents, badgeLabel: t.hud.dock.badge.incidents(badges.incidents), badgeTone: "bg-rose-600" },
      { id: "directives", label: t.mitigations.header, icon: Wrench, hotkey: "M", badge: 0, badgeLabel: "", badgeTone: "" },
      { id: "compliance", label: t.ledger.header, icon: ScrollText, hotkey: "C", badge: 0, badgeLabel: "", badgeTone: "" },
      { id: "upgrades", label: t.upgrades.header, icon: TrendingUp, hotkey: "U", badge: activeTab === "upgrades" ? 0 : badges.upgrades, badgeLabel: t.hud.dock.badge.upgrades(badges.upgrades), badgeTone: "bg-emerald-600" },
      { id: "roster", label: t.staff.header, icon: Users, hotkey: "R", badge: badges.roster, badgeLabel: t.hud.dock.badge.roster(badges.roster), badgeTone: "bg-amber-600" },
      { id: "achievements", label: t.achievements.header, icon: Trophy, hotkey: "A", badge: badges.achievements, badgeLabel: t.hud.dock.badge.achievements(badges.achievements), badgeTone: "bg-yellow-600" },
      { id: "metrics", label: t.hud.dock.metrics, icon: BarChart2, hotkey: "G", badge: 0, badgeLabel: "", badgeTone: "" },
    ],
    [t, badges, activeTab]
  );
  const primaryTabs = allTabs.filter((tab) => PRIMARY_TAB_IDS.includes(tab.id));
  const moreTabs = allTabs.filter((tab) => !PRIMARY_TAB_IDS.includes(tab.id));
  const activeIsInMore = moreTabs.some((tab) => tab.id === activeTab);
  // what the collapsed "More" button reports for the tabs hidden behind it
  const moreBadge = moreTabs.reduce((sum, tab) => sum + (tab.id === activeTab ? 0 : tab.badge), 0);

  const handleSelectTab = (id: DockTab) => {
    selectTab(id);
    setMoreOpen(false);
  };

  // sliding indicator: a 1px bar scaled/translated under the active button (transform only)
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const target = activeIsInMore ? moreRef.current : tabRefs.current.get(activeTab);
    if (!strip || !target) return;
    const measure = () => setIndicator({ x: target.offsetLeft, w: target.offsetWidth });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [activeTab, activeIsInMore, t]);

  // enable the glide only after the first placement, so the bar does not slide in from the corner
  useEffect(() => {
    if (!indicator) return;
    const frame = requestAnimationFrame(() => setAnimateIndicator(true));
    return () => cancelAnimationFrame(frame);
  }, [indicator]);

  // publish the dock's own height so the toast stack can sit right above it, however it is sized
  useLayoutEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--dock-height", `${Math.ceil(footer.getBoundingClientRect().height)}px`);
    publish();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(publish);
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  // fetch the static catalogs ahead of time so the achievements tab opens already populated
  useEffect(() => {
    prefetchCatalogs();
  }, []);

  return (
    <footer
      ref={footerRef}
      data-tour="bottom-dock"
      className="panel-shadow flex flex-col border-t border-slate-800 bg-slate-950/90 text-slate-200 backdrop-blur-md"
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-1 border-b border-slate-800/80 px-2">
        <div ref={stripRef} role="group" aria-label={t.hud.dock.tabsLabel} className="no-scrollbar relative flex min-w-0 items-center gap-1 overflow-x-auto">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.id, el);
                  else tabRefs.current.delete(tab.id);
                }}
                onClick={() => handleSelectTab(tab.id)}
                aria-pressed={active}
                aria-keyshortcuts={tab.hotkey}
                className={`${TAB_BASE} ${active ? TAB_ACTIVE : TAB_IDLE}`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">{tab.label}</span>
                <Hotkey>{tab.hotkey}</Hotkey>
                <Badge count={tab.badge} label={tab.badgeLabel} tone={tab.badgeTone} className="absolute -right-1 -top-1" />
              </button>
            );
          })}

          {/* the "more" trigger sits in the strip, but its menu is portalled out of it, so the
              strip's overflow can no longer clip the menu (that hid four whole tabs before) */}
          <button
            type="button"
            ref={moreRef}
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label={t.hud.dock.moreAria}
            className={`${TAB_BASE} ${activeIsInMore ? TAB_ACTIVE : TAB_IDLE}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">{t.common.more}</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-base ${moreOpen ? "rotate-180" : ""}`} aria-hidden />
            <Badge count={moreBadge} label={moreTabs.filter((tab) => tab.badge > 0).map((tab) => tab.badgeLabel).join(", ")} tone="bg-slate-500" className="absolute -right-1 -top-1" />
          </button>

          {indicator && (
            <span
              aria-hidden
              className={`pointer-events-none absolute bottom-0 left-0 h-0.5 w-px origin-left rounded-full bg-cyan-400 ${
                animateIndicator ? "transition-[transform,opacity] duration-slow ease-out-expo" : "transition-none"
              } ${collapsed ? "opacity-40" : "opacity-100"}`}
              style={{ transform: `translateX(${indicator.x}px) scaleX(${indicator.w})` }}
            />
          )}
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-keyshortcuts="D"
          className="flex shrink-0 items-center gap-1 rounded-md p-1.5 text-slate-300 transition-colors hover:bg-slate-900/60 hover:text-slate-100"
          title={collapsed ? `${t.common.expandDock} [D]` : `${t.common.collapseDock} [D]`}
          aria-label={collapsed ? t.common.expandDock : t.common.collapseDock}
        >
          <Hotkey>D</Hotkey>
          {collapsed ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      <HudPopover
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        anchorRef={moreRef}
        placement="top-start"
        id="dock-more-menu"
        label={t.hud.dock.moreMenu}
        className="w-52 overflow-hidden"
      >
        {moreTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => handleSelectTab(tab.id)}
              aria-keyshortcuts={tab.hotkey}
              aria-current={active ? "true" : undefined}
              className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-semibold transition-colors ${
                active ? "bg-cyan-950/60 text-cyan-300" : "text-slate-200 hover:bg-slate-900/60"
              }`}
            >
              <span className="flex items-center gap-2 font-heading tracking-wide">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {tab.label}
              </span>
              <span className="flex items-center gap-1.5">
                {tab.id !== activeTab && <Badge count={tab.badge} label={tab.badgeLabel} tone={tab.badgeTone} />}
                <Hotkey>{tab.hotkey}</Hotkey>
              </span>
            </button>
          );
        })}
      </HudPopover>

      {/* collapse animates grid rows (0fr <-> 1fr); the panel stays mounted until the collapse ends */}
      <div className={`grid transition-[grid-template-rows] duration-slow ease-out-expo ${collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
        <div className="min-h-0 overflow-hidden">
          {panelMounted && (
            <div key={activeTab} className={`${PANEL_HEIGHT} animate-panel-in`}>
              {activeTab === "incidents" && <IncidentsPanel />}
              {activeTab === "directives" && <MitigationsPanel />}
              {activeTab === "compliance" && <AuditTicker />}
              {activeTab === "upgrades" && <UpgradesTreePanel />}
              {activeTab === "roster" && <EngineerRosterPanel />}
              {activeTab === "achievements" && <AchievementsPanel />}
              {activeTab === "metrics" && <MetricsPanel />}
            </div>
          )}
        </div>
      </div>
    </footer>
  );
});
