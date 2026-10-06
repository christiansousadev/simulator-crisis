import { useEffect } from "react";
import { api } from "../services/api";
import { useGameStore } from "../store/useGameStore";
import { closeTopModal, hasOpenModal } from "../utils/modalStack";
import { LegacyModal, nextIncidentService, routeShortcut, ShortcutAction } from "./shortcutRouting";

// IS THE EVENT TARGET SOMETHING THE USER TYPES INTO
function isTypingTarget(target: HTMLElement | null): boolean {
  if (!target) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
}

// A CONTROL REACHED WITH THE KEYBOARD OWNS SPACE. A button the mouse just clicked also keeps focus,
// but there Space must still pause the game, so only :focus-visible counts.
function isKeyboardFocusedControl(target: HTMLElement | null): boolean {
  if (!target) return false;
  const control = target.closest('button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"]');
  if (!control) return false;
  try {
    return control.matches(":focus-visible");
  } catch {
    return true;
  }
}

function openLegacyModals(): LegacyModal[] {
  const s = useGameStore.getState();
  const open: LegacyModal[] = [];
  if (s.triageIncidentId) open.push("triage");
  if (s.replayIncidentId) open.push("replay");
  if (s.postMortem) open.push("postMortem");
  if (s.selectedIncident) open.push("incident");
  if (s.onboardingOpen) open.push("onboarding");
  return open;
}

async function setSpeed(speed: number) {
  try {
    if (!useGameStore.getState().telemetry.is_running) await api.startSimulation();
    await api.setSpeed(speed);
  } catch {
    // best-effort; the next telemetry frame reconciles the real engine state
  }
}

async function toggleRun() {
  try {
    if (useGameStore.getState().telemetry.is_running) await api.pauseSimulation();
    else await api.startSimulation();
  } catch {
    // best-effort
  }
}

function runAction(action: ShortcutAction) {
  const store = useGameStore.getState();
  switch (action.type) {
    case "none":
      return;
    case "close-top-modal":
      closeTopModal();
      return;
    case "close-legacy":
      if (action.modal === "triage") store.closeTriageTerminal();
      else if (action.modal === "replay") store.closeIncidentReplay();
      else if (action.modal === "postMortem") store.closePostMortem();
      else if (action.modal === "incident") store.closeIncidentDetail();
      else store.closeOnboarding();
      return;
    case "toggle-pause-menu":
      store.togglePauseMenu();
      return;
    case "toggle-run":
      void toggleRun();
      return;
    case "set-speed":
      void setSpeed(action.speed);
      return;
    case "cycle-incident": {
      const ids = store.telemetry.active_incidents.map((i) => i.service_id);
      const next = nextIncidentService(ids, store.selectedServiceId, action.direction);
      if (next) store.selectService(next);
      return;
    }
    case "toggle-build-mode":
      store.toggleBuildMode();
      return;
    case "dock-tab":
      store.setDockTab(action.tab);
      return;
    case "toggle-dock":
      store.toggleDockCollapsed();
      return;
  }
}

// GLOBAL TACTICAL KEYBOARD SHORTCUTS. One listener for the app's whole life: everything it needs is
// read from the stores at key time, so a telemetry frame never re-binds it. While a dialog is open
// only Escape works (it closes the top-most one); Tab is left alone so focus moves normally.
export function useGameShortcuts() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // a held key must not machine-gun pause toggles or tab switches
      if (e.repeat) return;
      const target = e.target as HTMLElement | null;
      const action = routeShortcut({
        key: e.key,
        shiftKey: e.shiftKey,
        hasModifier: e.ctrlKey || e.altKey || e.metaKey,
        typing: isTypingTarget(target),
        keyboardFocusedControl: isKeyboardFocusedControl(target),
        titleVisible: useGameStore.getState().titleScreenVisible,
        modalOpen: hasOpenModal(),
        legacyOpen: openLegacyModals(),
      });
      if (action.type === "none") return;
      e.preventDefault();
      runAction(action);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
