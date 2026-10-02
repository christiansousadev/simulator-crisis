import {
  Award,
  Building2,
  Compass,
  FileCode,
  Gamepad2,
  Info,
  Play,
  Settings,
  Shield,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { getDayNumber, getHourOfDay } from "../../utils/officeClock";
import { isAudioMuted, setAudioMuted, startAmbientMusic } from "../../utils/sound";

export default function TitleScreen() {
  const t = useTranslation();
  const hideTitleScreen = useGameStore((s) => s.hideTitleScreen);
  const openScenarioSelect = useGameStore((s) => s.openScenarioSelect);
  const openSettings = useGameStore((s) => s.openSettings);
  const openCredits = useGameStore((s) => s.openCredits);
  const openHallOfFame = useGameStore((s) => s.openHallOfFame);
  const telemetry = useGameStore((s) => s.telemetry);
  const [muted, setMutedState] = useState(isAudioMuted());

  const withMusicStart = (action: () => void) => () => {
    startAmbientMusic();
    action();
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !muted;
    setMutedState(next);
    setAudioMuted(next);
  };

  const hasProgress = telemetry.tick > 0;
  const dayStr = `${t.common.day} ${getDayNumber(telemetry.tick)} · ${getHourOfDay(telemetry.tick).toString().padStart(2, "0")}:00`;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-between p-6 sm:p-12 md:p-16 bg-slate-950/75 backdrop-blur-md text-white select-none overflow-hidden animate-backdrop-in">
      {/* Dynamic technical grid backdrop with scanning beam */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.18) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-30"
        style={{
          background: "radial-gradient(ellipse at 25% 50%, rgba(14, 165, 233, 0.18), transparent 60%)",
        }}
      />

      {/* Left-Aligned Command Terminal Card */}
      <div className="relative z-10 w-full max-w-md flex flex-col gap-6 p-7 sm:p-8 rounded-3xl border border-slate-700/80 bg-slate-900/90 shadow-2xl backdrop-blur-xl animate-pop-in">
        {/* Brand Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-br from-sky-500/25 to-cyan-500/10 text-sky-400 border border-sky-400/30 shadow-[0_0_15px_rgba(56,189,248,0.25)]">
                <Building2 className="w-8 h-8" />
              </div>
              <div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase bg-sky-950/70 border border-sky-500/40 text-sky-300">
                  CRISIS SIMULATOR v2.5
                </span>
                <h1 className="font-heading font-black text-3xl sm:text-4xl tracking-wider leading-none mt-1">
                  IncidentZero
                </h1>
              </div>
            </div>

            <button
              onClick={handleToggleMute}
              className="p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-400 hover:text-sky-300 transition-colors"
              title={muted ? "Unmute Audio" : "Mute Audio"}
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>

          <p className="text-xs text-slate-400 font-mono tracking-wide">{t.titleScreen.tagline}</p>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {t.titleScreen.pillars.map((pillar) => (
              <span
                key={pillar}
                className="px-2 py-0.5 rounded-md border border-slate-800 bg-slate-950/70 text-slate-400 text-[10px] font-semibold tracking-wider uppercase font-mono"
              >
                {pillar}
              </span>
            ))}
          </div>
        </div>

        {/* Ongoing Session Quick Status Banner (if active) */}
        {hasProgress && (
          <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300 font-semibold">{dayStr}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <span className="flex items-center gap-1 text-sky-400 font-bold">
                <Shield className="w-3 h-3" /> {telemetry.sla_percentage.toFixed(1)}%
              </span>
              <span className="text-emerald-400 font-bold">${Math.round(telemetry.budget).toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Primary Menu Options */}
        <nav aria-label="Main Menu" className="flex flex-col gap-2.5">
          <button
            onClick={withMusicStart(hideTitleScreen)}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white font-bold text-sm shadow-[0_0_20px_rgba(14,165,233,0.35)] transition-all active:scale-[0.98]"
          >
            <span className="flex items-center gap-2.5">
              <Play className="w-4 h-4 fill-current" />
              {hasProgress ? t.titleScreen.continue : "Launch Operations Console"}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-900/60 border border-white/20 font-bold uppercase">
              Enter
            </span>
          </button>

          <button
            onClick={withMusicStart(() => {
              hideTitleScreen();
              openScenarioSelect();
            })}
            className="w-full flex items-center justify-between px-5 py-3 rounded-xl border border-slate-700/80 bg-slate-800/40 hover:bg-slate-800 text-sm font-bold transition-all active:scale-[0.98]"
          >
            <span className="flex items-center gap-2.5">
              <Compass className="w-4 h-4 text-sky-400" />
              Crisis Scenarios & Drills
            </span>
            <span className="text-[11px] font-mono text-slate-400 font-normal">Black Friday · Chaos</span>
          </button>

          <button
            onClick={withMusicStart(openHallOfFame)}
            className="w-full flex items-center justify-between px-5 py-3 rounded-xl border border-slate-700/80 bg-slate-800/40 hover:bg-slate-800 text-sm font-bold transition-all active:scale-[0.98]"
          >
            <span className="flex items-center gap-2.5">
              <Award className="w-4 h-4 text-amber-400" />
              {t.titleScreen.hallOfFame}
            </span>
            <span className="text-[11px] font-mono text-slate-400 font-normal">Ranks & Records</span>
          </button>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={withMusicStart(openSettings)}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              {t.titleScreen.settings}
            </button>
            <button
              onClick={withMusicStart(openCredits)}
              className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Info className="w-3.5 h-3.5 text-slate-400" />
              {t.titleScreen.credits}
            </button>
          </div>
        </nav>

        {/* Footer Audit Guarantee */}
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-cyan-400" />
            SOX-404 LEDGER ARMED
          </span>
          <span>BUILD 2026.10</span>
        </div>
      </div>

      {/* Right-Side Ambient Callout (Visible on Desktop) */}
      <div className="hidden lg:flex flex-col items-end gap-3 text-right max-w-sm pr-6 pointer-events-none">
        <div className="px-3.5 py-1.5 rounded-full border border-sky-500/30 bg-sky-950/40 backdrop-blur-md text-sky-300 text-xs font-mono font-bold tracking-widest uppercase">
          SERVER-AUTHORITATIVE SRE SIMULATION
        </div>
        <h3 className="font-heading font-bold text-2xl text-slate-200 leading-tight">
          Survive cascading microservice failures under real governance pressure.
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed font-sans">
          Manage technical debt, engineer on-call fatigue, change advisory dilemmas, and AI auditor regulatory reviews.
        </p>
      </div>
    </div>
  );
}
