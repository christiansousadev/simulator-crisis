import { useEffect, useRef, useState } from "react";

// smoothly tweens a displayed numeric readout toward `target` over `durationMs` instead of
// snapping instantly on every backend tick -- used for high-visibility hud numbers (budget)
// where an instant jump reads as a glitch rather than a value change
export function useAnimatedNumber(target: number, durationMs = 450): number {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = display;
    const delta = target - from;
    if (delta === 0) return;

    const start = performance.now();
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic, decelerates into the final value
      setDisplay(from + delta * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
    // intentionally re-runs only when the target changes, tweening from whatever is currently displayed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return display;
}
