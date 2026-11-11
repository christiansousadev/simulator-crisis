// PURE HELPERS FOR THE OfficeWorker RIG: gait timing, per-sprite variation and one-shot cue replay.
// Kept free of React so the timing contract (one --step clock per sprite) is unit-testable.

import type { Heading } from "./waypointGraph";

export type Gait = "still" | "walk" | "run";
export type PanicVariant = "head" | "flail" | "shiver";
export type IdleGesture = "look" | "watch" | "stretch" | "sip" | "brew" | "cheer";

// above this pace the gait switches from walking to running (walk is 1.5 tiles/s, run 3.2)
export const RUN_THRESHOLD_TILES_PER_S = 2.4;
const WALK_STRIDE_TILES = 0.5;
const RUN_STRIDE_TILES = 0.64;
const MIN_STEP_S = 0.16;
const MAX_STEP_S = 0.6;

export interface GaitTiming {
  gait: Exclude<Gait, "still">;
  // length of one full 4-frame gait cycle, in seconds (the --step css variable)
  stepS: number;
}

// GAIT FOR A MOVE OF `distanceTiles` OVER `durationMs`. The cycle length follows the speed so one
// cycle always covers one stride: the planted foot never slides, at a walk or a sprint.
export function gaitFor(distanceTiles: number, durationMs: number): GaitTiming {
  const speed = durationMs > 0 ? distanceTiles / (durationMs / 1000) : 0;
  if (speed <= 0) return { gait: "walk", stepS: 0.33 };
  const running = speed > RUN_THRESHOLD_TILES_PER_S;
  const stride = running ? RUN_STRIDE_TILES : WALK_STRIDE_TILES;
  const stepS = Math.min(MAX_STEP_S, Math.max(MIN_STEP_S, stride / speed));
  return { gait: running ? "run" : "walk", stepS: Math.round(stepS * 1000) / 1000 };
}

// STABLE SMALL HASH OF A STRING (FNV-1a), FOR PER-SPRITE VARIATION THAT SURVIVES RE-RENDERS
export function seedOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PANIC_VARIANTS: PanicVariant[] = ["head", "flail", "shiver"];

export function panicVariantFor(seed: number): PanicVariant {
  return PANIC_VARIANTS[seed % PANIC_VARIANTS.length];
}

// breathing phase offset so a room full of sprites never breathes in unison (negative = already running)
export function breathPhase(seed: number): string {
  return `-${((seed % 3000) / 1000).toFixed(2)}s`;
}

// breathing cycle length by mood: tired sprites breathe slowly, recovering ones a little slower too
export function breathCycle(mood: string): string {
  if (mood === "tired") return "4.5s";
  if (mood === "recovering") return "3.6s";
  return "3s";
}

// DELAY OF THE STARTLE REACTION: THE ALERT SWEEPS THE FLOOR FROM BACK TO FRONT IN A 0-300MS WAVE
export function startleWaveMs(x: number, y: number): number {
  const depth = x + y;
  return Math.max(0, Math.min(300, Math.round(((depth % 12) / 12) * 300)));
}

// HEADING OF A FREE (NON-ROSTER) SPRITE FROM ITS LAST MOVE, IN GRID UNITS
export function headingFromDelta(dx: number, dy: number, previous: Heading): Heading {
  const depth = dx + dy;
  const screenX = dx - dy;
  const ns = Math.abs(depth) < 1e-6 ? previous[0] : depth < 0 ? "n" : "s";
  const ew = Math.abs(screenX) < 1e-6 ? previous[1] : screenX < 0 ? "w" : "e";
  return `${ns}${ew}` as Heading;
}

// RESTART A ONE-SHOT CSS ANIMATION CLASS ON AN ELEMENT (remove, force a style flush, re-add), so a
// second trigger replays it instead of being swallowed by an unchanged class list. Any other cue
// class still running is dropped: one cue at a time per element.
export function replayClass(el: Element | null, cls: string, family: readonly string[] = []): void {
  if (!el) return;
  for (const other of family) el.classList.remove(other);
  el.classList.remove(cls);
  // reading layout flushes styles so re-adding the class starts a fresh animation
  void (el as HTMLElement).getBoundingClientRect?.();
  el.classList.add(cls);
}

export const CUE_CLASSES = ["ol-cue-start", "ol-cue-settle", "ol-cue-sit", "ol-cue-stand", "ol-cue-startle", "ol-press"] as const;
