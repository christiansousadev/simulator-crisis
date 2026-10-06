import { api } from "../services/api";
import { useGameStore } from "../store/useGameStore";

// RUN STATE CAPTURED BEFORE THE FIRST HOLD, RESTORED WHEN THE LAST HOLD IS RELEASED
export interface RunSnapshot {
  running: boolean;
  // ticks per second (1 / tick_rate_seconds); only re-applied when it changed while held
  speed: number;
}

export interface PauseDeps {
  // authoritative engine state; may throw when the backend is unreachable
  readRunState: () => Promise<RunSnapshot>;
  // what the store currently believes the speed to be
  readLiveSpeed: () => number;
  pause: () => Promise<unknown>;
  start: () => Promise<unknown>;
  setSpeed: (speed: number) => Promise<unknown>;
}

export interface PauseController {
  hold: (reason: string) => Promise<void>;
  release: (reason: string) => Promise<void>;
  // declarative form: the exact set of reasons that should be holding right now. Adds happen
  // before removals so swapping one holder for another (pause menu -> title) never un-pauses
  sync: (reasons: string[]) => Promise<void>;
  // the engine was just reset/restarted: a new game should come back running, not as the old one
  rebase: (snapshot?: Partial<RunSnapshot>) => void;
  // pause again if something is still holding (a reset restarts the tick loop by itself)
  enforce: () => Promise<void>;
  holders: () => string[];
  settled: () => Promise<void>;
}

// REFERENCE-COUNTED PAUSE. The title screen, the pause menu and the scenario briefing each hold the
// simulation; the first hold remembers whether it was running, the last release puts it back --
// so a game the player had paused by hand stays paused instead of silently resuming.
export function createPauseController(deps: PauseDeps): PauseController {
  const holders = new Set<string>();
  let snapshot: RunSnapshot | null = null;
  // hold/release calls are serialised: a quick open/close must never interleave its REST calls
  let chain: Promise<void> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>): Promise<void> => {
    chain = chain.then(fn, fn);
    return chain;
  };

  const capture = async () => {
    try {
      snapshot = await deps.readRunState();
    } catch {
      snapshot = { running: false, speed: deps.readLiveSpeed() };
    }
    if (snapshot.running) await deps.pause().catch(() => {});
  };

  const restore = async () => {
    const snap = snapshot;
    snapshot = null;
    if (!snap || !snap.running) return;
    await deps.start().catch(() => {});
    if (snap.speed > 0 && Math.abs(snap.speed - deps.readLiveSpeed()) > 0.01) {
      await deps.setSpeed(snap.speed).catch(() => {});
    }
  };

  const addHolder = (reason: string): Promise<void> | null => {
    if (holders.has(reason)) return null;
    const first = holders.size === 0;
    holders.add(reason);
    return first ? enqueue(capture) : null;
  };

  const removeHolder = (reason: string): Promise<void> | null => {
    if (!holders.delete(reason)) return null;
    return holders.size === 0 ? enqueue(restore) : null;
  };

  return {
    hold: async (reason) => {
      await addHolder(reason);
    },
    release: async (reason) => {
      await removeHolder(reason);
    },
    sync: async (reasons) => {
      const wanted = new Set(reasons);
      const pending: Array<Promise<void> | null> = [];
      for (const r of wanted) pending.push(addHolder(r));
      for (const r of [...holders]) if (!wanted.has(r)) pending.push(removeHolder(r));
      await Promise.all(pending);
    },
    rebase: (next) => {
      if (holders.size === 0) return;
      snapshot = { running: true, speed: deps.readLiveSpeed(), ...next };
    },
    enforce: async () => {
      if (holders.size === 0) return;
      await enqueue(async () => {
        if (holders.size > 0) await deps.pause().catch(() => {});
      });
    },
    holders: () => [...holders],
    settled: () => chain,
  };
}

function liveSpeed(): number {
  const rate = useGameStore.getState().telemetry.tick_rate_seconds;
  return rate > 0 ? 1 / rate : 1;
}

// the shared controller wired to the real REST api and the store
export const simPause = createPauseController({
  readRunState: async () => {
    const state = await api.getState();
    return { running: Boolean(state.is_running), speed: state.tick_rate_seconds > 0 ? 1 / state.tick_rate_seconds : 1 };
  },
  readLiveSpeed: liveSpeed,
  pause: () => api.pauseSimulation(),
  start: () => api.startSimulation(),
  setSpeed: (speed) => api.setSpeed(speed),
});
