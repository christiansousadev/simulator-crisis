import type { TutorialPlacement } from "./tutorialSteps";

// PURE GEOMETRY FOR THE SPOTLIGHT AND THE COACH CARD

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  w: number;
  h: number;
}

export type ResolvedPlacement = "top" | "bottom" | "left" | "right" | "center";

export interface CardPlacement {
  x: number;
  y: number;
  placement: ResolvedPlacement;
}

const FLIP: Record<Exclude<ResolvedPlacement, "center">, Exclude<ResolvedPlacement, "center">> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

export function unionBox(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function padBox(box: Box, pad: number): Box {
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

export function clampBoxToViewport(box: Box, viewport: Size): Box {
  const x = Math.max(0, Math.min(viewport.w, box.x));
  const y = Math.max(0, Math.min(viewport.h, box.y));
  const right = Math.max(0, Math.min(viewport.w, box.x + box.w));
  const bottom = Math.max(0, Math.min(viewport.h, box.y + box.h));
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

// exponential easing toward the target, frame-rate independent; snaps once close enough
export function easeBox(current: Box, target: Box, dtMs: number, tauMs: number): Box {
  const k = 1 - Math.exp(-Math.max(0, dtMs) / tauMs);
  const step = (a: number, b: number) => (Math.abs(b - a) < 0.4 ? b : a + (b - a) * k);
  return { x: step(current.x, target.x), y: step(current.y, target.y), w: step(current.w, target.w), h: step(current.h, target.h) };
}

export function boxesEqual(a: Box, b: Box): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function fits(side: Exclude<ResolvedPlacement, "center">, target: Box, card: Size, viewport: Size, gap: number, margin: number): boolean {
  switch (side) {
    case "top":
      return target.y - gap - card.h >= margin;
    case "bottom":
      return target.y + target.h + gap + card.h <= viewport.h - margin;
    case "left":
      return target.x - gap - card.w >= margin;
    case "right":
      return target.x + target.w + gap + card.w <= viewport.w - margin;
  }
}

function freeSpace(side: Exclude<ResolvedPlacement, "center">, target: Box, viewport: Size): number {
  switch (side) {
    case "top":
      return target.y;
    case "bottom":
      return viewport.h - (target.y + target.h);
    case "left":
      return target.x;
    case "right":
      return viewport.w - (target.x + target.w);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// WHERE THE CARD GOES: beside the target on the preferred side, flipped (then rotated through the
// remaining sides, then to the roomiest one) so it never leaves the viewport. No target = centered.
// On narrow viewports the card docks to the edge farthest from the target instead.
export function placeCard(opts: {
  target: Box | null;
  card: Size;
  viewport: Size;
  preferred: TutorialPlacement;
  gap?: number;
  margin?: number;
}): CardPlacement {
  const { target, card, viewport, preferred, gap = 18, margin = 12 } = opts;
  const centerX = (viewport.w - card.w) / 2;
  const centerY = (viewport.h - card.h) / 2;

  if (!target || preferred === "center") return { x: centerX, y: centerY, placement: "center" };

  const maxX = Math.max(margin, viewport.w - card.w - margin);
  const maxY = Math.max(margin, viewport.h - card.h - margin);

  // phone width: dock to the top or bottom edge, whichever is farther from the target
  if (viewport.w < 640) {
    const targetMid = target.y + target.h / 2;
    const dockTop = targetMid > viewport.h / 2;
    return { x: clamp(centerX, margin, maxX), y: dockTop ? margin : maxY, placement: dockTop ? "top" : "bottom" };
  }

  const order: Exclude<ResolvedPlacement, "center">[] =
    preferred === "auto" ? ["bottom", "top", "right", "left"] : [preferred, FLIP[preferred], ...(["right", "left", "bottom", "top"] as const).filter((s) => s !== preferred && s !== FLIP[preferred])];

  let side = order.find((s) => fits(s, target, card, viewport, gap, margin));
  if (!side) {
    side = order.reduce((best, s) => (freeSpace(s, target, viewport) > freeSpace(best, target, viewport) ? s : best));
  }

  const midX = target.x + target.w / 2 - card.w / 2;
  const midY = target.y + target.h / 2 - card.h / 2;
  switch (side) {
    case "top":
      return { x: clamp(midX, margin, maxX), y: clamp(target.y - gap - card.h, margin, maxY), placement: "top" };
    case "bottom":
      return { x: clamp(midX, margin, maxX), y: clamp(target.y + target.h + gap, margin, maxY), placement: "bottom" };
    case "left":
      return { x: clamp(target.x - gap - card.w, margin, maxX), y: clamp(midY, margin, maxY), placement: "left" };
    case "right":
      return { x: clamp(target.x + target.w + gap, margin, maxX), y: clamp(midY, margin, maxY), placement: "right" };
  }
}
