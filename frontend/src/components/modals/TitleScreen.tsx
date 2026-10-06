import {
  Award,
  Building2,
  ChevronRight,
  Compass,
  Info,
  Play,
  Settings,
  Shield,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { translateDifficulty } from "../../i18n/dynamicContent";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { fetchBackendVersion, formatVersionLine } from "../../utils/appInfo";
import { getDayNumber, getHourOfDay } from "../../utils/officeClock";
import { isAudioMuted, playUiConfirmSound, playUiHoverSound, setMuted, startAmbientMusic } from "../../utils/sound";
import { preloadFlowChunks } from "../flow/lazyModals";
import { handleMenuKeys } from "../flow/menuNav";
import "../flow/flow.css";
import { scenarioName } from "../../utils/scenarioName";

// stagger step of the staged entrance (logo -> title -> tagline -> pillars -> buttons)
const STEP_MS = 90;
const OFFLINE_AFTER_MS = 4000;

function stage(index: number) {
  return { animationDelay: `${index * STEP_MS}ms` };
}

interface MenuRowProps {
  icon: ReactNode;
  label: string;
  hint?: string;
  onActivate: () => void;
  innerRef?: React.Ref<HTMLButtonElement>;
  primary?: boolean;
  children?: ReactNode;
  testId?: string;
}

// ONE ROW OF THE MAIN MENU: hover accent bar, icon nudge, hover / confirm sounds
function MenuRow({ icon, label, hint, onActivate, innerRef, primary, children, testId }: MenuRowProps) {
  return (
    <button
      ref={innerRef}
      type="button"
      data-menu-item
      data-testid={testId}
      onMouseEnter={playUiHoverSound}
      onClick={() => {
        playUiConfirmSound();
        onActivate();
      }}
      className={`flow-menu-btn group w-full text-left rounded-xl transition-colors duration-fast ${
        primary
          ? "px-5 py-3.5 bg-gradient-to-r from-sky-500 to-cyan-500 hover:from-sky-400 hover:to-cyan-400 text-white shadow-[0_0_20px_rgba(14,165,233,0.35)]"
          : "px-5 py-3 border border-slate-700/80 bg-slate-800/40 hover:bg-slate-800 text-slate-100"
      }`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-sm font-bold">
          <span className="transition-transform duration-base ease-out-expo group-hover:translate-x-1 group-focus-visible:translate-x-1">
            {icon}
          </span>
          {label}
        </span>
        {hint && <span className={`text-[11px] font-mono font-normal ${primary ? "text-sky-100/80" : "text-slate-400"}`}>{hint}</span>}
        <ChevronRight
          aria-hidden="true"
          className="w-4 h-4 shrink-0 opacity-0 -translate-x-1 transition-all duration-base group-hover:opacity-70 group-hover:translate-x-0 group-focus-visible:opacity-70 group-focus-visible:translate-x-0"
        />
      </span>
      {children}
    </button>
  );
}

export default function TitleScreen({ closing = false }: { closing?: boolean }) {
  const t = useTranslation();
  const language = useGameStore((s) => s.language);
  const hideTitleScreen = useGameStore((s) => s.hideTitleScreen);
  const openScenarioSelect = useGameStore((s) => s.openScenarioSelect);
  const openSettings = useGameStore((s) => s.openSettings);
  const openCredits = useGameStore((s) => s.openCredits);
  const openHallOfFame = useGameStore((s) => s.openHallOfFame);
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const connected = useGameStore((s) => s.connected);

  const tick = useGameStore((s) => s.telemetry.tick);
  const sla = useGameStore((s) => s.telemetry.sla_percentage);
  const budget = useGameStore((s) => s.telemetry.budget);
  const difficulty = useGameStore((s) => s.telemetry.difficulty);
  const scenarioId = useGameStore((s) => s.telemetry.active_scenario?.scenario_id ?? null);
  const openIncidents = useGameStore((s) => s.telemetry.active_incidents.length);

  const [muted, setMutedState] = useState(isAudioMuted());
  const [backendVersion, setBackendVersion] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // keyboard users land on the primary action; mouse users are unaffected
  useEffect(() => {
    primaryRef.current?.focus({ preventScroll: true });
  }, []);

  // warm the lazy dialog chunks while the title sits idle, and read the server version
  useEffect(() => {
    preloadFlowChunks();
    let cancelled = false;
    void fetchBackendVersion().then((v) => {
      if (!cancelled) setBackendVersion(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // "connecting" turns into "offline" only after a grace period (the socket needs a moment)
  useEffect(() => {
    if (connected) {
      setOffline(false);
      return;
    }
    const timer = setTimeout(() => setOffline(true), OFFLINE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [connected]);

  // the mute state can be changed from the settings dialog opened over this screen
  useEffect(() => {
    setMutedState(isAudioMuted());
  }, [settingsOpen]);

  // browsers need a gesture before audio can start: every menu action counts as one
  const withMusicStart = (action: () => void) => () => {
    startAmbientMusic();
    action();
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
    if (!next) playUiConfirmSound();
  };

  const handleNavKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (handleMenuKeys(e, navRef.current)) playUiHoverSound();
  };

  const hasProgress = tick > 0;
  const scenarioTitle = scenarioName(t, scenarioId);
  const clock = `${t.common.day} ${getDayNumber(tick)} · ${getHourOfDay(tick).toString().padStart(2, "0")}:00`;

  const serverLabel = connected ? t.flow.serverOnline : offline ? t.flow.serverOffline : t.flow.serverConnecting;
  const serverTone = connected
    ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300"
    : offline
    ? "border-rose-500/30 bg-rose-950/40 text-rose-300"
    : "border-amber-500/30 bg-amber-950/40 text-amber-300";
  const serverDot = connected ? "bg-emerald-400" : offline ? "bg-rose-400" : "bg-amber-400 animate-pulse";

  return (
    <div
      data-testid="title-screen"
      className={`fixed inset-0 z-title flex items-center justify-between p-6 sm:p-12 md:p-16 text-white select-none overflow-hidden ${
        closing ? "pointer-events-none" : ""
      }`}
    >
      {/* lighter veil: heavy on the card's side, nearly clear on the right so the live office shows */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 pointer-events-none bg-gradient-to-r from-slate-950/92 via-slate-950/50 to-slate-950/10 ${
          closing ? "animate-backdrop-out" : "animate-backdrop-in"
        }`}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none bg-gradient-to-b from-slate-950/70 via-transparent to-slate-950/70"
      />
      <div aria-hidden="true" className="motion-only absolute inset-0 pointer-events-none flow-title-grid" />
      <div aria-hidden="true" className="motion-only absolute inset-x-0 top-0 pointer-events-none overflow-hidden h-full">
        <div className="flow-title-beam w-full" />
      </div>

      {/* left-aligned command card */}
      <div
        className={`relative z-10 w-full max-w-md flex flex-col gap-6 p-7 sm:p-8 rounded-3xl border border-slate-700/80 bg-slate-900/85 shadow-2xl backdrop-blur-xl ${
          closing ? "flow-card-out" : ""
        }`}
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="animate-slide-up-in p-3 rounded-2xl bg-gradient-to-br from-sky-500/25 to-cyan-500/10 text-sky-400 border border-sky-400/30 shadow-[0_0_15px_rgba(56,189,248,0.25)]"
                style={stage(0)}
              >
                <Building2 className="w-8 h-8" aria-hidden="true" />
              </div>
              <div>
                <h1
                  className="animate-slide-up-in font-heading font-black text-3xl sm:text-4xl tracking-wider leading-none"
                  style={stage(1)}
                >
                  IncidentZero
                </h1>
                <span
                  className="animate-slide-up-in mt-1 inline-block px-2 py-0.5 rounded text-[9px] font-mono font-bold tracking-widest uppercase bg-sky-950/70 border border-sky-500/40 text-sky-300"
                  style={stage(1)}
                >
                  {t.flow.productLine}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleMute}
              onMouseEnter={playUiHoverSound}
              aria-pressed={muted}
              aria-label={muted ? t.flow.unmuteAudio : t.flow.muteAudio}
              title={muted ? t.flow.unmuteAudio : t.flow.muteAudio}
              className="animate-slide-up-in p-2.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:border-slate-700 text-slate-400 hover:text-sky-300 transition-colors duration-fast"
              style={stage(1)}
            >
              {muted ? <VolumeX className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4" aria-hidden="true" />}
            </button>
          </div>

          <p className="animate-slide-up-in text-xs text-slate-300 font-mono tracking-wide" style={stage(2)}>
            {t.titleScreen.tagline}
          </p>

          <div className="animate-slide-up-in flex flex-wrap items-center gap-1.5 pt-1" style={stage(3)}>
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

        <nav ref={navRef} aria-label={t.flow.navLabel} onKeyDown={handleNavKeyDown} className="flex flex-col gap-2.5">
          <div className="animate-slide-up-in" style={stage(4)}>
            <MenuRow
              primary
              testId="title-primary"
              innerRef={primaryRef}
              icon={<Play className="w-4 h-4 fill-current" aria-hidden="true" />}
              label={hasProgress ? t.titleScreen.continue : t.flow.startOperation}
              hint={hasProgress ? undefined : t.flow.startOperationHint}
              onActivate={withMusicStart(hideTitleScreen)}
            >
              {hasProgress && (
                <span className="mt-2.5 grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-lg bg-slate-950/40 px-3 py-2 font-mono text-[11px] text-sky-50">
                  <span className="col-span-3 truncate font-sans text-xs font-semibold text-white">
                    {scenarioTitle} · {translateDifficulty(difficulty ?? "standard", language)}
                  </span>
                  <span>{clock}</span>
                  <span className="flex items-center gap-1">
                    <Shield className="w-3 h-3" aria-hidden="true" />
                    <span className="sr-only">{t.flow.slaLabel}</span>
                    {sla.toFixed(1)}%
                  </span>
                  <span>
                    <span className="sr-only">{t.flow.cashLabel}</span>${Math.round(budget).toLocaleString()}
                  </span>
                  <span className="col-span-3">{t.flow.incidentsOpen(openIncidents)}</span>
                </span>
              )}
            </MenuRow>
          </div>

          <div className="animate-slide-up-in" style={stage(5)}>
            <MenuRow
              icon={<Compass className="w-4 h-4 text-sky-400" aria-hidden="true" />}
              label={t.titleScreen.newGame}
              hint={t.flow.scenariosHint}
              onActivate={withMusicStart(openScenarioSelect)}
            />
          </div>

          <div className="animate-slide-up-in" style={stage(6)}>
            <MenuRow
              icon={<Award className="w-4 h-4 text-amber-400" aria-hidden="true" />}
              label={t.titleScreen.hallOfFame}
              hint={t.flow.hallOfFameHint}
              onActivate={withMusicStart(openHallOfFame)}
            />
          </div>

          <div className="animate-slide-up-in grid grid-cols-2 gap-2 pt-1" style={stage(7)}>
            <MenuRow
              icon={<Settings className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />}
              label={t.titleScreen.settings}
              onActivate={withMusicStart(openSettings)}
            />
            <MenuRow
              icon={<Info className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />}
              label={t.titleScreen.credits}
              onActivate={withMusicStart(openCredits)}
            />
          </div>
        </nav>

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[10px] text-slate-500 font-mono">
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-cyan-400" aria-hidden="true" />
            {t.flow.ledgerArmed}
          </span>
          <span className="flex items-center gap-2">
            <span
              data-testid="title-server-status"
              role="status"
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${serverTone}`}
            >
              <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${serverDot}`} />
              {serverLabel}
            </span>
            <span data-testid="title-version">{formatVersionLine(backendVersion)}</span>
          </span>
        </div>
        <p aria-hidden="true" className="-mt-3 text-center text-[10px] text-slate-600 font-mono">
          {t.flow.navHint}
        </p>
      </div>

      {/* right-side ambient callout (desktop) */}
      <div
        aria-hidden="true"
        className="hidden lg:flex flex-col items-end gap-3 text-right max-w-sm pr-6 self-start mt-[14vh] pointer-events-none animate-slide-up-in"
        style={stage(8)}
      >
        <div className="px-3.5 py-1.5 rounded-full border border-sky-500/30 bg-sky-950/40 backdrop-blur-md text-sky-300 text-xs font-mono font-bold tracking-widest uppercase">
          {t.flow.heroBadge}
        </div>
        <h2 className="font-heading font-bold text-2xl text-slate-100 leading-tight drop-shadow-lg">{t.flow.heroTitle}</h2>
        <p className="text-xs text-slate-300 leading-relaxed font-sans drop-shadow">{t.flow.heroBody}</p>
      </div>
    </div>
  );
}
