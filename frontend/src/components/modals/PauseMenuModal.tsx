import { AlertTriangle, Building2, Compass, DollarSign, HelpCircle, Home, Play, RotateCcw, Settings, Shield } from "lucide-react";
import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { launchScenario } from "../../utils/launchFlow";
import { getDayNumber, getHourOfDay } from "../../utils/officeClock";
import { playUiBackSound, playUiConfirmSound, playUiHoverSound } from "../../utils/sound";
import Modal, { ModalBody, ModalFooter, ModalHeader } from "../common/Modal";
import { handleMenuKeys } from "../flow/menuNav";
import { scenarioName } from "../../utils/scenarioName";

interface RowProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: "default" | "quiet";
}

function MenuRow({ icon, label, onClick, tone = "default" }: RowProps) {
  return (
    <button
      type="button"
      data-menu-item
      onMouseEnter={playUiHoverSound}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold text-left transition-colors duration-fast ${
        tone === "quiet"
          ? "border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400 hover:text-slate-200"
          : "border-slate-700/80 hover:bg-slate-800 text-slate-300"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// PAUSE MENU. Opening it holds the simulation (see useSimulationHolds); closing it, by any route,
// puts the run state back exactly as it was.
export default function PauseMenuModal() {
  const t = useTranslation();
  const open = useGameStore((s) => s.pauseMenuOpen);
  const closePauseMenu = useGameStore((s) => s.closePauseMenu);
  const showTitleScreen = useGameStore((s) => s.showTitleScreen);
  const openScenarioSelect = useGameStore((s) => s.openScenarioSelect);
  const openSettings = useGameStore((s) => s.openSettings);
  const openOnboarding = useGameStore((s) => s.openOnboarding);
  const tick = useGameStore((s) => s.telemetry.tick);
  const sla = useGameStore((s) => s.telemetry.sla_percentage);
  const budget = useGameStore((s) => s.telemetry.budget);
  const activeIncidents = useGameStore((s) => s.telemetry.active_incidents.length);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // a half-answered "restart?" must not greet the player on the next pause
  useEffect(() => {
    if (!open) setConfirmRestart(false);
  }, [open]);

  const handleResume = () => {
    playUiBackSound();
    closePauseMenu();
  };

  const handleRestart = () => {
    const s = useGameStore.getState();
    const scenarioId = s.telemetry.active_scenario?.scenario_id ?? null;
    const label = scenarioName(t, scenarioId);
    void launchScenario({ scenarioId, difficulty: s.telemetry.difficulty ?? "standard", label, skipBriefing: true });
  };

  const handleQuitToMenu = () => {
    playUiConfirmSound();
    closePauseMenu();
    showTitleScreen();
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (handleMenuKeys(e, listRef.current)) playUiHoverSound();
  };

  const dayStr = `${t.common.day} ${getDayNumber(tick)} · ${getHourOfDay(tick).toString().padStart(2, "0")}:00`;
  const slaTone = sla >= 99.9 ? "text-emerald-400" : sla >= 99.0 ? "text-amber-400" : "text-rose-400 font-black";

  return (
    <Modal open={open} onClose={handleResume} title={t.flow.pauseTitle} size="md" initialFocusRef={resumeRef}>
      <ModalHeader
        title={t.flow.pauseTitle}
        onClose={handleResume}
        closeLabel={t.flow.resume}
        icon={
          <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
            <Building2 className="w-5 h-5" aria-hidden="true" />
          </div>
        }
      >
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
          {t.flow.tacticalHold}
        </span>
      </ModalHeader>

      <ModalBody className="p-5 flex flex-col gap-4">
        <p className="text-xs text-slate-400 font-mono -mb-1">{dayStr}</p>

        <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 font-mono text-center">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <Shield className="w-3 h-3 text-sky-400" aria-hidden="true" /> SLA
            </span>
            <span className={`text-sm font-bold ${slaTone}`}>{sla.toFixed(2)}%</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 border-x border-slate-800">
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-emerald-400" aria-hidden="true" /> {t.flow.runway}
            </span>
            <span className="text-sm font-bold text-slate-200">${Math.round(budget).toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px] text-slate-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-400" aria-hidden="true" /> {t.flow.incidents}
            </span>
            <span className={`text-sm font-bold ${activeIncidents > 0 ? "text-rose-400 font-black" : "text-emerald-400"}`}>
              {t.flow.openCount(activeIncidents)}
            </span>
          </div>
        </div>

        <div ref={listRef} onKeyDown={onListKeyDown} className="flex flex-col gap-2">
          <button
            ref={resumeRef}
            type="button"
            data-menu-item
            onMouseEnter={playUiHoverSound}
            onClick={handleResume}
            className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-[0_0_15px_rgba(14,165,233,0.3)] transition-colors duration-fast"
          >
            <span className="flex items-center gap-2">
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              {t.flow.resume}
            </span>
            <span aria-hidden="true" className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-600/70 border border-sky-400/40 font-bold">
              ESC
            </span>
          </button>

          {confirmRestart ? (
            <div role="alertdialog" aria-label={t.flow.restartPrompt} className="flex items-center gap-2 p-2 rounded-xl bg-rose-950/50 border border-rose-500/50">
              <span className="text-xs text-rose-300 font-medium px-2">{t.flow.restartPrompt}</span>
              <button
                type="button"
                data-menu-item
                onClick={handleRestart}
                className="flex-1 py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors"
              >
                {t.flow.confirm}
              </button>
              <button
                type="button"
                data-menu-item
                onClick={() => setConfirmRestart(false)}
                className="py-1.5 px-3 rounded-lg border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                {t.flow.cancel}
              </button>
            </div>
          ) : (
            <MenuRow
              icon={<RotateCcw className="w-4 h-4 text-slate-400" aria-hidden="true" />}
              label={t.flow.restart}
              onClick={() => setConfirmRestart(true)}
            />
          )}

          <MenuRow
            icon={<Compass className="w-4 h-4 text-sky-400" aria-hidden="true" />}
            label={t.flow.changeMission}
            onClick={openScenarioSelect}
          />
          <MenuRow
            icon={<Settings className="w-4 h-4 text-slate-400" aria-hidden="true" />}
            label={t.flow.audioDisplayPrefs}
            onClick={openSettings}
          />
          <MenuRow
            icon={<HelpCircle className="w-4 h-4 text-emerald-400" aria-hidden="true" />}
            label={t.flow.cheatSheet}
            onClick={() => {
              closePauseMenu();
              openOnboarding();
            }}
          />

          <div className="h-px bg-slate-800 my-1" />

          <MenuRow
            tone="quiet"
            icon={<Home className="w-4 h-4" aria-hidden="true" />}
            label={t.flow.exitToTitle}
            onClick={handleQuitToMenu}
          />
        </div>
      </ModalBody>

      <ModalFooter className="justify-between">
        <span className="text-[11px] text-slate-500">{t.flow.pauseHint}</span>
      </ModalFooter>
    </Modal>
  );
}
