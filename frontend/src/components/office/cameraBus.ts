import { DEFAULT_CAMERA, type Camera, type ViewSize } from "./cameraMath";

// tiny external store for the live camera. The controller publishes every frame; the minimap
// subscribes and moves its viewport frame imperatively, so no React render happens per frame.
export interface CameraSnapshot {
  camera: Camera;
  view: ViewSize;
}

let snapshot: CameraSnapshot = { camera: DEFAULT_CAMERA, view: { width: 0, height: 0 } };
const listeners = new Set<() => void>();

export function getCameraSnapshot(): CameraSnapshot {
  return snapshot;
}

export function publishCamera(next: CameraSnapshot) {
  snapshot = next;
  listeners.forEach((l) => l());
}

export function subscribeCamera(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
