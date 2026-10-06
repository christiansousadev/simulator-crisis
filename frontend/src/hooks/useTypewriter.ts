import { useEffect, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

// STREAMS A STRING IN CHARACTER BY CHARACTER. The interval is cleared on unmount and whenever the
// inputs change, so a closed terminal never keeps writing state; reduced motion shows the whole
// string immediately. `enabled` lets a caller hold the effect until something else is ready.
export function useTypewriter(target: string, enabled = true, charMs = 16): { text: string; done: boolean } {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    if (reduced) {
      setCount(target.length);
      return;
    }
    setCount(0);
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setCount(n);
      if (n >= target.length) clearInterval(id);
    }, charMs);
    return () => clearInterval(id);
  }, [target, enabled, reduced, charMs]);

  const shown = enabled ? Math.min(count, target.length) : 0;
  return { text: target.slice(0, shown), done: enabled && shown >= target.length };
}
