import { useSyncExternalStore } from "react";

// HOVER STATE FOR THE OFFICE TOOLTIP, KEPT OUT OF REACT STATE ON PURPOSE. Racks and desks report
// the pointer on every mousemove; routing that through setState re-rendered the whole scene. Here
// only a change of hovered service notifies React subscribers, while the pointer position goes to
// a separate listener list that moves the tooltip with a transform and no render at all.
let hoveredId: string | null = null;
let pos = { x: 0, y: 0 };
const idListeners = new Set<() => void>();
const posListeners = new Set<() => void>();

export function setOfficeHover(serviceId: string, clientX: number, clientY: number) {
  pos = { x: clientX, y: clientY };
  if (hoveredId !== serviceId) {
    hoveredId = serviceId;
    idListeners.forEach((l) => l());
  }
  posListeners.forEach((l) => l());
}

export function clearOfficeHover() {
  if (hoveredId === null) return;
  hoveredId = null;
  idListeners.forEach((l) => l());
}

export function getOfficeHoverPos() {
  return pos;
}

export function subscribeOfficeHoverPos(listener: () => void): () => void {
  posListeners.add(listener);
  return () => posListeners.delete(listener);
}

function subscribeId(listener: () => void) {
  idListeners.add(listener);
  return () => idListeners.delete(listener);
}

export function useOfficeHoverId(): string | null {
  return useSyncExternalStore(subscribeId, () => hoveredId, () => null);
}

// stable handlers handed to the racks and desks (module-level, so their identity never changes)
export function handleOfficeHover(serviceId: string, evt: { clientX: number; clientY: number }) {
  setOfficeHover(serviceId, evt.clientX, evt.clientY);
}
export function handleOfficeLeave() {
  clearOfficeHover();
}
