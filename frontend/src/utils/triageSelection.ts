import { LogLevel } from "../types/game";

// PURE STATE LOGIC FOR THE LOG-TRIAGE TERMINAL: which lines are visible, where the keyboard
// cursor is, and what a wrong/right pick does. The component only wires DOM events to this.

export const TRIAGE_LEVELS: LogLevel[] = ["INFO", "WARN", "ERROR", "FATAL"];

// mirrors formulas.triage_accuracy on the backend (reward quality eroded by each wrong pick)
export const TRIAGE_ACCURACY_DECAY = 0.22;
export const TRIAGE_MIN_ACCURACY = 0.15;

export function triageAccuracy(wrongAttempts: number): number {
  return Math.max(TRIAGE_MIN_ACCURACY, 1 - TRIAGE_ACCURACY_DECAY * Math.max(0, wrongAttempts));
}

export interface TriageLineLike {
  id: string;
  level: LogLevel;
}

export interface TriageState {
  filters: LogLevel[];
  focusId: string | null;
  // lines already submitted and wrong
  wrongIds: string[];
  attempts: number;
  solvedId: string | null;
}

export function initialTriageState(initialWrongAttempts = 0): TriageState {
  return { filters: [...TRIAGE_LEVELS], focusId: null, wrongIds: [], attempts: initialWrongAttempts, solvedId: null };
}

export type TriageAction =
  | { type: "reset"; wrongAttempts?: number }
  | { type: "toggleFilter"; level: LogLevel; visibleIds: (filters: LogLevel[]) => string[] }
  | { type: "focus"; id: string | null }
  | { type: "move"; key: "ArrowUp" | "ArrowDown" | "Home" | "End"; visibleIds: string[] }
  | { type: "wrong"; id: string }
  | { type: "solved"; id: string };

export function visibleLines<T extends TriageLineLike>(lines: T[], filters: LogLevel[], revealedCount: number): T[] {
  return lines.filter((l) => filters.includes(l.level)).slice(0, Math.max(0, revealedCount));
}

// next focus target for an arrow/home/end key; clamps at both ends (a terminal does not wrap)
export function moveFocus(ids: string[], currentId: string | null, key: "ArrowUp" | "ArrowDown" | "Home" | "End"): string | null {
  if (ids.length === 0) return null;
  if (key === "Home") return ids[0];
  if (key === "End") return ids[ids.length - 1];
  const idx = currentId === null ? -1 : ids.indexOf(currentId);
  if (idx === -1) return key === "ArrowDown" ? ids[0] : ids[ids.length - 1];
  const next = key === "ArrowDown" ? Math.min(ids.length - 1, idx + 1) : Math.max(0, idx - 1);
  return ids[next];
}

export function triageReducer(state: TriageState, action: TriageAction): TriageState {
  switch (action.type) {
    case "reset":
      return initialTriageState(action.wrongAttempts ?? 0);
    case "toggleFilter": {
      const filters = state.filters.includes(action.level)
        ? state.filters.filter((l) => l !== action.level)
        : TRIAGE_LEVELS.filter((l) => l === action.level || state.filters.includes(l));
      // keep the cursor on a line that is still visible
      const visible = action.visibleIds(filters);
      const focusId = state.focusId !== null && visible.includes(state.focusId) ? state.focusId : (visible[0] ?? null);
      return { ...state, filters, focusId };
    }
    case "focus":
      return state.focusId === action.id ? state : { ...state, focusId: action.id };
    case "move": {
      const focusId = moveFocus(action.visibleIds, state.focusId, action.key);
      return focusId === state.focusId ? state : { ...state, focusId };
    }
    case "wrong":
      if (state.solvedId) return state;
      // the engine penalizes every wrong submission, repeats included
      return {
        ...state,
        wrongIds: state.wrongIds.includes(action.id) ? state.wrongIds : [...state.wrongIds, action.id],
        attempts: state.attempts + 1,
      };
    case "solved":
      return state.solvedId ? state : { ...state, solvedId: action.id, focusId: action.id };
  }
}
