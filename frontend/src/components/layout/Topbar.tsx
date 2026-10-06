import { Award, Building2, ChevronDown, Gamepad2, Gauge, HelpCircle, Pause, Play, Settings } from "lucide-react";
import { memo, useRef, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { moraleBand, reputationBand, techDebtBand, toneFor } from "../../utils/kpiBands";
import { getDayNumber, getHourOfDay } from "../../utils/officeClock";
import CreditCounter from "../common/CreditCounter";
import DefconMeter from "../common/DefconMeter";
import ErrorBudgetMeter from "../common/ErrorBudgetMeter";
import HudPopover from "../common/HudPopover";
import MoraleMeter from "../common/MoraleMeter";
import ReputationMeter from "../common/ReputationMeter";
import ShieldGauge from "../common/ShieldGauge";
import TechDebtMeter from "../common/TechDebtMeter";

const SPEED_OPTIONS = [1, 2, 5];

// TICK-TO-CLOCK DISPLAY, TREATING EACH TICK AS ONE SIMULATED OFFICE HOUR
function formatOfficeClock(tick: number, dayLabel: string): string {
  return `${dayLabel} ${getDayNumber(tick)} · ${getHourOfDay(tick).toString().padStart(2, "0")}:00`;
}

// the clock is the only thing in the identity block that changes every tick, so it subscribes alone
const OfficeClock = memo(function OfficeClock() {
  const t = useTranslation();
  const tick = useGameStore((s) => s.telemetry.tick);
  return <p className="text-caption leading-tight text-slate-400 tabular-nums">{formatOfficeClock(tick, t.common.day)}</p>;
});

const ConnectionPill = memo(function ConnectionPill() {
  const t = useTranslation();
  const connected = useGameStore((s) => s.connected);
  return (
    <div role="status" className="flex shrink-0 items-center gap-1.5 rounded-md bg-slate-800 px-2 py-1 text-caption font-medium sm:px-2.5">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400 animate-pulse"}`} />
      <span className="hidden sm:inline">{connected ? t.topbar.live : t.topbar.reconnecting}</span>
    </div>
  );
});

// each meter reads only its own value, so a tick that moves one kpi re-renders one meter
const ConnectedShield = memo(function ConnectedShield() {
  return <ShieldGauge slaPercentage={useGameStore((s) => s.telemetry.sla_percentage)} />;
});
const ConnectedErrorBudget = memo(function ConnectedErrorBudget() {
  const ratio = useGameStore((s) => s.telemetry.error_budget_remaining_ratio);
  const frozen = useGameStore((s) => s.telemetry.feature_freeze_active);
  return <ErrorBudgetMeter remainingRatio={ratio} frozen={frozen} />;
});
const ConnectedCash = memo(function ConnectedCash() {
  return <CreditCounter budget={useGameStore((s) => s.telemetry.budget)} />;
});
const ConnectedTechDebt = memo(function ConnectedTechDebt() {
  return <TechDebtMeter techDebt={useGameStore((s) => s.telemetry.tech_debt)} />;
});
const ConnectedMorale = memo(function ConnectedMorale() {
  return <MoraleMeter happiness={useGameStore((s) => s.telemetry.user_happiness)} />;
});
const ConnectedReputation = memo(function ConnectedReputation() {
  return <ReputationMeter reputation={useGameStore((s) => s.telemetry.reputation)} />;
});

// the three secondary indicators, mounted exactly once: inline on wide screens, or in the popover
function SecondaryMeters({ className }: { className: string }) {
  return (
    <div className={className}>
      <ConnectedTechDebt />
      <ConnectedMorale />
      <ConnectedReputation />
    </div>
  );
}

// "Indicators" button: a labelled trigger with three tiny status dots, so the popover never hides a
// problem -- a red dot is visible without opening it
const SecondaryPopover = memo(function SecondaryPopover() {
  const t = useTranslation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tdBand = useGameStore((s) => techDebtBand(s.telemetry.tech_debt));
  const mBand = useGameStore((s) => moraleBand(s.telemetry.user_happiness));
  const rBand = useGameStore((s) => reputationBand(s.telemetry.reputation));
  const dots = [
    toneFor("techDebt", tdBand).dot,
    toneFor("morale", mBand).dot,
    toneFor("reputation", rBand).dot,
  ];

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t.hud.topbar.indicatorsAria}
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-caption font-semibold transition-colors ${
          open
            ? "border-sky-500/40 bg-sky-950/40 text-sky-200"
            : "border-slate-700/60 bg-slate-800/40 text-slate-300 hover:text-slate-100"
        }`}
      >
        <Gauge className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden font-heading uppercase tracking-wider sm:inline">{t.hud.topbar.indicators}</span>
        <span className="flex items-center gap-0.5" aria-hidden>
          {dots.map((dot, i) => (
            <span key={i} className={`h-1.5 w-1.5 rounded-full transition-colors duration-slow ${dot}`} />
          ))}
        </span>
        <ChevronDown className={`h-3 w-3 transition-transform duration-base ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <HudPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom-end"
        id="topbar-indicators"
        label={t.hud.topbar.indicatorsPanel}
        className="w-60 p-3"
      >
        <SecondaryMeters className="flex flex-col gap-3" />
      </HudPopover>
    </div>
  );
});

