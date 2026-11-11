import { RefObject, useEffect, useRef } from "react";
import { ScreenShakeMagnitude, useGameStore } from "../store/useGameStore";
import { useReducedMotion } from "./useReducedMotion";

export const SHAKE_CLASS: Record<ScreenShakeMagnitude, string> = {
  light: "screen-shake-light",
  heavy: "screen-shake-heavy",
  quake: "screen-shake-quake",
};
// matches the animation lengths in index.css
export const SHAKE_MS: Record<ScreenShakeMagnitude, number> = { light: 250, heavy: 450, quake: 700 };
// a cascade raising several alarms in a row must not turn into one continuous earthquake
export const SHAKE_COOLDOWN_MS = 1500;

const RANK: Record<ScreenShakeMagnitude, number> = { light: 1, heavy: 2, quake: 3 };

export interface LastShake {
  at: number;
  magnitude: ScreenShakeMagnitude;
}

// SHOULD A NEW SHAKE PLAY? Always after the cooldown; inside it only when it hits harder than the last one
export function shouldShake(last: LastShake | null, magnitude: ScreenShakeMagnitude, now: number): boolean {
  if (!last) return true;
  if (now - last.at >= SHAKE_COOLDOWN_MS) return true;
  return RANK[magnitude] > RANK[last.magnitude];
}

// SCENE SHAKE ON THE ELEMENT `ref` POINTS AT (the office svg), driven by the store's screenShakeSeq.
// Only the scene trembles: the top bar, dock and KPI readouts stay put and legible. Under reduced
// motion nothing moves; ImpactFlash shows a static border flash instead.
export function useSceneShake(ref: RefObject<Element>): void {
  const seq = useGameStore((s) => s.screenShakeSeq);
  const magnitude = useGameStore((s) => s.screenShakeMagnitude);
  const reduced = useReducedMotion();
  const last = useRef<LastShake | null>(null);

  useEffect(() => {
    if (seq === 0 || reduced) return;
    const el = ref.current;
    if (!el) return;
    const now = Date.now();
    if (!shouldShake(last.current, magnitude, now)) return;
    last.current = { at: now, magnitude };
    const cls = SHAKE_CLASS[magnitude];
    el.classList.remove(...Object.values(SHAKE_CLASS));
    // flush styles so re-adding the same class restarts the animation
    void el.getBoundingClientRect();
    el.classList.add(cls);
    const timer = setTimeout(() => el.classList.remove(cls), SHAKE_MS[magnitude] + 50);
    return () => clearTimeout(timer);
    // magnitude travels with seq (both set in one store update); seq is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);
}
