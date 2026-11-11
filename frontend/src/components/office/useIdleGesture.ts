import { useEffect, useRef, useState } from "react";
import type { IdleGesture } from "./workerRig";

// how long each sporadic gesture holds its data-gesture attribute (matches the officeLife.css keyframes)
export const GESTURE_MS: Record<IdleGesture, number> = {
  look: 1000,
  watch: 1100,
  stretch: 900,
  sip: 1200,
  brew: 1400,
  cheer: 1200,
};

// quiet time between two gestures of the same sprite
export const GESTURE_GAP_MIN_MS = 6000;
export const GESTURE_GAP_MAX_MS = 14000;

export function nextGestureDelay(r: number): number {
  return Math.round(GESTURE_GAP_MIN_MS + Math.min(1, Math.max(0, r)) * (GESTURE_GAP_MAX_MS - GESTURE_GAP_MIN_MS));
}

export function pickGesture(pool: readonly IdleGesture[], r: number): IdleGesture | null {
  if (pool.length === 0) return null;
  return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, r) * pool.length))];
}

// SPORADIC IDLE LIFE FOR ONE SPRITE: every 6-14 s, while `enabled`, it plays one gesture from `pool`
// for that gesture's length. One timer per sprite, no per-frame work: the movement itself is css.
// Disabled (walking, panicking, reduced motion) it stays null and schedules nothing.
export function useIdleGesture(
  enabled: boolean,
  pool: readonly IdleGesture[],
  onChange?: (gesture: IdleGesture | null) => void
): IdleGesture | null {
  const [gesture, setGesture] = useState<IdleGesture | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const poolKey = pool.join(",");

  useEffect(() => {
    if (!enabled || poolKey === "") {
      setGesture(null);
      return;
    }
    const options = poolKey.split(",") as IdleGesture[];
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        const next = pickGesture(options, Math.random());
        if (!next) return;
        setGesture(next);
        timer = setTimeout(() => {
          setGesture(null);
          schedule();
        }, GESTURE_MS[next]);
      }, nextGestureDelay(Math.random()));
    };
    schedule();
    return () => {
      clearTimeout(timer);
      setGesture(null);
    };
  }, [enabled, poolKey]);

  useEffect(() => {
    onChangeRef.current?.(gesture);
  }, [gesture]);

  return gesture;
}
