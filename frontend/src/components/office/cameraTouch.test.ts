import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CAMERA_MAX_SCALE, CAMERA_MIN_SCALE, pinchScale, pointerMidpoint, pointerSpread } from "./cameraMath";
import { CameraController } from "./cameraController";

describe("pinch math", () => {
  it("scales with the ratio of the finger spread and stays inside the camera limits", () => {
    expect(pinchScale(1, 100, 150)).toBeCloseTo(1.5);
    expect(pinchScale(1, 100, 50)).toBeCloseTo(0.75);
    expect(pinchScale(1, 100, 10_000)).toBe(CAMERA_MAX_SCALE);
    expect(pinchScale(1, 100, 1)).toBe(CAMERA_MIN_SCALE);
  });

  it("ignores a degenerate start spread instead of dividing by zero", () => {
    expect(pinchScale(1.2, 0, 80)).toBe(1.2);
    expect(pinchScale(1.2, Number.NaN, 80)).toBe(1.2);
    expect(pinchScale(1.2, 100, Number.NaN)).toBe(1.2);
  });

  it("measures spread and midpoint", () => {
    expect(pointerSpread({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(pointerMidpoint({ x: 0, y: 10 }, { x: 4, y: 20 })).toEqual({ x: 2, y: 15 });
  });
});

function touchEvent(type: string, target: EventTarget, pointerId: number, x: number, y: number) {
  const evt = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(evt, { pointerType: "touch", pointerId, clientX: x, clientY: y });
  target.dispatchEvent(evt);
}

describe("CameraController touch gestures", () => {
  let container: HTMLDivElement;
  let host: HTMLDivElement;
  let rig: SVGGElement;
  let controller: CameraController;

  beforeEach(() => {
    container = document.createElement("div");
    host = document.createElement("div");
    container.appendChild(host);
    document.body.appendChild(container);
    rig = document.createElementNS("http://www.w3.org/2000/svg", "g");
    container.getBoundingClientRect = () => ({ width: 1006, height: 640, left: 0, top: 0, right: 1006, bottom: 640, x: 0, y: 0, toJSON: () => ({}) });
    controller = new CameraController({ container, sceneHost: host, rig, isReducedMotion: () => true });
    controller.attach();
  });

  afterEach(() => {
    controller.dispose();
    container.remove();
  });

  it("pans with one finger", () => {
    const before = controller.getCamera();
    touchEvent("pointerdown", host, 1, 500, 300);
    touchEvent("pointermove", window, 1, 560, 340);
    touchEvent("pointerup", window, 1, 560, 340);
    const after = controller.getCamera();
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
    expect(after.scale).toBe(before.scale);
  });

  it("zooms in when two fingers spread apart and out when they pinch together", () => {
    const start = controller.getCamera().scale;
    touchEvent("pointerdown", host, 1, 450, 320);
    touchEvent("pointerdown", host, 2, 550, 320);
    touchEvent("pointermove", window, 2, 650, 320);
    const zoomedIn = controller.getCamera().scale;
    expect(zoomedIn).toBeGreaterThan(start);
    touchEvent("pointermove", window, 2, 480, 320);
    expect(controller.getCamera().scale).toBeLessThan(zoomedIn);
    touchEvent("pointerup", window, 2, 480, 320);
    touchEvent("pointerup", window, 1, 450, 320);
  });

  it("ignores mouse and pen pointers (those keep the mouse handlers)", () => {
    const before = controller.getCamera();
    const evt = new Event("pointerdown", { bubbles: true });
    Object.assign(evt, { pointerType: "mouse", pointerId: 9, clientX: 10, clientY: 10 });
    host.dispatchEvent(evt);
    touchEvent("pointermove", window, 9, 200, 200);
    expect(controller.getCamera()).toEqual(before);
  });

  it("keeps panning with the remaining finger after one lifts from a pinch", () => {
    touchEvent("pointerdown", host, 1, 450, 320);
    touchEvent("pointerdown", host, 2, 550, 320);
    touchEvent("pointerup", window, 2, 550, 320);
    const before = controller.getCamera();
    touchEvent("pointermove", window, 1, 520, 360);
    expect(controller.getCamera().x).toBeGreaterThan(before.x);
    touchEvent("pointerup", window, 1, 520, 360);
  });
});
