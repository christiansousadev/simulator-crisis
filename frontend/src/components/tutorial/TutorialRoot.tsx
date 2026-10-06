import { useEffect, useRef } from "react";
import { useGameStore } from "../../store/useGameStore";
import TutorialOffer from "./TutorialOffer";
import TutorialOverlay from "./TutorialOverlay";

// LIFECYCLE OF THE GUIDED TUTORIAL: never on top of the title screen. On a first run a small choice card
// is offered once the title is gone; the tour itself runs while `onboardingOpen` is set (help button,
// pause menu or the offer's "do the tutorial").
export default function TutorialRoot() {
  const open = useGameStore((s) => s.onboardingOpen);
  const offerPending = useGameStore((s) => s.tutorialOfferPending);
  const titleVisible = useGameStore((s) => s.titleScreenVisible);
  const closeOnboarding = useGameStore((s) => s.closeOnboarding);
  const overlayOn = open && !titleVisible;
  const wasShown = useRef(false);

  // going back to the title mid-tour ends it, so the next Continue does not resume halfway
  useEffect(() => {
    if (overlayOn) {
      wasShown.current = true;
    } else if (open && titleVisible && wasShown.current) {
      wasShown.current = false;
      closeOnboarding();
    }
  }, [overlayOn, open, titleVisible, closeOnboarding]);

  return (
    <>
      <TutorialOffer open={offerPending && !titleVisible && !open} />
      {overlayOn && <TutorialOverlay />}
    </>
  );
}
