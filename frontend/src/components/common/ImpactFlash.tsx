import { useEffect, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useGameStore } from "../../store/useGameStore";

const FLASH_MS = 500;
// the reduced-motion border holds a little longer, since it does not move to catch the eye
const BORDER_MS = 700;

// FULL-SCREEN RED VIGNETTE FLASH FIRED ON A FRESH P1 ALARM OR A BANKRUPTCY TRANSITION. With reduced
// motion it is the stand-in for the scene shake: a static red border, no animation.
export default function ImpactFlash() {
  const impactFlashSeq = useGameStore((s) => s.impactFlashSeq);
  const [visible, setVisible] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (impactFlashSeq === 0) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), reduced ? BORDER_MS : FLASH_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impactFlashSeq]);

  if (!visible) return null;

  if (reduced) {
    return (
      <div
        data-testid="impact-border"
        aria-hidden="true"
        className="fixed inset-0 z-[60] pointer-events-none"
        style={{ boxShadow: "inset 0 0 0 4px rgba(239,68,68,0.85)" }}
      />
    );
  }

  return (
    <div
      data-testid="impact-flash"
      aria-hidden="true"
      className="fixed inset-0 z-[60] pointer-events-none animate-impact-flash-fx"
      style={{
        background: "radial-gradient(ellipse at center, rgba(239,68,68,0) 40%, rgba(239,68,68,0.55) 100%)",
      }}
    />
  );
}
