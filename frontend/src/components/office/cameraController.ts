import { hasOpenModal } from "../../utils/modalStack";
import { publishCamera } from "./cameraBus";
import {
  CAMERA_FOCUS_BOUNDS,
  DEFAULT_CAMERA,
  VIEW_CENTER,
  cameraCenteredOn,
  clamp,
  clampCamera,
  isCameraSettled,
  pxToUser,
  stepCameraSpring,
  viewScale,
  wheelZoomFactor,
  zoomAt,
  type Camera,
  type ViewSize,
} from "./cameraMath";
import { CAMERA_ORIGIN } from "./sceneLayout";
import type { Point } from "./isoMath";

const DRAG_THRESHOLD_PX = 4;
const KEY_PAN_SPEED = 560;
const KEY_ZOOM_STEP = 1.2;
const OMEGA_ZOOM = 15;
const OMEGA_FLY = 9;
const OMEGA_INERTIA = 8;
// how far a release keeps travelling, in seconds of the release velocity
const INERTIA_SECONDS = 0.28;
const SKYLINE_PARALLAX = 0.05;
const SKYLINE_MAX_SHIFT_PX = 26;

export interface CameraControllerOptions {
  // the whole office canvas: receives the wheel and keyboard-adjacent events
  container: HTMLElement;
  // the element that wraps the svg: drags only start here, never on the hud
  sceneHost: HTMLElement;
  // the <g> whose inline transform is the camera
  rig: SVGGElement;
  isReducedMotion: () => boolean;
  onDragStart?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return true;
  // widgets that use the arrow keys themselves
  return Boolean(target.closest('[role="slider"],[role="listbox"],[role="menu"],[role="radiogroup"],[role="dialog"]'));
}

