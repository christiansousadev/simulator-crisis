import { useEffect, useRef } from "react";
import AchievementToast from "./components/common/AchievementToast";
import FloatingCombatText from "./components/common/FloatingCombatText";
import IncidentResolutionSummary from "./components/common/IncidentResolutionSummary";
import ImpactFlash from "./components/common/ImpactFlash";
import BottomDock from "./components/layout/BottomDock";
import CorporateNewsTicker from "./components/layout/CorporateNewsTicker";
import Topbar from "./components/layout/Topbar";
import CABDilemmaModal from "./components/modals/CABDilemmaModal";
import CreditsModal from "./components/modals/CreditsModal";
import HallOfFameModal from "./components/modals/HallOfFameModal";
import IncidentDetailModal from "./components/modals/IncidentDetailModal";
import IncidentReplayModal from "./components/modals/IncidentReplayModal";
import LogTriageTerminal from "./components/modals/LogTriageTerminal";
import OnboardingModal from "./components/modals/OnboardingModal";
import PostMatchDebriefModal from "./components/modals/PostMatchDebriefModal";
import PostMortemModal from "./components/modals/PostMortemModal";
import ScenarioBriefingModal from "./components/modals/ScenarioBriefingModal";
import ScenarioBuilderModal from "./components/modals/ScenarioBuilderModal";
import ScenarioSelectModal from "./components/modals/ScenarioSelectModal";
import SettingsModal from "./components/modals/SettingsModal";
import TitleScreen from "./components/modals/TitleScreen";
import IsometricOffice from "./components/office/IsometricOffice";
import { useBackgroundMusic } from "./hooks/useBackgroundMusic";
import { useGameAudio } from "./hooks/useGameAudio";
import { useScenarioObjectives } from "./hooks/useScenarioObjectives";
import { useSimulationSocket } from "./hooks/useSimulationSocket";
import { useGameStore } from "./store/useGameStore";
import { computeDefconLevel } from "./utils/defcon";

export default function App() {
  useSimulationSocket();
  useGameAudio();
  useBackgroundMusic();
  useScenarioObjectives();

  const status = useGameStore((s) => s.telemetry.status);
  const telemetry = useGameStore((s) => s.telemetry);
  const defconLevel = computeDefconLevel(telemetry);
  const titleScreenVisible = useGameStore((s) => s.titleScreenVisible);
  const screenShakeSeq = useGameStore((s) => s.screenShakeSeq);
  const screenShakeMagnitude = useGameStore((s) => s.screenShakeMagnitude);
  const highContrast = useGameStore((s) => s.highContrast);
  const colorblindSafe = useGameStore((s) => s.colorblindSafe);
  const rootRef = useRef<HTMLDivElement>(null);

  // imperative class toggle rather than a react-controlled class so a rapid second shake
  // restarts the css animation cleanly instead of being swallowed by an unchanged classname
  useEffect(() => {
    if (screenShakeSeq === 0) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = rootRef.current;
    if (!el) return;
    const shakeClass = screenShakeMagnitude === "heavy" ? "screen-shake-heavy" : "screen-shake-light";
    el.classList.remove("screen-shake-light", "screen-shake-heavy");
    // force reflow so re-adding the same class restarts the animation
    void el.offsetWidth;
    el.classList.add(shakeClass);
    const timer = setTimeout(() => el.classList.remove(shakeClass), 700);
    return () => clearTimeout(timer);
  }, [screenShakeSeq, screenShakeMagnitude]);

  // modals reachable from the title screen must render even while it is up
  const alwaysMountedModals = (
    <>
      <SettingsModal />
      <CreditsModal />
      <HallOfFameModal />
      <ScenarioSelectModal />
      <ScenarioBuilderModal />
      <ScenarioBriefingModal />
    </>
  );

  if (titleScreenVisible) {
    return (
      <>
        <TitleScreen />
        {alwaysMountedModals}
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      data-high-contrast={highContrast || undefined}
      data-colorblind-safe={colorblindSafe || undefined}
      className="h-screen w-screen flex flex-col overflow-hidden select-none relative"
    >
      <div className="defcon-vignette" data-defcon={defconLevel} />
      <ImpactFlash />
      <FloatingCombatText />
      <IncidentResolutionSummary />

      <Topbar />
      <CorporateNewsTicker />
      <IsometricOffice />
      <BottomDock />

      <IncidentDetailModal />
      <PostMortemModal />
      <IncidentReplayModal />
      <CABDilemmaModal />
      <OnboardingModal />
      <LogTriageTerminal />
      <AchievementToast />
      {alwaysMountedModals}

      {(status === "bankrupted" || status === "victory") && <PostMatchDebriefModal />}
    </div>
  );
}
