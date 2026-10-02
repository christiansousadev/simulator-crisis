import { Award, Building2, ChevronDown, Gamepad2, Gauge, HelpCircle, Pause, Play, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import CreditCounter from "../common/CreditCounter";
import DefconMeter from "../common/DefconMeter";
import ErrorBudgetMeter from "../common/ErrorBudgetMeter";
import MoraleMeter from "../common/MoraleMeter";
import ReputationMeter from "../common/ReputationMeter";
import ShieldGauge from "../common/ShieldGauge";
import TechDebtMeter from "../common/TechDebtMeter";
import { getDayNumber, getHourOfDay } from "../../utils/officeClock";

const SPEED_OPTIONS = [
  { multiplier: 1, label: "1x" },
  { multiplier: 2, label: "2x" },
  { multiplier: 5, label: "5x" },
];

// TICK-TO-CLOCK DISPLAY, TREATING EACH TICK AS ONE SIMULATED OFFICE HOUR
function formatOfficeClock(tick: number, dayLabel: string): string {
  return `${dayLabel} ${getDayNumber(tick)} · ${getHourOfDay(tick).toString().padStart(2, "0")}:00`;
}

export default function Topbar() {
  const t = useTranslation();
  const telemetry = useGameStore((s) => s.telemetry);
  const connected = useGameStore((s) => s.connected);
  const openScenarioSelect = useGameStore((s) => s.openScenarioSelect);
  const openOnboarding = useGameStore((s) => s.openOnboarding);
  const openSettings = useGameStore((s) => s.openSettings);
  const openHallOfFame = useGameStore((s) => s.openHallOfFame);
  const openPauseMenu = useGameStore((s) => s.openPauseMenu);

  const currentMultiplier = telemetry.is_running ? Math.round(1 / telemetry.tick_rate_seconds) : 0;

  // secondary kpi cluster (runway/tech-debt/morale/reputation): shown inline once there's room
  // (see the `hd:` breakpoint below), otherwise tucked behind this "more indicators" popover so
  // nothing is ever silently clipped or hidden without an affordance to reach it
  const [secondaryOpen, setSecondaryOpen] = useState(false);
  const secondaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!secondaryOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (secondaryRef.current && !secondaryRef.current.contains(e.target as Node)) setSecondaryOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [secondaryOpen]);

  const handleSpeedChange = async (speed: number) => {
    try {
      if (speed === 0) {
        await api.pauseSimulation();
      } else {
        if (!telemetry.is_running) {
          await api.startSimulation();
        }
        await api.setSpeed(speed);
      }
    } catch {
      // best-effort; the next telemetry frame reconciles actual engine state
    }
  };

  return (
    <header className="h-16 bg-slate-900 text-slate-100 px-2 sm:px-5 flex items-center justify-between gap-2 sm:gap-3 panel-shadow relative z-20">
      {/* company identity */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="p-2 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30 shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="hidden md:block">
          <h1 className="font-heading font-bold text-base leading-tight tracking-wide">IncidentZero Corp.</h1>
          <p className="text-[11px] text-slate-400 leading-tight">{formatOfficeClock(telemetry.tick, t.common.day)}</p>
        </div>

        <div className="hidden sm:block h-8 w-px bg-slate-700 mx-1" />

        <div className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md bg-slate-800 text-[11px] font-medium shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? "bg-emerald-400" : "bg-rose-400 animate-pulse"}`} />
          <span className="hidden sm:inline">{connected ? t.topbar.live : t.topbar.reconnecting}</span>
        </div>
      </div>

      {/* status clusters: critical ops metrics get a visually elevated container so they never
          compete for attention with the more discreet company kpis or the speed controls */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink justify-center mx-auto" data-tour="topbar-kpis">
        <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1 rounded-lg border border-slate-700/70 bg-slate-800/50 shrink-0">
          <DefconMeter telemetry={telemetry} />
          <div className="h-9 w-px bg-slate-700" />
          <ShieldGauge slaPercentage={telemetry.sla_percentage} />
          <div className="h-9 w-px bg-slate-700" />
          <ErrorBudgetMeter remainingRatio={telemetry.error_budget_remaining_ratio} frozen={telemetry.feature_freeze_active} />
        </div>

        {/* secondary company kpis: inline once there's room, spaced apart and visually quieter
            than the critical cluster above */}
        <div className="hidden min-[1720px]:flex items-center gap-3 shrink opacity-95">
          <CreditCounter budget={telemetry.budget} />
          <TechDebtMeter techDebt={telemetry.tech_debt} />
          <MoraleMeter happiness={telemetry.user_happiness} />
          <ReputationMeter reputation={telemetry.reputation} />
        </div>

        <div className="min-[1720px]:hidden relative shrink-0" ref={secondaryRef}>
          <button
            onClick={() => setSecondaryOpen((v) => !v)}
            className={`flex items-center gap-1 px-2 py-1.5 rounded-md border text-[11px] font-semibold transition-colors ${
              secondaryOpen
                ? "border-sky-500/40 bg-sky-950/40 text-sky-300"
                : "border-slate-700/60 bg-slate-800/40 text-slate-400 hover:text-slate-200"
            }`}
            title={t.common.more}
          >
            <Gauge className="w-3.5 h-3.5" />
            <ChevronDown className={`w-3 h-3 transition-transform ${secondaryOpen ? "rotate-180" : ""}`} />
          </button>
          {secondaryOpen && (
            <div className="absolute top-full right-0 mt-1.5 w-56 rounded-lg border border-slate-800 bg-slate-950/95 backdrop-blur-md shadow-xl p-3 flex flex-col gap-3 z-30">
              <CreditCounter budget={telemetry.budget} />
              <TechDebtMeter techDebt={telemetry.tech_debt} />
              <MoraleMeter happiness={telemetry.user_happiness} />
              <ReputationMeter reputation={telemetry.reputation} />
            </div>
          )}
        </div>
      </div>

      {/* meta controls and simulation speed, kept as their own group so they never share visual
          weight with the metrics above */}
      <div className="flex items-center gap-2 shrink-0 relative z-10">
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg">
          <button
            onClick={openScenarioSelect}
            className="p-1.5 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title={t.topbar.newGame}
          >
            <Gamepad2 className="w-4 h-4" />
          </button>
          <button
            onClick={openOnboarding}
            className="p-1.5 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title={t.topbar.help}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={openHallOfFame}
            className="p-1.5 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title={t.titleScreen.hallOfFame}
          >
            <Award className="w-4 h-4" />
          </button>
          <button
            onClick={openSettings}
            className="p-1.5 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            title={t.topbar.settings}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
        {!telemetry.is_running && (
          <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[10px] font-bold tracking-wider animate-pulse">
            {t.topbar.pausedBadge}
          </span>
        )}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg">
          <button
            onClick={openPauseMenu}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-bold text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            title="Open Tactical Pause Menu [ESC]"
          >
            <span>PAUSE</span>
            <span className="text-[9px] text-slate-500 font-normal">[ESC]</span>
          </button>
          <div className="h-5 w-px bg-slate-700 my-auto" />
          <button
            onClick={() => handleSpeedChange(telemetry.is_running ? 0 : 1)}
            className={`flex items-center gap-1 p-1.5 rounded-md transition-colors ${
              !telemetry.is_running ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-400/50" : "text-slate-300 hover:bg-slate-700"
            }`}
            title={telemetry.is_running ? "Pause [SPACE]" : "Resume [SPACE]"}
          >
            {telemetry.is_running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span className="hidden xl:inline text-[9px] font-mono text-slate-500">[SPACE]</span>
          </button>
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.multiplier}
              onClick={() => handleSpeedChange(opt.multiplier)}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors flex items-center gap-0.5 ${
                telemetry.is_running && currentMultiplier === opt.multiplier
                  ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-400/60 scale-105"
                  : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              <span>{opt.label}</span>
              <span className="text-[8px] font-mono opacity-60">[{opt.multiplier}]</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
