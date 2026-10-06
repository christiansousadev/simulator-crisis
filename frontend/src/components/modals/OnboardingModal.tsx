import { lazy, Suspense } from "react";
import { usePresenceFlag } from "../../hooks/usePresence";
import { useGameStore } from "../../store/useGameStore";

// the guided tutorial lives in components/tutorial; this stays the single mount point App.tsx uses,
// and lazy-loads the whole feature so it costs nothing until a tutorial is offered or replayed
const TutorialRoot = lazy(() => import("../tutorial/TutorialRoot"));

export default function OnboardingModal() {
  const active = useGameStore((s) => s.onboardingOpen || s.tutorialOfferPending);
  // keep it mounted a moment after closing so the offer card can animate out
  const { mounted } = usePresenceFlag(active, 400);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <TutorialRoot />
    </Suspense>
  );
}
