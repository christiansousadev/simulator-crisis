import { create } from "zustand";

// SMALL SHARED STATE BETWEEN A SEATED ENGINEER SPRITE AND THEIR DESK PROPS: while the engineer takes
// a sip, the mug leaves the desk (EngineerDesk reads it with a boolean selector, so only that desk
// re-renders, and only twice per sip).
interface DeskLifeState {
  sipping: Record<string, true>;
}

export const useDeskLife = create<DeskLifeState>(() => ({ sipping: {} }));

export function setDeskSipping(serviceId: string, on: boolean): void {
  const current = useDeskLife.getState().sipping;
  if (Boolean(current[serviceId]) === on) return;
  const next = { ...current };
  if (on) next[serviceId] = true;
  else delete next[serviceId];
  useDeskLife.setState({ sipping: next });
}
