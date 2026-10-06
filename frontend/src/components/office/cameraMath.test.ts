import { describe, expect, it } from "vitest";
import {
  CAMERA_MAX_SCALE,
  CAMERA_MIN_SCALE,
  VIEW_CENTER,
  cameraCenteredOn,
  cameraFocus,
  clampCamera,
  isCameraSettled,
  pxToUser,
  screenToWorld,
  springStep,
  stepCameraSpring,
  userToGrid,
  visibleWorldQuad,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  type Camera,
} from "./cameraMath";
import { project } from "./isoMath";
import { CAMERA_ORIGIN } from "./sceneLayout";

const O = CAMERA_ORIGIN;
const cam: Camera = { scale: 1.2, x: 30, y: -20 };

describe("zoomAt", () => {
  it("keeps the world point under the cursor fixed", () => {
    const anchor = { x: 200, y: 150 };
    const before = screenToWorld(cam, anchor, O);
    const next = zoomAt(cam, 1.8, anchor, O);
    const after = worldToScreen(next, before, O);
    expect(after.x).toBeCloseTo(anchor.x, 6);
    expect(after.y).toBeCloseTo(anchor.y, 6);
    expect(next.scale).toBe(1.8);
  });

  it("clamps the scale to the allowed range", () => {
    expect(zoomAt(cam, 10, VIEW_CENTER, O).scale).toBe(CAMERA_MAX_SCALE);
    expect(zoomAt(cam, 0.01, VIEW_CENTER, O).scale).toBe(CAMERA_MIN_SCALE);
  });
});

describe("centering and bounds", () => {
  it("centres a world point in the view", () => {
    const world = project(3, 2, 0.5);
    const c = cameraCenteredOn(world, 1.7, O);
    const focus = cameraFocus(c, O);
    expect(focus.x).toBeCloseTo(world.x, 6);
    expect(focus.y).toBeCloseTo(world.y, 6);
  });

  it("hard-clamps a camera that wandered off, and lets a fraction through when soft", () => {
    const far = cameraCenteredOn({ x: 5000, y: 5000 }, 1, O);
    const hard = cameraFocus(clampCamera(far, O), O);
    expect(hard.x).toBeLessThan(1000);
    const soft = cameraFocus(clampCamera(far, O, undefined, 0.3), O);
    expect(soft.x).toBeGreaterThan(hard.x);
    expect(soft.x).toBeLessThan(5000);
  });

  it("leaves an in-bounds camera alone", () => {
    const c = clampCamera({ scale: 1, x: 0, y: 0 }, O);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(0, 6);
  });
});

describe("spring", () => {
  it("converges to the target without overshooting", () => {
    let axis = { pos: 0, vel: 0 };
    let max = 0;
    for (let i = 0; i < 240; i++) {
      axis = springStep(axis, 100, 1 / 60, 10);
      max = Math.max(max, axis.pos);
    }
    expect(max).toBeLessThanOrEqual(100.0001);
    expect(axis.pos).toBeCloseTo(100, 3);
  });

  it("is stable for a huge frame time", () => {
    const axis = springStep({ pos: 0, vel: 0 }, 100, 5, 10);
    expect(axis.pos).toBeCloseTo(100, 3);
  });

  it("starts moving on the very first frame and settles", () => {
    let state = { cam: { scale: 1, x: 0, y: 0 }, vel: { scale: 0, x: 0, y: 0 } };
    const target: Camera = { scale: 1.5, x: 40, y: -30 };
    state = stepCameraSpring(state, target, 1 / 60, 15);
    expect(state.cam.scale).not.toBe(1);
    for (let i = 0; i < 600; i++) state = stepCameraSpring(state, target, 1 / 60, 15);
    expect(isCameraSettled(state.cam, state.vel, target)).toBe(true);
  });
});

describe("pointer and viewport helpers", () => {
  it("maps the container centre to the view centre", () => {
    const p = pxToUser(400, 300, { width: 800, height: 600 });
    expect(p.x).toBeCloseTo(VIEW_CENTER.x, 6);
    expect(p.y).toBeCloseTo(VIEW_CENTER.y, 6);
  });

  it("turns wheel deltas into symmetric zoom factors", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(-100) * wheelZoomFactor(100)).toBeCloseTo(1, 6);
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-48, 0), 6);
  });

  it("round-trips user space and grid space", () => {
    const p = project(7.5, 3.25, 0);
    const g = userToGrid(p);
    expect(g.x).toBeCloseTo(7.5, 6);
    expect(g.y).toBeCloseTo(3.25, 6);
  });

  it("shrinks the visible quad as the camera zooms in", () => {
    const view = { width: 1000, height: 640 };
    const area = (q: Array<{ x: number; y: number }>) => Math.abs((q[1].x - q[0].x) * (q[3].y - q[0].y));
    const wide = area(visibleWorldQuad({ scale: 1, x: 0, y: 0 }, view, O));
    const close = area(visibleWorldQuad({ scale: 2, x: 0, y: 0 }, view, O));
    expect(close).toBeCloseTo(wide / 4, 3);
  });
});
