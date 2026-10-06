// PURE ROUTING FOR THE GLOBAL KEYBOARD SHORTCUTS. The hook feeds it a snapshot of what is open and
// what has focus; it answers with the single action to run (or none). Keeping this free of the DOM
// and the store is what makes the modal / title / typing rules unit-testable.

export type DockTabId = "incidents" | "directives" | "compliance" | "upgrades" | "roster" | "achievements" | "metrics";

// dialogs that are not on the modal stack yet (owned by other areas); closed through the store
export type LegacyModal = "triage" | "replay" | "postMortem" | "incident" | "onboarding";

export type ShortcutAction =
  | { type: "none" }
  | { type: "close-top-modal" }
  | { type: "close-legacy"; modal: LegacyModal }
  | { type: "toggle-pause-menu" }
  | { type: "toggle-run" }
  | { type: "set-speed"; speed: 1 | 2 | 5 }
  | { type: "cycle-incident"; direction: 1 | -1 }
  | { type: "toggle-build-mode" }
  | { type: "dock-tab"; tab: DockTabId }
  | { type: "toggle-dock" };

export interface ShortcutInput {
  key: string;
  shiftKey: boolean;
  // ctrl / alt / meta held: browser and OS shortcuts are never hijacked
  hasModifier: boolean;
  // focus is in an input / textarea / contenteditable
  typing: boolean;
  // focus is on a control the user reached with the keyboard (Space / Enter belong to it)
  keyboardFocusedControl: boolean;
  titleVisible: boolean;
  // anything registered on the modal stack
  modalOpen: boolean;
  // legacy dialogs currently open, ordered from top-most to bottom-most
  legacyOpen: LegacyModal[];
}

const DOCK_KEYS: Record<string, DockTabId> = {
  i: "incidents",
  m: "directives",
  c: "compliance",
  u: "upgrades",
  r: "roster",
  a: "achievements",
  g: "metrics",
};

// order a stack of legacy dialogs is dismissed in (the one drawn on top goes first)
export const LEGACY_CLOSE_ORDER: LegacyModal[] = ["triage", "replay", "postMortem", "incident", "onboarding"];

export function routeShortcut(input: ShortcutInput): ShortcutAction {
  const none: ShortcutAction = { type: "none" };
  if (input.typing || input.hasModifier) return none;

  const key = input.key;
  const lower = key.toLowerCase();

  // while a dialog is up only Escape does anything: it closes the top-most one
  if (input.modalOpen) return key === "Escape" ? { type: "close-top-modal" } : none;

  const legacy = LEGACY_CLOSE_ORDER.find((m) => input.legacyOpen.includes(m));
  if (legacy) return key === "Escape" ? { type: "close-legacy", modal: legacy } : none;

  // the title screen owns the keyboard (arrow keys, Enter and Space on its buttons)
  if (input.titleVisible) return none;

  if (key === "Escape") return { type: "toggle-pause-menu" };

  // Space / Enter on a control the user tabbed to activates that control, not the game
  if (key === " ") return input.keyboardFocusedControl ? none : { type: "toggle-run" };

  if (key === "1" || key === "2" || key === "5") return { type: "set-speed", speed: Number(key) as 1 | 2 | 5 };

  // incident cycling lives on the bracket keys so Tab keeps moving focus like everywhere else
  if (key === "]" || key === "}") return { type: "cycle-incident", direction: 1 };
  if (key === "[" || key === "{") return { type: "cycle-incident", direction: -1 };

  if (lower === "b") return { type: "toggle-build-mode" };
  if (lower === "d") return { type: "toggle-dock" };
  const tab = DOCK_KEYS[lower];
  if (tab) return { type: "dock-tab", tab };
  return none;
}

// NEXT SERVICE TO SELECT WHEN CYCLING THROUGH INCIDENTS (null when there is nothing to select)
export function nextIncidentService(
  incidentServiceIds: string[],
  currentServiceId: string | null,
  direction: 1 | -1
): string | null {
  const count = incidentServiceIds.length;
  if (count === 0) return null;
  const index = incidentServiceIds.indexOf(currentServiceId ?? "");
  if (index === -1) return incidentServiceIds[direction === 1 ? 0 : count - 1];
  return incidentServiceIds[(index + direction + count) % count];
}
