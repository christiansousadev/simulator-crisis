import { TILE_HEIGHT, TILE_WIDTH, type Point } from "./isoMath";

// PURE CAMERA MATH. Everything is expressed in the svg's user space (the isometric projection
// space), where the camera is `translate(x, y) scale(s)` around a fixed origin. No DOM in here so
// the spring, the zoom-to-cursor pivot and the viewport quad can be unit tested.

export interface Camera {
  scale: number;
  x: number;
  y: number;
}

export const CAMERA_MIN_SCALE = 0.75;
export const CAMERA_MAX_SCALE = 2.0;
export const DEFAULT_CAMERA: Camera = { scale: 1, x: 0, y: 0 };

// the scene svg's viewBox and its fixed zoom origin (roughly the middle of the floor plan)
export const VIEWBOX = { x: -406, y: -156, w: 1006, h: 640 };
export const VIEW_CENTER: Point = { x: VIEWBOX.x + VIEWBOX.w / 2, y: VIEWBOX.y + VIEWBOX.h / 2 };

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clampScale(s: number): number {
  return clamp(s, CAMERA_MIN_SCALE, CAMERA_MAX_SCALE);
}

export interface ViewSize {
  width: number;
  height: number;
}

// user units -> screen px for a `meet` fit of the viewBox into the container
export function viewScale(view: ViewSize): number {
  if (view.width <= 0 || view.height <= 0) return 1;
  return Math.min(view.width / VIEWBOX.w, view.height / VIEWBOX.h);
}

// container-relative pixel -> svg user space (before the camera transform)
export function pxToUser(px: number, py: number, view: ViewSize): Point {
  const k = viewScale(view);
  return { x: VIEW_CENTER.x + (px - view.width / 2) / k, y: VIEW_CENTER.y + (py - view.height / 2) / k };
}

// the world point (user space, camera-free) currently drawn at a screen point
export function screenToWorld(cam: Camera, screen: Point, origin: Point): Point {
  return { x: origin.x + (screen.x - origin.x - cam.x) / cam.scale, y: origin.y + (screen.y - origin.y - cam.y) / cam.scale };
}

export function worldToScreen(cam: Camera, world: Point, origin: Point): Point {
  return { x: origin.x + cam.scale * (world.x - origin.x) + cam.x, y: origin.y + cam.scale * (world.y - origin.y) + cam.y };
}

// ZOOM TOWARD THE CURSOR: pick the new translation so the world point under `anchor` (a screen
// point in user space) stays exactly under it
export function zoomAt(cam: Camera, nextScale: number, anchor: Point, origin: Point): Camera {
  const scale = clampScale(nextScale);
  const world = screenToWorld(cam, anchor, origin);
  return {
    scale,
    x: anchor.x - origin.x - scale * (world.x - origin.x),
    y: anchor.y - origin.y - scale * (world.y - origin.y),
  };
}

// camera that puts a world point at the middle of the view
export function cameraCenteredOn(world: Point, scale: number, origin: Point): Camera {
  const s = clampScale(scale);
  return { scale: s, x: VIEW_CENTER.x - origin.x - s * (world.x - origin.x), y: VIEW_CENTER.y - origin.y - s * (world.y - origin.y) };
}

// the world point at the middle of the view for a camera
export function cameraFocus(cam: Camera, origin: Point): Point {
  return screenToWorld(cam, VIEW_CENTER, origin);
}

// soft/hard limits: the view centre may wander over (roughly) the floor plan and a little beyond
export interface FocusBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const CAMERA_FOCUS_BOUNDS: FocusBounds = { minX: -330, maxX: 540, minY: -40, maxY: 440 };

// PULL A CAMERA BACK INSIDE THE BOUNDS. `give` (0..1) lets a fraction of the overshoot through,
// which is the rubber band feel while dragging; 0 is a hard clamp
export function clampCamera(cam: Camera, origin: Point, bounds: FocusBounds = CAMERA_FOCUS_BOUNDS, give = 0): Camera {
  const focus = cameraFocus(cam, origin);
  const cx = clamp(focus.x, bounds.minX, bounds.maxX);
  const cy = clamp(focus.y, bounds.minY, bounds.maxY);
  const fx = cx + (focus.x - cx) * give;
  const fy = cy + (focus.y - cy) * give;
  return cameraCenteredOn({ x: fx, y: fy }, cam.scale, origin);
}

export interface SpringAxis {
  pos: number;
  vel: number;
}

// CRITICALLY DAMPED SPRING, CLOSED FORM: never overshoots and stays stable at any frame time
export function springStep(axis: SpringAxis, target: number, dtSec: number, omega: number): SpringAxis {
  const d = axis.pos - target;
  const c2 = axis.vel + omega * d;
  const decay = Math.exp(-omega * dtSec);
  return { pos: target + (d + c2 * dtSec) * decay, vel: (axis.vel - omega * c2 * dtSec) * decay };
}

export function stepCameraSpring(
  state: { cam: Camera; vel: Camera },
  target: Camera,
  dtSec: number,
  omega: number
): { cam: Camera; vel: Camera } {
  const sx = springStep({ pos: state.cam.x, vel: state.vel.x }, target.x, dtSec, omega);
  const sy = springStep({ pos: state.cam.y, vel: state.vel.y }, target.y, dtSec, omega);
  const ss = springStep({ pos: state.cam.scale, vel: state.vel.scale }, target.scale, dtSec, omega);
  return {
    cam: { x: sx.pos, y: sy.pos, scale: ss.pos },
    vel: { x: sx.vel, y: sy.vel, scale: ss.vel },
  };
}

export function isCameraSettled(cam: Camera, vel: Camera, target: Camera): boolean {
  return (
    Math.abs(cam.x - target.x) < 0.05 &&
    Math.abs(cam.y - target.y) < 0.05 &&
    Math.abs(cam.scale - target.scale) < 0.0005 &&
    Math.abs(vel.x) < 0.5 &&
    Math.abs(vel.y) < 0.5 &&
    Math.abs(vel.scale) < 0.005
  );
}

// WHEEL DELTA -> MULTIPLICATIVE ZOOM FACTOR (line/page delta modes are normalised to pixels)
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  return Math.exp(-clamp(px, -600, 600) * 0.0015);
}

// the visible region as a quad in svg user space *before* the camera (what the minimap frames)
export function visibleWorldQuad(cam: Camera, view: ViewSize, origin: Point): Point[] {
  const k = viewScale(view);
  const halfW = view.width / 2 / k;
  const halfH = view.height / 2 / k;
  const corners: Point[] = [
    { x: VIEW_CENTER.x - halfW, y: VIEW_CENTER.y - halfH },
    { x: VIEW_CENTER.x + halfW, y: VIEW_CENTER.y - halfH },
    { x: VIEW_CENTER.x + halfW, y: VIEW_CENTER.y + halfH },
    { x: VIEW_CENTER.x - halfW, y: VIEW_CENTER.y + halfH },
  ];
  return corners.map((c) => screenToWorld(cam, c, origin));
}

// user space (z = 0 floor) -> grid coordinates, the inverse of isoMath.project
export function userToGrid(p: Point): Point {
  const sum = p.y / (TILE_HEIGHT / 2);
  const diff = p.x / (TILE_WIDTH / 2);
  return { x: (sum + diff) / 2, y: (sum - diff) / 2 };
}