const SpeedControls = memo(function SpeedControls() {
  const t = useTranslation();
  const isRunning = useGameStore((s) => s.telemetry.is_running);
  const multiplier = useGameStore((s) => (s.telemetry.is_running ? Math.round(1 / s.telemetry.tick_rate_seconds) : 0));
  const openPauseMenu = useGameStore((s) => s.openPauseMenu);

  const handleSpeedChange = async (speed: number) => {
    try {
      if (speed === 0) {
        await api.pauseSimulation();
      } else {
        if (!useGameStore.getState().telemetry.is_running) {
          await api.startSimulation();
        }
        await api.setSpeed(speed);
      }
    } catch {
      // best-effort; the next telemetry frame reconciles actual engine state
    }
  };

  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1">
      {/* opens the tactical pause menu (a different thing from the pause toggle right of it) */}
      <button
        type="button"
        onClick={openPauseMenu}
        aria-keyshortcuts="Escape"
        title={t.hud.topbar.menuTitle}
        className="flex items-center gap-1 rounded px-2 py-1 font-heading text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
      >
        <span>{t.hud.topbar.menu}</span>
        <kbd className="hidden rounded border border-slate-700 bg-slate-900 px-1 font-mono text-micro font-normal text-slate-400 min-[1800px]:inline">Esc</kbd>
      </button>
      <div className="my-auto h-5 w-px bg-slate-700" />
      {/* the single pause/resume control; while paused it names the state itself, so there is no
          separate "PAUSED" badge repeating it */}
      <button
        type="button"
        onClick={() => handleSpeedChange(isRunning ? 0 : 1)}
        aria-pressed={!isRunning}
        aria-keyshortcuts="Space"
        title={isRunning ? t.hud.topbar.pauseTitle : t.hud.topbar.resumeTitle}
        className={`flex items-center gap-1 rounded-md p-1.5 transition-colors ${
          !isRunning ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/50" : "text-slate-300 hover:bg-slate-700"
        }`}
      >
        {isRunning ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
        {!isRunning && <span className="hidden text-caption font-bold tracking-wide sm:inline">{t.hud.topbar.paused}</span>}
      </button>
      {SPEED_OPTIONS.map((x) => (
        <button
          type="button"
          key={x}
          onClick={() => handleSpeedChange(x)}
          aria-pressed={isRunning && multiplier === x}
          aria-keyshortcuts={String(x)}
          title={t.hud.topbar.speedTitle(x)}
          className={`flex items-center gap-0.5 rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
            isRunning && multiplier === x ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/60" : "text-slate-300 hover:bg-slate-700"
          }`}
        >
          {x}x
        </button>
      ))}
    </div>
  );
});

export default function Topbar() {
  const t = useTranslation();
  const openScenarioSelect = useGameStore((s) => s.openScenarioSelect);
  const openOnboarding = useGameStore((s) => s.openOnboarding);
  const openSettings = useGameStore((s) => s.openSettings);
  const openHallOfFame = useGameStore((s) => s.openHallOfFame);
  // wide screens show the secondary indicators inline; below that they live in the popover. only
  // one copy is ever mounted.
  const wide = useMediaQuery("(min-width: 1720px)");

  const iconButton =
    "rounded-md p-1.5 text-slate-300 transition-colors hover:bg-slate-700 hover:text-white";

  return (
    <header className="relative z-20 flex h-16 items-center justify-between gap-2 bg-slate-900 px-2 text-slate-100 panel-shadow sm:gap-3 sm:px-5">
      {/* company identity */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="shrink-0 rounded-lg border border-sky-500/30 bg-sky-500/15 p-2 text-sky-400">
          <Building2 className="h-5 w-5" aria-hidden />
        </div>
        <div className="hidden md:block">
          <h1 className="font-heading text-base font-bold leading-tight tracking-wide">IncidentZero Corp.</h1>
          <OfficeClock />
        </div>
        <div className="mx-1 hidden h-8 w-px bg-slate-700 sm:block" />
        <ConnectionPill />
      </div>

      {/* status cluster: the critical ops metrics (threat level, sla, error budget, and cash) share one
          elevated container, every piece fixed-width so nothing re-centers when a label changes */}
      <div className="mx-auto flex min-w-0 shrink items-center justify-center gap-2 sm:gap-3" data-tour="topbar-kpis" role="group" aria-label={t.hud.topbar.kpiCluster}>
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-700/70 bg-slate-800/50 px-2 py-1 sm:gap-3 sm:px-3">
          <DefconMeter />
          <div className="h-9 w-px bg-slate-700" />
          <ConnectedShield />
          <div className="h-9 w-px bg-slate-700" />
          <ConnectedErrorBudget />
          <div className="h-9 w-px bg-slate-700" />
          <ConnectedCash />
        </div>
        {wide ? <SecondaryMeters className="flex shrink items-center gap-3" /> : <SecondaryPopover />}
      </div>

      {/* meta controls and simulation speed, kept as their own group so they never share visual
          weight with the metrics above */}
      <div className="relative z-10 flex shrink-0 items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1">
          <button type="button" onClick={openScenarioSelect} className={iconButton} title={t.topbar.newGame}>
            <Gamepad2 className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={openOnboarding} className={iconButton} title={t.topbar.help}>
            <HelpCircle className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={openHallOfFame} className={iconButton} title={t.titleScreen.hallOfFame}>
            <Award className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={openSettings} className={iconButton} title={t.topbar.settings}>
            <Settings className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <SpeedControls />
      </div>
    </header>
  );
}
