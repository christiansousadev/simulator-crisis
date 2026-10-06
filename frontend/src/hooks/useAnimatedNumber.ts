import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { useReducedMotion } from "./useReducedMotion";

// smoothly tweens a displayed numeric readout toward `target` instead of snapping on every
// backend tick. When `durationMs` is omitted the tween lasts about one tick of game time (so at 1x
// the number is always gliding toward the next value rather than stair-stepping, and at 5x it
// still finishes before the following frame). Reduced motion shows the value immediately.
export function useAnimatedNumber(target: number, durationMs?: number): number {
  const reduced = useReducedMotion();
  const tickSeconds = useGameStore((s) => s.telemetry.tick_rate_seconds);
  const duration = durationMs ?? Math.max(120, Math.min(1000, (tickSeconds || 1) * 1000 * 0.95));
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const from = displayRef.current;
    const delta = target - from;
    if (delta === 0) return;

    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic, decelerates into the final value
      const value = from + delta * eased;
      displayRef.current = value;
      setDisplay(value);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration, reduced]);

  return display;
}
