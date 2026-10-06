import { describe, expect, it } from "vitest";
import { LogLevel } from "../types/game";
import { initialTriageState, moveFocus, triageAccuracy, triageReducer, TriageState, visibleLines } from "./triageSelection";

const lines: Array<{ id: string; level: LogLevel }> = [
  { id: "a", level: "INFO" },
  { id: "b", level: "WARN" },
  { id: "c", level: "ERROR" },
  { id: "d", level: "FATAL" },
];
const idsFor = (filters: LogLevel[]) => visibleLines(lines, filters, 99).map((l) => l.id);

describe("visibleLines", () => {
  it("filters by level and honours the reveal count", () => {
    expect(visibleLines(lines, ["ERROR", "FATAL"], 99).map((l) => l.id)).toEqual(["c", "d"]);
    expect(visibleLines(lines, ["INFO", "WARN", "ERROR", "FATAL"], 2).map((l) => l.id)).toEqual(["a", "b"]);
    expect(visibleLines(lines, [], 99)).toEqual([]);
  });
});

describe("moveFocus", () => {
  const ids = ["a", "b", "c"];
  it("moves down and up, clamping at the ends", () => {
    expect(moveFocus(ids, "a", "ArrowDown")).toBe("b");
    expect(moveFocus(ids, "c", "ArrowDown")).toBe("c");
    expect(moveFocus(ids, "b", "ArrowUp")).toBe("a");
    expect(moveFocus(ids, "a", "ArrowUp")).toBe("a");
  });

  it("starts from the first (down) or last (up) line when nothing is focused", () => {
    expect(moveFocus(ids, null, "ArrowDown")).toBe("a");
    expect(moveFocus(ids, null, "ArrowUp")).toBe("c");
    expect(moveFocus(ids, "gone", "ArrowDown")).toBe("a");
  });

  it("supports Home and End and an empty list", () => {
    expect(moveFocus(ids, "b", "Home")).toBe("a");
    expect(moveFocus(ids, "b", "End")).toBe("c");
    expect(moveFocus([], "a", "ArrowDown")).toBeNull();
  });
});

describe("triageReducer", () => {
  const start = (): TriageState => initialTriageState();

  it("starts with every level on", () => {
    expect(start().filters).toEqual(["INFO", "WARN", "ERROR", "FATAL"]);
  });

  it("keeps the cursor on a visible line when its level is filtered out", () => {
    let s = triageReducer(start(), { type: "focus", id: "b" });
    s = triageReducer(s, { type: "toggleFilter", level: "WARN", visibleIds: idsFor });
    expect(s.filters).not.toContain("WARN");
    expect(s.focusId).toBe("a");
  });

  it("re-enabling a level restores canonical order", () => {
    let s = triageReducer(start(), { type: "toggleFilter", level: "INFO", visibleIds: idsFor });
    s = triageReducer(s, { type: "toggleFilter", level: "INFO", visibleIds: idsFor });
    expect(s.filters).toEqual(["INFO", "WARN", "ERROR", "FATAL"]);
  });

  it("counts every wrong pick, repeats included, but lists the line once", () => {
    let s = triageReducer(start(), { type: "wrong", id: "b" });
    s = triageReducer(s, { type: "wrong", id: "b" });
    s = triageReducer(s, { type: "wrong", id: "c" });
    expect(s.attempts).toBe(3);
    expect(s.wrongIds).toEqual(["b", "c"]);
  });

  it("ignores picks after the root cause is solved", () => {
    let s = triageReducer(start(), { type: "solved", id: "c" });
    s = triageReducer(s, { type: "wrong", id: "a" });
    s = triageReducer(s, { type: "solved", id: "d" });
    expect(s.solvedId).toBe("c");
    expect(s.attempts).toBe(0);
  });

  it("keyboard moves update the cursor", () => {
    let s = triageReducer(start(), { type: "move", key: "ArrowDown", visibleIds: ["a", "b"] });
    expect(s.focusId).toBe("a");
    s = triageReducer(s, { type: "move", key: "ArrowDown", visibleIds: ["a", "b"] });
    expect(s.focusId).toBe("b");
  });

  it("seeds attempts from the server's count on reset", () => {
    expect(triageReducer(start(), { type: "reset", wrongAttempts: 2 }).attempts).toBe(2);
  });
});

describe("triageAccuracy", () => {
  it("mirrors the backend formula", () => {
    expect(triageAccuracy(0)).toBe(1);
    expect(triageAccuracy(1)).toBeCloseTo(0.78);
    expect(triageAccuracy(2)).toBeCloseTo(0.56);
    expect(triageAccuracy(10)).toBe(0.15);
  });
});
