import { Award, Building2, Gamepad2, HelpCircle, Pause, Play, Settings } from "lucide-react";
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

  const currentMultiplier = telemetry.is_running ? Math.round(1 / telemetry.tick_rate_seconds) : 0;

  // the KPI strip below is intentionally horizontally scrollable rather than wrapping (a narrow
  // viewport, or pt-BR's longer label strings, can make it wider than its container) -- but with
  // no visible scrollbar (`no-scrollbar`), a mouse/desktop user had no cue that a clipped meter
  // (Morale/Reputation, at the end) even existed, let alone that scrolling reveals it. These two
  // edge-fade hints only render when there's actually more content in that direction.
  const kpiRowRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = kpiRowRef.current;
    if (!el) return;
    const updateEdges = () =>
      setScrollEdges({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      observer.disconnect();
    };
  }, []);

  const handleSpeedChange = async (speed: number) => {
    try {
      if (speed === 0) {
        await api.pauseSimulation();
      } else {
        await api.setSpeed(speed);
      }
    } catch {
      // best-effort; the next telemetry frame reconciles actual engine state
    }
  };

  return (
    <header className="h-16 bg-slate-900 text-slate-100 px-2 sm:px-5 flex items-center justify-between gap-2 panel-shadow relative z-20 overflow-hidden">
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

      {/* company kpis: horizontally scrollable so a narrow viewport swipes instead of overflowing */}
      <div className="relative min-w-0 flex-1">
        {scrollEdges.left && (
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-slate-900 to-transparent" />
        )}
        <div
          ref={kpiRowRef}
          className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar min-w-0 [&>*]:shrink-0"
          data-tour="topbar-kpis"
        >
          <DefconMeter telemetry={telemetry} />
          <div className="h-9 w-px bg-slate-700" />
          <ShieldGauge slaPercentage={telemetry.sla_percentage} />
          <div className="h-9 w-px bg-slate-700" />
          <ErrorBudgetMeter remainingRatio={telemetry.error_budget_remaining_ratio} frozen={telemetry.feature_freeze_active} />
          <div className="h-9 w-px bg-slate-700" />
          <CreditCounter budget={telemetry.budget} />
          <div className="h-9 w-px bg-slate-700" />
          <TechDebtMeter techDebt={telemetry.tech_debt} />
          <div className="h-9 w-px bg-slate-700" />
          <MoraleMeter happiness={telemetry.user_happiness} />
          <div className="hidden hd:block h-9 w-px bg-slate-700" />
          <div className="hidden hd:block">
            <ReputationMeter reputation={telemetry.reputation} />
          </div>
        </div>
        {scrollEdges.right && (
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-slate-900 to-transparent" />
        )}
      </div>

      {/* meta controls and simulation speed */}
      <div className="flex items-center gap-2 shrink-0">
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
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg">
          <button
            onClick={() => handleSpeedChange(0)}
            className={`p-1.5 rounded-md transition-colors ${
              !telemetry.is_running ? "bg-amber-500/20 text-amber-400" : "text-slate-300 hover:bg-slate-700"
            }`}
            title={t.topbar.pause}
          >
            {telemetry.is_running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.multiplier}
              onClick={() => handleSpeedChange(opt.multiplier)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                telemetry.is_running && currentMultiplier === opt.multiplier
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
