import { describe, expect, it, vi } from "vitest";
import { createPauseController, PauseDeps, RunSnapshot } from "./simPause";

function makeDeps(initial: RunSnapshot, opts: { failRead?: boolean } = {}) {
  const calls: string[] = [];
  let live = initial.speed;
  const deps: PauseDeps = {
    readRunState: vi.fn(async () => {
      if (opts.failRead) throw new Error("offline");
      return initial;
    }),
    readLiveSpeed: () => live,
    pause: vi.fn(async () => void calls.push("pause")),
    start: vi.fn(async () => void calls.push("start")),
    setSpeed: vi.fn(async (s: number) => {
      live = s;
      calls.push(`speed:${s}`);
    }),
  };
  return { deps, calls, setLive: (s: number) => (live = s) };
}

describe("pause controller", () => {
  it("pauses a running simulation on the first hold and resumes it on the last release", async () => {
    const { deps, calls } = makeDeps({ running: true, speed: 2 });
    const c = createPauseController(deps);
    await c.hold("title");
    await c.hold("pause-menu");
    expect(calls).toEqual(["pause"]);
    await c.release("title");
    expect(calls).toEqual(["pause"]);
    await c.release("pause-menu");
    expect(calls).toEqual(["pause", "start"]);
  });

  it("leaves a simulation the player had paused by hand paused", async () => {
    const { deps, calls } = makeDeps({ running: false, speed: 1 });
    const c = createPauseController(deps);
    await c.hold("pause-menu");
    await c.release("pause-menu");
    expect(calls).toEqual([]);
  });

  it("restores the speed when it changed while held", async () => {
    const { deps, calls, setLive } = makeDeps({ running: true, speed: 5 });
    const c = createPauseController(deps);
    await c.hold("title");
    setLive(1);
    await c.release("title");
    expect(calls).toEqual(["pause", "start", "speed:5"]);
  });

  it("ignores duplicate holds and releases of unknown reasons", async () => {
    const { deps, calls } = makeDeps({ running: true, speed: 1 });
    const c = createPauseController(deps);
    await c.hold("title");
    await c.hold("title");
    await c.release("nope");
    expect(c.holders()).toEqual(["title"]);
    expect(calls).toEqual(["pause"]);
  });

  it("swaps one holder for another through sync without ever resuming", async () => {
    const { deps, calls } = makeDeps({ running: true, speed: 1 });
    const c = createPauseController(deps);
    await c.sync(["pause-menu"]);
    await c.sync(["title"]);
    expect(calls).toEqual(["pause"]);
    await c.sync([]);
    expect(calls).toEqual(["pause", "start"]);
  });

  it("treats an unreachable backend as paused and never restarts it", async () => {
    const { deps, calls } = makeDeps({ running: true, speed: 1 }, { failRead: true });
    const c = createPauseController(deps);
    await c.hold("title");
    await c.release("title");
    expect(calls).toEqual([]);
  });

  it("rebase makes a freshly reset game come back running, and enforce re-pauses under a hold", async () => {
    const { deps, calls } = makeDeps({ running: false, speed: 1 });
    const c = createPauseController(deps);
    await c.hold("title");
    c.rebase({ running: true });
    await c.enforce();
    expect(calls).toEqual(["pause"]);
    await c.release("title");
    expect(calls).toEqual(["pause", "start"]);
  });

  it("enforce does nothing without holders", async () => {
    const { deps, calls } = makeDeps({ running: true, speed: 1 });
    const c = createPauseController(deps);
    await c.enforce();
    expect(calls).toEqual([]);
  });
});
