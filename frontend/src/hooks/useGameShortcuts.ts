import { useEffect } from "react";
import { api } from "../services/api";
import { useGameStore } from "../store/useGameStore";

// GLOBAL TACTICAL KEYBOARD SHORTCUTS FOR CRISIS SIMULATION
export function useGameShortcuts() {
  const telemetry = useGameStore((s) => s.telemetry);
  const toggleBuildMode = useGameStore((s) => s.toggleBuildMode);
  const togglePauseMenu = useGameStore((s) => s.togglePauseMenu);
  const pauseMenuOpen = useGameStore((s) => s.pauseMenuOpen);
  const closePauseMenu = useGameStore((s) => s.closePauseMenu);
  const selectService = useGameStore((s) => s.selectService);
  const titleScreenVisible = useGameStore((s) => s.titleScreenVisible);
  const selectedIncident = useGameStore((s) => s.selectedIncident);
  const closeIncidentDetail = useGameStore((s) => s.closeIncidentDetail);
  const triageIncidentId = useGameStore((s) => s.triageIncidentId);
  const closeTriageTerminal = useGameStore((s) => s.closeTriageTerminal);
  const postMortem = useGameStore((s) => s.postMortem);
  const closePostMortem = useGameStore((s) => s.closePostMortem);
  const settingsOpen = useGameStore((s) => s.settingsOpen);
  const closeSettings = useGameStore((s) => s.closeSettings);
  const scenarioSelectOpen = useGameStore((s) => s.scenarioSelectOpen);
  const closeScenarioSelect = useGameStore((s) => s.closeScenarioSelect);
  const onboardingOpen = useGameStore((s) => s.onboardingOpen);
  const closeOnboarding = useGameStore((s) => s.closeOnboarding);
  const setDockTab = useGameStore((s) => s.setDockTab);
  const toggleDockCollapsed = useGameStore((s) => s.toggleDockCollapsed);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // ignore hotkeys when typing in form inputs, textareas, etc.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      // Do not hijack browser shortcuts (Ctrl+R, Ctrl+C, Alt+Tab, etc.)
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      if (titleScreenVisible) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          useGameStore.getState().hideTitleScreen();
        }
        return;
      }

      // Escape: hierarchy of dismissing modals, or toggling tactical pause
      if (e.key === "Escape") {
        e.preventDefault();
        if (selectedIncident) {
          closeIncidentDetail();
          return;
        }
        if (triageIncidentId) {
          closeTriageTerminal();
          return;
        }
        if (postMortem) {
          closePostMortem();
          return;
        }
        if (settingsOpen) {
          closeSettings();
          return;
        }
        if (scenarioSelectOpen) {
          closeScenarioSelect();
          return;
        }
        if (onboardingOpen) {
          closeOnboarding();
          return;
        }
        if (pauseMenuOpen) {
          closePauseMenu();
          return;
        }
        togglePauseMenu();
        return;
      }

      // Space: Toggle Pause / Resume
      if (e.key === " ") {
        e.preventDefault();
        if (pauseMenuOpen) {
          closePauseMenu();
          if (!telemetry.is_running) {
            await api.startSimulation().catch(() => {});
          }
          return;
        }
        try {
          if (telemetry.is_running) {
            await api.pauseSimulation();
          } else {
            await api.startSimulation();
          }
        } catch {
          // best-effort
        }
        return;
      }

      // Speeds: 1, 2, 5
      if (e.key === "1") {
        e.preventDefault();
        if (!telemetry.is_running) await api.startSimulation().catch(() => {});
        await api.setSpeed(1).catch(() => {});
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        if (!telemetry.is_running) await api.startSimulation().catch(() => {});
        await api.setSpeed(2).catch(() => {});
        return;
      }
      if (e.key === "5") {
        e.preventDefault();
        if (!telemetry.is_running) await api.startSimulation().catch(() => {});
        await api.setSpeed(5).catch(() => {});
        return;
      }

      // Tab: Cycle through active incidents
      if (e.key === "Tab") {
        e.preventDefault();
        const active = telemetry.active_incidents;
        if (active.length === 0) return;
        const currentId = useGameStore.getState().selectedServiceId;
        const currentIndex = active.findIndex((i) => i.service_id === currentId);
        const nextIndex = (currentIndex + 1) % active.length;
        const nextServiceId = active[nextIndex].service_id;
        selectService(nextServiceId);
        return;
      }

      // B: Toggle Build Mode
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleBuildMode();
        return;
      }

      // Dock tab shortcuts: I, M, C, U, R, A, D
      const k = e.key.toLowerCase();
      if (k === "i") {
        e.preventDefault();
        setDockTab("incidents");
        return;
      }
      if (k === "m") {
        e.preventDefault();
        setDockTab("directives");
        return;
      }
      if (k === "c") {
        e.preventDefault();
        setDockTab("compliance");
        return;
      }
      if (k === "u") {
        e.preventDefault();
        setDockTab("upgrades");
        return;
      }
      if (k === "r") {
        e.preventDefault();
        setDockTab("roster");
        return;
      }
      if (k === "a") {
        e.preventDefault();
        setDockTab("achievements");
        return;
      }
      if (k === "g") {
        e.preventDefault();
        setDockTab("metrics");
        return;
      }
      if (k === "d") {
        e.preventDefault();
        toggleDockCollapsed();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    titleScreenVisible,
    telemetry,
    toggleBuildMode,
    togglePauseMenu,
    pauseMenuOpen,
    closePauseMenu,
    selectService,
    selectedIncident,
    closeIncidentDetail,
    triageIncidentId,
    closeTriageTerminal,
    postMortem,
    closePostMortem,
    settingsOpen,
    closeSettings,
    scenarioSelectOpen,
    closeScenarioSelect,
    onboardingOpen,
    closeOnboarding,
    setDockTab,
    toggleDockCollapsed,
  ]);
}
