import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "./useReducedMotion";

export interface Presence<T> {
  // the last non-null value: keeps rendering real content while the exit animation plays
  data: T | null;
  // render the element at all
  mounted: boolean;
  // value just went away; play the exit animation
  closing: boolean;
}

// KEEPS A DIALOG MOUNTED LONG ENOUGH TO ANIMATE OUT. Modal content is keyed off store values that
// become null the instant a dialog closes, which is why exits were skipped before: here the last
// non-null value is cached in this hook (not in the store) and handed back while `closing`.
export function usePresence<T>(value: T | null | undefined, exitMs = 160): Presence<T> {
  const reduced = useReducedMotion();
  const last = useRef<T | null>(null);
  const [mounted, setMounted] = useState(value != null);
  const present = value != null;
  if (present) last.current = value as T;

  useEffect(() => {
    if (present) {
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (reduced || exitMs <= 0) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(timer);
    // only the open/closed edge matters here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);

  return { data: present ? (value as T) : last.current, mounted: present || mounted, closing: !present && mounted };
}

// BOOLEAN CONVENIENCE: usePresenceFlag(open) -> { mounted, closing }
export function usePresenceFlag(open: boolean, exitMs = 160): { mounted: boolean; closing: boolean } {
  const { mounted, closing } = usePresence<true>(open ? true : null, exitMs);
  return { mounted, closing };
}
