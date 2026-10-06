import { useEffect, useState } from "react";

function matches(query: string): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
}

// LIVE MATCH STATE OF A CSS MEDIA QUERY, SO A COMPONENT CAN MOUNT ONE LAYOUT OR THE OTHER
// instead of rendering both and hiding one with css
export function useMediaQuery(query: string): boolean {
  const [state, setState] = useState(() => matches(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setState(mql.matches);
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [query]);

  return state;
}
