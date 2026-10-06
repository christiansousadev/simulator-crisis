import { ButtonHTMLAttributes, CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useGameStore } from "../../store/useGameStore";
import { playReadySound } from "../../utils/sound";

interface CooldownButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  progress: number;
  children: ReactNode;
  // play the "ready" flash + sound when the cooldown finishes (off for passive/secondary uses)
  announceReady?: boolean;
}

const READY_FLASH_MS = 650;

// wraps a button with a radial cooldown sweep mask; progress 1 = just fired, 0 = ready. The sweep
// eases between ticks (css registers --progress), and the card flashes once when it becomes ready.
export default function CooldownButton({ progress, children, className = "", announceReady = false, ...rest }: CooldownButtonProps) {
  const tickSeconds = useGameStore((s) => s.telemetry.tick_rate_seconds);
  const reduced = useReducedMotion();
  const wasCooling = useRef(progress > 0);
  const [flashSeq, setFlashSeq] = useState(0);

  // ease over one tick of game time so the ring keeps gliding at 2x/5x instead of lagging behind
  const overlayStyle = {
    "--progress": progress,
    transitionDuration: `${Math.max(0.1, tickSeconds || 1)}s`,
  } as CSSProperties;

  useEffect(() => {
    const cooling = progress > 0;
    if (wasCooling.current && !cooling && announceReady) {
      setFlashSeq((n) => n + 1);
      playReadySound();
    }
    wasCooling.current = cooling;
  }, [progress, announceReady]);

  // the flash is one-shot: unmount the flag after it played so it can restart next time
  useEffect(() => {
    if (flashSeq === 0) return;
    const timer = setTimeout(() => setFlashSeq(0), READY_FLASH_MS);
    return () => clearTimeout(timer);
  }, [flashSeq]);

  return (
    <button {...rest} className={`relative ${className} ${flashSeq > 0 && !reduced ? "animate-ready-flash" : ""}`}>
      {children}
      {progress > 0 && <div className="cooldown-ring pointer-events-none absolute inset-0 rounded-[inherit]" style={overlayStyle} />}
    </button>
  );
}
