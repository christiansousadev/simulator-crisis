import { describe, expect, it } from "vitest";
import { nextIncidentService, routeShortcut, ShortcutInput } from "./shortcutRouting";
import { pauseReasons } from "./useSimulationHolds";

const base: ShortcutInput = {
  key: "",
  shiftKey: false,
  hasModifier: false,
  typing: false,
  keyboardFocusedControl: false,
  titleVisible: false,
  modalOpen: false,
  legacyOpen: [],
};
const route = (patch: Partial<ShortcutInput>) => routeShortcut({ ...base, ...patch });

describe("routeShortcut", () => {
  it("maps the global hotkeys when nothing is open", () => {
    expect(route({ key: " " })).toEqual({ type: "toggle-run" });
    expect(route({ key: "2" })).toEqual({ type: "set-speed", speed: 2 });
    expect(route({ key: "g" })).toEqual({ type: "dock-tab", tab: "metrics" });
    expect(route({ key: "B" })).toEqual({ type: "toggle-build-mode" });
    expect(route({ key: "d" })).toEqual({ type: "toggle-dock" });
    expect(route({ key: "Escape" })).toEqual({ type: "toggle-pause-menu" });
  });

  it("only Escape works while a modal is open, and it closes the top-most one", () => {
    expect(route({ key: "Escape", modalOpen: true })).toEqual({ type: "close-top-modal" });
    for (const key of [" ", "1", "5", "i", "b", "]", "Tab", "Enter"]) {
      expect(route({ key, modalOpen: true })).toEqual({ type: "none" });
    }
  });

  it("never touches Tab, so focus moves normally", () => {
    expect(route({ key: "Tab" })).toEqual({ type: "none" });
    expect(route({ key: "Tab", shiftKey: true })).toEqual({ type: "none" });
  });

  it("cycles incidents with the bracket keys", () => {
    expect(route({ key: "]" })).toEqual({ type: "cycle-incident", direction: 1 });
    expect(route({ key: "[" })).toEqual({ type: "cycle-incident", direction: -1 });
  });

  it("stays out of the way while typing or holding a modifier", () => {
    expect(route({ key: "i", typing: true })).toEqual({ type: "none" });
    expect(route({ key: "r", hasModifier: true })).toEqual({ type: "none" });
  });

  it("leaves Space to a control the user reached with the keyboard", () => {
    expect(route({ key: " ", keyboardFocusedControl: true })).toEqual({ type: "none" });
  });

  it("the title screen owns the keyboard: no Enter/Space hijack and no game hotkeys", () => {
    for (const key of ["Enter", " ", "i", "1", "Escape"]) {
      expect(route({ key, titleVisible: true })).toEqual({ type: "none" });
    }
  });

  it("closes legacy dialogs top-most first (triage over incident detail)", () => {
    expect(route({ key: "Escape", legacyOpen: ["incident", "triage"] })).toEqual({ type: "close-legacy", modal: "triage" });
    expect(route({ key: "Escape", legacyOpen: ["onboarding", "incident"] })).toEqual({ type: "close-legacy", modal: "incident" });
    expect(route({ key: "i", legacyOpen: ["incident"] })).toEqual({ type: "none" });
  });

  it("the modal stack wins over legacy dialogs", () => {
    expect(route({ key: "Escape", modalOpen: true, legacyOpen: ["triage"] })).toEqual({ type: "close-top-modal" });
  });
});

describe("nextIncidentService", () => {
  it("wraps in both directions and starts at the ends when nothing is selected", () => {
    const ids = ["a", "b", "c"];
    expect(nextIncidentService(ids, null, 1)).toBe("a");
    expect(nextIncidentService(ids, null, -1)).toBe("c");
    expect(nextIncidentService(ids, "c", 1)).toBe("a");
    expect(nextIncidentService(ids, "a", -1)).toBe("c");
    expect(nextIncidentService(ids, "zzz", 1)).toBe("a");
    expect(nextIncidentService([], "a", 1)).toBeNull();
  });
});

describe("pauseReasons", () => {
  it("lists every screen that holds the simulation", () => {
    expect(pauseReasons({ titleScreenVisible: false, pauseMenuOpen: false, scenarioBriefingOpen: false })).toEqual([]);
    expect(pauseReasons({ titleScreenVisible: true, pauseMenuOpen: true, scenarioBriefingOpen: true })).toEqual(["title", "pause-menu", "briefing"]);
  });
});
