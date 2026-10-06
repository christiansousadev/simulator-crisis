import { describe, expect, it } from "vitest";
import { nextMenuIndex } from "./menuNav";

describe("nextMenuIndex", () => {
  it("wraps around with the arrow keys and jumps with Home/End", () => {
    expect(nextMenuIndex("ArrowDown", 4, 5)).toBe(0);
    expect(nextMenuIndex("ArrowUp", 0, 5)).toBe(4);
    expect(nextMenuIndex("ArrowDown", -1, 5)).toBe(0);
    expect(nextMenuIndex("Home", 3, 5)).toBe(0);
    expect(nextMenuIndex("End", 0, 5)).toBe(4);
    expect(nextMenuIndex("a", 0, 5)).toBe(-1);
    expect(nextMenuIndex("ArrowDown", 0, 0)).toBe(-1);
  });
});
