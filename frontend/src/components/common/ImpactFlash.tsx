import { useEffect, useState } from "react";
import { useGameStore } from "../../store/useGameStore";

// FULL-SCREEN RED VIGNETTE FLASH FIRED ON A FRESH P1 ALARM OR A BANKRUPTCY TRANSITION
export default function ImpactFlash() {
  const impactFlashSeq = useGameStore((s) => s.impactFlashSeq);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (impactFlashSeq === 0) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 500);
    return () => clearTimeout(timer);
  }, [impactFlashSeq]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[60] pointer-events-none animate-impact-flash-fx"
      style={{
        background: "radial-gradient(ellipse at center, rgba(239,68,68,0) 40%, rgba(239,68,68,0.55) 100%)",
      }}
    />
  );
}
