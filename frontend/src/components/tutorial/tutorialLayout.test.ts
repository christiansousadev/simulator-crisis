import { describe, expect, it } from "vitest";
import { clampBoxToViewport, easeBox, padBox, placeCard, unionBox } from "./tutorialLayout";

const viewport = { w: 1280, h: 800 };
const card = { w: 360, h: 200 };

describe("placeCard", () => {
  it("centers the card when there is no target", () => {
    const p = placeCard({ target: null, card, viewport, preferred: "top" });
    expect(p.placement).toBe("center");
    expect(p.x).toBe((1280 - 360) / 2);
    expect(p.y).toBe((800 - 200) / 2);
  });

  it("puts the card on the preferred side when it fits", () => {
    const target = { x: 500, y: 400, w: 100, h: 60 };
    const p = placeCard({ target, card, viewport, preferred: "top" });
    expect(p.placement).toBe("top");
    expect(p.y + card.h).toBeLessThanOrEqual(target.y);
  });

  it("flips to the opposite side when the preferred one has no room", () => {
    const target = { x: 500, y: 40, w: 100, h: 60 };
    const p = placeCard({ target, card, viewport, preferred: "top" });
    expect(p.placement).toBe("bottom");
    expect(p.y).toBeGreaterThanOrEqual(target.y + target.h);
  });

  it("never leaves the viewport", () => {
    const target = { x: 1240, y: 760, w: 40, h: 40 };
    for (const preferred of ["top", "bottom", "left", "right", "auto"] as const) {
      const p = placeCard({ target, card, viewport, preferred });
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + card.w).toBeLessThanOrEqual(viewport.w);
      expect(p.y + card.h).toBeLessThanOrEqual(viewport.h);
    }
  });

  it("docks to the far edge on a phone-width viewport", () => {
    const phone = { w: 390, h: 800 };
    const low = placeCard({ target: { x: 20, y: 700, w: 100, h: 50 }, card: { w: 340, h: 220 }, viewport: phone, preferred: "top" });
    expect(low.placement).toBe("top");
    const high = placeCard({ target: { x: 20, y: 40, w: 100, h: 50 }, card: { w: 340, h: 220 }, viewport: phone, preferred: "top" });
    expect(high.placement).toBe("bottom");
  });
});

describe("box helpers", () => {
  it("unions, pads and clamps", () => {
    expect(unionBox({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 })).toEqual({ x: 0, y: 0, w: 30, h: 15 });
    expect(padBox({ x: 10, y: 10, w: 20, h: 20 }, 4)).toEqual({ x: 6, y: 6, w: 28, h: 28 });
    expect(clampBoxToViewport({ x: -20, y: 790, w: 100, h: 50 }, viewport)).toEqual({ x: 0, y: 790, w: 80, h: 10 });
  });

  it("eases toward the target and snaps once close", () => {
    const from = { x: 0, y: 0, w: 100, h: 100 };
    const to = { x: 200, y: 0, w: 100, h: 100 };
    const mid = easeBox(from, to, 130, 130);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(200);
    expect(easeBox({ ...to, x: 199.8 }, to, 16, 130).x).toBe(200);
  });
});