// SPRING-DAMPED CAMERA FOR THE OFFICE. All state lives here (not in React): input handlers move a
// TARGET, a rAF loop chases it with a critically damped spring and writes the result straight to
// the rig's inline transform. React never re-renders for a wheel tick or a mousemove.
export class CameraController {
  private cam: Camera = { ...DEFAULT_CAMERA };
  private vel: Camera = { scale: 0, x: 0, y: 0 };
  private target: Camera = { ...DEFAULT_CAMERA };
  private omega = OMEGA_FLY;
  private view: ViewSize = { width: 0, height: 0 };
  private raf = 0;
  private lastT = 0;
  private keys = new Set<string>();
  private skyline: HTMLElement | null = null;
  private dragMoved = false;
  private drag: { startX: number; startY: number; origin: Camera; moved: boolean; samples: Array<{ t: number; x: number; y: number }> } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly opts: CameraControllerOptions) {}

  attach() {
    const { container } = this.opts;
    this.measure();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => {
        this.measure();
        this.publish();
      });
      this.resizeObserver.observe(container);
    }
    container.addEventListener("wheel", this.onWheel, { passive: false });
    container.addEventListener("mousedown", this.onMouseDown);
    container.addEventListener("click", this.onClickCapture, true);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.apply();
    this.publish();
  }

  dispose() {
    const { container } = this.opts;
    container.removeEventListener("wheel", this.onWheel);
    container.removeEventListener("mousedown", this.onMouseDown);
    container.removeEventListener("click", this.onClickCapture, true);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.resizeObserver?.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setSkyline(el: HTMLElement | null) {
    this.skyline = el;
    this.apply();
  }

  getCamera(): Camera {
    return { ...this.cam };
  }

  getTarget(): Camera {
    return { ...this.target };
  }

  // ---- commands ------------------------------------------------------------------------------

  flyTo(camera: Camera, opts: { snap?: boolean; omega?: number } = {}) {
    this.target = clampCamera(camera, CAMERA_ORIGIN);
    this.omega = opts.omega ?? OMEGA_FLY;
    if (opts.snap || this.opts.isReducedMotion()) {
      this.cam = { ...this.target };
      this.vel = { scale: 0, x: 0, y: 0 };
      this.apply();
      this.publish();
      return;
    }
    this.start();
  }

  // centre the view on a user-space world point
  flyToWorld(world: Point, scale: number, opts: { snap?: boolean } = {}) {
    this.flyTo(cameraCenteredOn(world, scale, CAMERA_ORIGIN), opts);
  }

  // pan to a world point keeping the zoom the player already has
  panToWorld(world: Point, opts: { snap?: boolean } = {}) {
    this.flyToWorld(world, this.target.scale, opts);
  }

  reset() {
    this.flyTo({ ...DEFAULT_CAMERA });
  }

  zoomBy(factor: number, anchor: Point = VIEW_CENTER) {
    this.target = clampCamera(zoomAt(this.target, this.target.scale * factor, anchor, CAMERA_ORIGIN), CAMERA_ORIGIN);
    this.omega = OMEGA_ZOOM;
    if (this.opts.isReducedMotion()) {
      this.cam = { ...this.target };
      this.apply();
      this.publish();
      return;
    }
    this.start();
  }

  // a drag that just finished must not also register as a click on whatever is under the cursor
  consumeDragMoved(): boolean {
    const moved = this.dragMoved;
    this.dragMoved = false;
    return moved;
  }

  // ---- input ---------------------------------------------------------------------------------

  private onWheel = (evt: WheelEvent) => {
    const target = evt.target as Element | null;
    if (target?.closest?.("[data-camera-ignore]")) return;
    evt.preventDefault();
    const rect = this.opts.container.getBoundingClientRect();
    const anchor = pxToUser(evt.clientX - rect.left, evt.clientY - rect.top, this.view);
    this.zoomBy(wheelZoomFactor(evt.deltaY, evt.deltaMode), anchor);
  };

  private onMouseDown = (evt: MouseEvent) => {
    if (evt.button !== 0 && evt.button !== 2) return;
    if (!this.opts.sceneHost.contains(evt.target as Node)) return;
    this.drag = { startX: evt.clientX, startY: evt.clientY, origin: { ...this.target }, moved: false, samples: [] };
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
  };

  private onMouseMove = (evt: MouseEvent) => {
    const drag = this.drag;
    if (!drag) return;
    const dx = evt.clientX - drag.startX;
    const dy = evt.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.abs(dx) <= DRAG_THRESHOLD_PX && Math.abs(dy) <= DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      // the pointer now owns the camera: drop any glide in flight
      this.vel = { scale: 0, x: 0, y: 0 };
      this.opts.onDragStart?.();
    }
    const k = viewScale(this.view);
    // a rubber band: past the soft limit only a third of the drag gets through
    const next = clampCamera({ ...drag.origin, x: drag.origin.x + dx / k, y: drag.origin.y + dy / k }, CAMERA_ORIGIN, CAMERA_FOCUS_BOUNDS, 0.33);
    this.target = next;
    this.cam = { ...next };
    const now = performance.now();
    drag.samples.push({ t: now, x: next.x, y: next.y });
    while (drag.samples.length > 2 && now - drag.samples[0].t > 100) drag.samples.shift();
    this.apply();
    this.publish();
  };

  private onMouseUp = () => {
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    const drag = this.drag;
    this.drag = null;
    if (!drag?.moved) return;
    this.dragMoved = true;
    // the click that follows the release fires synchronously; clear the flag if none does
    setTimeout(() => {
      this.dragMoved = false;
    }, 0);

    let carry = { x: 0, y: 0 };
    const reduced = this.opts.isReducedMotion();
    const first = drag.samples[0];
    const last = drag.samples[drag.samples.length - 1];
    if (!reduced && first && last && performance.now() - last.t < 80 && last.t > first.t) {
      const dt = (last.t - first.t) / 1000;
      carry = { x: ((last.x - first.x) / dt) * INERTIA_SECONDS, y: ((last.y - first.y) / dt) * INERTIA_SECONDS };
    }
    this.flyTo({ ...this.cam, x: this.cam.x + carry.x, y: this.cam.y + carry.y }, { omega: OMEGA_INERTIA });
  };

  private onClickCapture = (evt: MouseEvent) => {
    if (this.dragMoved) {
      evt.stopPropagation();
      evt.preventDefault();
      this.dragMoved = false;
    }
  };

  private onKeyDown = (evt: KeyboardEvent) => {
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
    if (hasOpenModal() || isTypingTarget(evt.target)) return;
    switch (evt.key) {
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
        evt.preventDefault();
        this.keys.add(evt.key);
        this.omega = OMEGA_ZOOM;
        this.start();
        break;
      case "+":
      case "=":
        evt.preventDefault();
        this.zoomBy(KEY_ZOOM_STEP);
        break;
      case "-":
      case "_":
        evt.preventDefault();
        this.zoomBy(1 / KEY_ZOOM_STEP);
        break;
      case "Home":
        evt.preventDefault();
        this.reset();
        break;
      default:
        break;
    }
  };

  private onKeyUp = (evt: KeyboardEvent) => {
    this.keys.delete(evt.key);
  };

  private onBlur = () => {
    this.keys.clear();
  };

  // ---- frame loop ----------------------------------------------------------------------------

  private measure() {
    const rect = this.opts.container.getBoundingClientRect();
    this.view = { width: rect.width, height: rect.height };
  }

  private start() {
    if (this.raf) return;
    this.lastT = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.min(0.05, this.lastT ? (now - this.lastT) / 1000 : 1 / 60);
    this.lastT = now;

    if (this.keys.size > 0) {
      const speed = (KEY_PAN_SPEED * dt) / Math.max(0.5, this.target.scale);
      let dx = 0;
      let dy = 0;
      if (this.keys.has("ArrowLeft")) dx += 1;
      if (this.keys.has("ArrowRight")) dx -= 1;
      if (this.keys.has("ArrowUp")) dy += 1;
      if (this.keys.has("ArrowDown")) dy -= 1;
      this.target = clampCamera({ ...this.target, x: this.target.x + dx * speed, y: this.target.y + dy * speed }, CAMERA_ORIGIN);
    }

    if (this.opts.isReducedMotion()) {
      this.cam = { ...this.target };
      this.vel = { scale: 0, x: 0, y: 0 };
    } else {
      const next = stepCameraSpring({ cam: this.cam, vel: this.vel }, this.target, dt, this.omega);
      this.cam = { ...next.cam, scale: clamp(next.cam.scale, 0.5, 2.5) };
      this.vel = next.vel;
    }

    const settled = isCameraSettled(this.cam, this.vel, this.target);
    if (settled) {
      this.cam = { ...this.target };
      this.vel = { scale: 0, x: 0, y: 0 };
    }
    this.apply();
    this.publish();
    if (!settled || this.keys.size > 0) this.raf = requestAnimationFrame(this.frame);
  };

  private apply() {
    const { cam } = this;
    this.opts.rig.style.transform = `translate(${cam.x.toFixed(2)}px, ${cam.y.toFixed(2)}px) scale(${cam.scale.toFixed(4)})`;
    if (this.skyline) {
      const k = viewScale(this.view);
      const px = clamp(cam.x * k * SKYLINE_PARALLAX, -SKYLINE_MAX_SHIFT_PX, SKYLINE_MAX_SHIFT_PX);
      const py = clamp(cam.y * k * SKYLINE_PARALLAX, -SKYLINE_MAX_SHIFT_PX, SKYLINE_MAX_SHIFT_PX);
      this.skyline.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    }
  }

  private publish() {
    publishCamera({ camera: { ...this.cam }, view: this.view });
  }
}
