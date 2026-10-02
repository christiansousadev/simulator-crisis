import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Compass,
  DollarSign,
  HelpCircle,
  Home,
  Play,
  RotateCcw,
  Settings,
  Shield,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { api } from "../../services/api";
import { useGameStore } from "../../store/useGameStore";
import { getDayNumber, getHourOfDay } from "../../utils/officeClock";

export default function PauseMenuModal() {
  const t = useTranslation();
  const pauseMenuOpen = useGameStore((s) => s.pauseMenuOpen);
  const closePauseMenu = useGameStore((s) => s.closePauseMenu);
  const showTitleScreen = useGameStore((s) => s.showTitleScreen);
  const openScenarioSelect = useGameStore((s) => s.openScenarioSelect);
  const openSettings = useGameStore((s) => s.openSettings);
  const openOnboarding = useGameStore((s) => s.openOnboarding);
  const telemetry = useGameStore((s) => s.telemetry);
  const [confirmRestart, setConfirmRestart] = useState(false);

  if (!pauseMenuOpen) return null;

  const handleResume = async () => {
    try {
      if (!telemetry.is_running) {
        await api.startSimulation();
      }
    } catch {
      // best-effort
    }
    closePauseMenu();
  };

  const handleRestart = async () => {
    try {
      await api.resetSimulation(telemetry.active_scenario?.scenario_id, telemetry.difficulty);
      closePauseMenu();
    } catch {
      // best-effort
    }
  };

  const handleQuitToMenu = async () => {
    try {
      await api.pauseSimulation();
    } catch {
      // best-effort
    }
    closePauseMenu();
    showTitleScreen();
  };

  const activeIncidents = telemetry.active_incidents.length;
  const dayStr = `${t.common.day} ${getDayNumber(telemetry.tick)} · ${getHourOfDay(telemetry.tick).toString().padStart(2, "0")}:00`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Simulation Paused"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-backdrop-in"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/95 text-slate-100 p-6 shadow-2xl animate-modal-in flex flex-col gap-5">
        {/* CRT Scanline effect on pause */}
        <div
          className="absolute inset-0 pointer-events-none rounded-2xl opacity-15 overflow-hidden"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to bottom, rgba(56,189,248,0.15) 0px, rgba(56,189,248,0.15) 2px, transparent 2px, transparent 4px)",
          }}
        />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold tracking-wide flex items-center gap-2">
                <span>SIMULATION PAUSED</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  TACTICAL HOLD
                </span>
              </h2>
              <p className="text-xs text-slate-400 font-mono">{dayStr}</p>
            </div>
          </div>
          <button
            onClick={handleResume}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Resume"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Situation Report Card */}
        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 font-mono text-center">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Shield className="w-3 h-3 text-sky-400" /> SLA
            </span>
            <span
              className={`text-sm font-bold ${
                telemetry.sla_percentage >= 99.9
                  ? "text-emerald-400"
                  : telemetry.sla_percentage >= 99.0
                  ? "text-amber-400"
                  : "text-rose-400 font-black"
              }`}
            >
              {telemetry.sla_percentage.toFixed(2)}%
            </span>
          </div>

          <div className="flex flex-col items-center gap-0.5 border-x border-slate-800">
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-emerald-400" /> RUNWAY
            </span>
            <span className="text-sm font-bold text-slate-200">${Math.round(telemetry.budget).toLocaleString()}</span>
          </div>

          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400" /> INCIDENTS
            </span>
            <span className={`text-sm font-bold ${activeIncidents > 0 ? "text-rose-400 animate-pulse font-black" : "text-emerald-400"}`}>
              {activeIncidents} OPEN
            </span>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleResume}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-all active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <Play className="w-4 h-4 fill-current" />
              Resume Simulation
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-600/70 border border-sky-400/40 font-bold">
              SPACE
            </span>
          </button>

          {confirmRestart ? (
            <div className="flex items-center gap-2 p-2 rounded-xl bg-rose-950/50 border border-rose-500/50">
              <span className="text-xs text-rose-300 font-medium px-2">Restart current scenario?</span>
              <button
                onClick={handleRestart}
                className="flex-1 py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmRestart(false)}
                className="py-1.5 px-3 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmRestart(true)}
              className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-colors"
            >
              <span className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-slate-400" />
                Restart Scenario
              </span>
            </button>
          )}

          <button
            onClick={() => {
              closePauseMenu();
              openScenarioSelect();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-colors"
          >
            <span className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-sky-400" />
              Change Mission / Scenario
            </span>
          </button>

          <button
            onClick={() => {
              closePauseMenu();
              openSettings();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-colors"
          >
            <span className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-400" />
              Audio, Display & Preferences
            </span>
          </button>

          <button
            onClick={() => {
              closePauseMenu();
              openOnboarding();
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-700/80 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-colors"
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-emerald-400" />
              Runbook Cheat Sheet & Tutorial
            </span>
          </button>

          <div className="h-px bg-slate-800 my-1" />

          <button
            onClick={handleQuitToMenu}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400 hover:text-slate-200 text-xs font-bold transition-colors"
          >
            <span className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Exit to Main Title Screen
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
