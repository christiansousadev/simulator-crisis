import { useCallback, useRef } from "react";
import { initialLightState, lightVars } from "./lighting";

// registry of the few elements that read the lighting custom properties. The driver writes the
// variables onto exactly these (not the whole office container), so a lighting change only
// invalidates their own small subtrees instead of restyling the entire scene every frame.
type ScopeEl = HTMLElement | SVGElement;

const scopes = new Set<ScopeEl>();
let current: Record<string, string> = lightVars(initialLightState());

function write(el: ScopeEl, vars: Record<string, string>) {
  for (const key in vars) el.style.setProperty(key, vars[key]);
}

export function publishLightVars(vars: Record<string, string>) {
  const changed: Record<string, string> = {};
  let any = false;
  for (const key in vars) {
    if (current[key] !== vars[key]) {
      changed[key] = vars[key];
      any = true;
    }
  }
  if (!any) return;
  current = vars;
  scopes.forEach((el) => write(el, changed));
}

export function getLightVars(): Record<string, string> {
  return current;
}

// REF CALLBACK: MARKS AN ELEMENT AS A LIGHTING SCOPE AND GIVES IT THE CURRENT VALUES RIGHT AWAY
export function useLightScope() {
  const last = useRef<ScopeEl | null>(null);
  return useCallback((el: ScopeEl | null) => {
    if (last.current) scopes.delete(last.current);
    last.current = el;
    if (el) {
      scopes.add(el);
      write(el, current);
    }
  }, []);
}
