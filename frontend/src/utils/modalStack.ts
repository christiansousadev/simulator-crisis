import { useSyncExternalStore } from "react";

// A TINY EXTERNAL STACK OF OPEN MODALS. The top-most entry owns Escape, and the global game
// shortcuts stay quiet while anything is on the stack, so a letter typed inside a dialog can no
// longer switch dock tabs or change the game speed behind it.
interface Entry {
  id: string;
  // null = a decision that must be answered; Escape does nothing while it is on top
  onClose: (() => void) | null;
}

let stack: Entry[] = [];
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

export function registerModal(id: string, onClose: (() => void) | null): () => void {
  stack = [...stack.filter((e) => e.id !== id), { id, onClose }];
  emit();
  return () => {
    stack = stack.filter((e) => e.id !== id);
    emit();
  };
}

export function hasOpenModal(): boolean {
  return stack.length > 0;
}

export function topModalId(): string | null {
  return stack.length ? stack[stack.length - 1].id : null;
}

// CLOSE THE TOP-MOST MODAL; RETURNS TRUE WHEN THE KEY WAS CONSUMED (EVEN BY A NON-DISMISSIBLE ONE)
export function closeTopModal(): boolean {
  if (stack.length === 0) return false;
  stack[stack.length - 1].onClose?.();
  return true;
}

export function useModalStackSize(): number {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
    () => 0
  );
  return stack.length;
}
