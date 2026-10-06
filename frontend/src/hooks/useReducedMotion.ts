import { useEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";

const QUERY = "(prefers-reduced-motion: reduce)";

function systemPrefersReduced(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;
}

// WHETHER MOTION SHOULD BE MINIMIZED RIGHT NOW: THE IN-GAME SETTING WINS, "SYSTEM" FOLLOWS THE OS.
// JS-driven motion (number tweens, camera glides, typewriters) reads this; CSS-driven motion is
// handled by the [data-reduce-motion] rules in index.css, which App.tsx keeps in sync.
export function useReducedMotion(): boolean {
  const pref = useGameStore((s) => s.reducedMotionPref);
  const [system, setSystem] = useState(systemPrefersReduced);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setSystem(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  if (pref === "on") return true;
  if (pref === "off") return false;
  return system;
}

// NON-HOOK READ FOR EVENT HANDLERS AND IMPERATIVE CODE
export function isReducedMotionNow(): boolean {
  const pref = useGameStore.getState().reducedMotionPref;
  if (pref === "on") return true;
  if (pref === "off") return false;
  return systemPrefersReduced();
}
