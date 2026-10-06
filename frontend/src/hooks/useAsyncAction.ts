import { useSyncExternalStore } from "react";
import { useGameStore } from "../store/useGameStore";

// SHARED "IN FLIGHT" REGISTRY. A button that fires a request is pending from the click until the
// server's answer is actually visible in telemetry (the confirming tick), not merely until the
// http call returns -- so there is no window where the button is clickable again while the card
// still shows the old status. Keys are global, so the dock, the alert stack and the modals all see
// the same pending state for the same incident.

type GameState = ReturnType<typeof useGameStore.getState>;

interface Entry {
  timer: ReturnType<typeof setTimeout> | null;
  unsubscribe: (() => void) | null;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();

// safety net so a lost confirmation (paused sim, dropped frame) can never wedge a button forever
const DEFAULT_TIMEOUT_MS = 5000;

function emit() {
  snapshot = new Set(entries.keys());
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isActionPending(key: string): boolean {
  return entries.has(key);
}

export function clearPending(key: string) {
  const entry = entries.get(key);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.unsubscribe?.();
  entries.delete(key);
  emit();
}

function beginPending(key: string): boolean {
  if (entries.has(key)) return false;
  entries.set(key, { timer: null, unsubscribe: null });
  emit();
  return true;
}

// keeps `key` pending until `confirmed(state)` turns true (checked now and on every store update)
function awaitConfirmation(key: string, confirmed: (state: GameState) => boolean, timeoutMs: number) {
  const entry = entries.get(key);
  if (!entry) return;
  if (confirmed(useGameStore.getState())) {
    clearPending(key);
    return;
  }
  entry.unsubscribe = useGameStore.subscribe((state) => {
    if (confirmed(state)) clearPending(key);
  });
  entry.timer = setTimeout(() => clearPending(key), timeoutMs);
}

export interface RunOptions<T> {
  // pending persists until this is true on the store (omit to clear as soon as the request ends)
  confirmed?: (state: GameState) => boolean;
  timeoutMs?: number;
  onStart?: () => void;
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
}

// RUN `task` AT MOST ONCE PER KEY AT A TIME. Resolves to the task's result, or undefined when it
// was ignored (already pending) or failed (onError ran).
export async function runExclusive<T>(key: string, task: () => Promise<T>, options: RunOptions<T> = {}): Promise<T | undefined> {
  if (!beginPending(key)) return undefined;
  options.onStart?.();
  try {
    const result = await task();
    options.onSuccess?.(result);
    if (options.confirmed) awaitConfirmation(key, options.confirmed, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    else clearPending(key);
    return result;
  } catch (error) {
    clearPending(key);
    options.onError?.(error);
    return undefined;
  }
}

// THE SET OF KEYS CURRENTLY PENDING (RE-RENDERS WHEN IT CHANGES)
export function usePendingActions(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

export function usePendingAction(key: string): boolean {
  return usePendingActions().has(key);
}

export function useAsyncAction() {
  const pending = usePendingActions();
  return { run: runExclusive, isPending: (key: string) => pending.has(key) };
}
