import { useEffect, useRef } from "react";
import AchievementToast from "./components/common/AchievementToast";
import FloatingCombatText from "./components/common/FloatingCombatText";
import IncidentResolutionSummary from "./components/common/IncidentResolutionSummary";
import ImpactFlash from "./components/common/ImpactFlash";
import BottomDock from "./components/layout/BottomDock";
import CorporateNewsTicker from "./components/layout/CorporateNewsTicker";
import ScreenTransition from "./components/layout/ScreenTransition";
import Topbar from "./components/layout/Topbar";
import CABDilemmaModal from "./components/modals/CABDilemmaModal";
import OnboardingModal from "./components/modals/OnboardingModal";
import TitleScreen from "./components/modals/TitleScreen";
import IsometricOffice from "./components/office/IsometricOffice";
import LazyDialogs from "./components/flow/LazyDialogs";
import LazyModalHost from "./components/flow/LazyModalHost";
import { HallOfFameModal, PostMatchDebriefModal, preloadGameplayChunks, ScenarioSelectModal } from "./components/flow/lazyModals";
import { usePresenceFlag } from "./hooks/usePresence";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { useRunAchievements } from "./hooks/useRunAchievements";
import { useSimulationHolds } from "./hooks/useSimulationHolds";
import { useFlowStore } from "./store/useFlowStore";
import { useBackgroundMusic } from "./hooks/useBackgroundMusic";
import { useGameAudio } from "./hooks/useGameAudio";
import { useGameShortcuts } from "./hooks/useGameShortcuts";
import { useScenarioObjectives } from "./hooks/useScenarioObjectives";
import { useSimulationSocket } from "./hooks/useSimulationSocket";
import { useGameStore } from "./store/useGameStore";
import { computeDefconLevel } from "./utils/defcon";

// every dialog that is not needed for the first paint is code-split in components/flow/lazyModals.ts
// (LazyDialogs + the hosts below); the title screen warms the chunks while idle, and LazyModalHost
// shows a skeleton if one is still arriving. CAB stays eager (a timed decision never waits on a chunk); the live incident dialogs are fetched the
// moment the title is dismissed.

// how long the title screen stays mounted to play its exit
const TITLE_EXIT_MS = 420;
// how long the HUD entrance classes stay on the root after the title is dismissed
const OFFICE_INTRO_MS = 1300;

export default function App() {
  useSimulationSocket();
  useGameAudio();
  useBackgroundMusic();
  useScenarioObjectives();
  useGameShortcuts();
  useSimulationHolds();
  useRunAchievements();

  const status = useGameStore((s) => s.telemetry.status);
  // select the derived level only: subscribing to the whole telemetry object re-rendered the
  // entire tree (office svg, dock, every modal) on every single tick
  const defconLevel = useGameStore((s) => computeDefconLevel(s.telemetry));
  const reducedMotion = useReducedMotion();
  const reducedMotionPref = useGameStore((s) => s.reducedMotionPref);
  const titleScreenVisible = useGameStore((s) => s.titleScreenVisible);
  const language = useGameStore((s) => s.language);
  const hallOfFameOpen = useGameStore((s) => s.hallOfFameOpen);
  const closeHallOfFame = useGameStore((s) => s.closeHallOfFame);
  const scenarioSelectOpen = useGameStore((s) => s.scenarioSelectOpen);
  const closeScenarioSelect = useGameStore((s) => s.closeScenarioSelect);
  const officeIntro = useFlowStore((s) => s.officeIntro);
  const title = usePresenceFlag(titleScreenVisible, TITLE_EXIT_MS);
  const screenShakeSeq = useGameStore((s) => s.screenShakeSeq);
  const screenShakeMagnitude = useGameStore((s) => s.screenShakeMagnitude);
  const highContrast = useGameStore((s) => s.highContrast);
  const colorblindSafe = useGameStore((s) => s.colorblindSafe);
  const rootRef = useRef<HTMLDivElement>(null);

  // mirror the effective reduced-motion choice onto <html> so the CSS rules in index.css apply
  useEffect(() => {
    const el = document.documentElement;
    if (reducedMotionPref === "system") el.removeAttribute("data-reduce-motion");
    else el.setAttribute("data-reduce-motion", reducedMotionPref);
  }, [reducedMotionPref]);

  // keep <html lang> in step with the language setting (screen readers pick the voice from it)
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // the live-incident dialogs are lazy chunks: fetch them as soon as the player enters the office
  useEffect(() => {
    if (!titleScreenVisible) preloadGameplayChunks();
  }, [titleScreenVisible]);

  // title -> office: wipe line, then the HUD slides in piece by piece (classes on the root)
  const titleWasVisible = useRef(titleScreenVisible);
  useEffect(() => {
    const was = titleWasVisible.current;
    titleWasVisible.current = titleScreenVisible;
    if (!was || titleScreenVisible) return;
    const flow = useFlowStore.getState();
    flow.markTitleLeaving();
    flow.beginOfficeIntro();
    const timer = setTimeout(() => useFlowStore.getState().endOfficeIntro(), OFFICE_INTRO_MS);
    return () => clearTimeout(timer);
  }, [titleScreenVisible]);

  // imperative class toggle rather than a react-controlled class so a rapid second shake
  // restarts the css animation cleanly instead of being swallowed by an unchanged classname
  useEffect(() => {
    if (screenShakeSeq === 0) return;
    if (reducedMotion) return;
    const el = rootRef.current;
    if (!el) return;
    const shakeClass = screenShakeMagnitude === "heavy" ? "screen-shake-heavy" : "screen-shake-light";
    el.classList.remove("screen-shake-light", "screen-shake-heavy");
    // force reflow so re-adding the same class restarts the animation
    void el.offsetWidth;
    el.classList.add(shakeClass);
    const timer = setTimeout(() => el.classList.remove(shakeClass), 700);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenShakeSeq, screenShakeMagnitude]);

  // modals reachable from the title screen or gameplay
  const alwaysMountedModals = (
    <>
      <LazyModalHost open={hallOfFameOpen} onCancel={closeHallOfFame}>
        <HallOfFameModal />
      </LazyModalHost>
      <LazyModalHost open={scenarioSelectOpen} onCancel={closeScenarioSelect}>
        <ScenarioSelectModal />
      </LazyModalHost>
      <LazyDialogs />
    </>
  );

  return (
    <div
      ref={rootRef}
      data-high-contrast={highContrast || undefined}
      data-colorblind-safe={colorblindSafe || undefined}
      className={`h-screen w-screen flex flex-col overflow-hidden select-none relative ${officeIntro ? "office-intro" : ""}`}
    >
      <div className="defcon-vignette" data-defcon={defconLevel} />
      <ImpactFlash />
      <FloatingCombatText />
      <IncidentResolutionSummary />

      <Topbar />
      <CorporateNewsTicker />
      {/* wrapper for the title's slow camera drift: a transform on this div never touches the
          office's own pan/zoom camera inside it */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className={`flex-1 min-h-0 flex flex-col ${title.mounted ? (title.closing ? "flow-title-drift-out" : "flow-title-drift") : ""}`}>
          <IsometricOffice />
        </div>
      </div>
      <BottomDock />

      {/* Living Main Menu Overlay */}
      {title.mounted && <TitleScreen closing={title.closing} />}
      <ScreenTransition />

      <CABDilemmaModal />
      <OnboardingModal />
      <AchievementToast />
      {alwaysMountedModals}

      {(status === "bankrupted" || status === "victory") && (
        <LazyModalHost open>
          <PostMatchDebriefModal />
        </LazyModalHost>
      )}
    </div>
  );
}
