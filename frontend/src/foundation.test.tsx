import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TransitionList from "./components/common/TransitionList";
import { usePresence } from "./hooks/usePresence";
import { useGameStore } from "./store/useGameStore";
import type { TelemetryState } from "./types/game";
import { closeTopModal, hasOpenModal, registerModal } from "./utils/modalStack";

function frame(overrides: Partial<TelemetryState> = {}): TelemetryState {
  return { ...useGameStore.getState().telemetry, ...overrides } as TelemetryState;
}

describe("telemetry structural sharing", () => {
  it("keeps references of lists and objects that did not change between frames", () => {
    const services = [
      { id: "srv-a", name: "A", status: "healthy", tier: "critical", latency_ms: 10, error_rate: 0, dependencies: [], session_id: "s" },
      { id: "srv-b", name: "B", status: "healthy", tier: "standard", latency_ms: 20, error_rate: 0, dependencies: [], session_id: "s" },
    ] as unknown as TelemetryState["services"];
    useGameStore.getState().setTelemetry(frame({ tick: 1, services }));
    const first = useGameStore.getState().telemetry;

    // a new tick whose services are structurally identical but freshly parsed objects
    const reparsed = JSON.parse(JSON.stringify(services));
    useGameStore.getState().setTelemetry(frame({ tick: 2, services: reparsed }));
    const second = useGameStore.getState().telemetry;

    expect(second.tick).toBe(2);
    expect(second.services).toBe(first.services);
  });

  it("replaces only the item that changed and keeps the other item reference", () => {
    const base = [
      { id: "srv-a", status: "healthy", latency_ms: 10 },
      { id: "srv-b", status: "healthy", latency_ms: 20 },
    ] as unknown as TelemetryState["services"];
    useGameStore.getState().setTelemetry(frame({ tick: 10, services: base }));
    const before = useGameStore.getState().telemetry.services;

    const next = JSON.parse(JSON.stringify(base));
    next[1].status = "down";
    useGameStore.getState().setTelemetry(frame({ tick: 11, services: next }));
    const after = useGameStore.getState().telemetry.services;

    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1].status).toBe("down");
  });
});

describe("usePresence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ reducedMotionPref: "off" });
  });
  afterEach(() => {
    vi.useRealTimers();
    useGameStore.setState({ reducedMotionPref: "system" });
  });

  it("keeps the last value mounted for the exit duration, then unmounts", () => {
    const { result, rerender } = renderHook(({ v }: { v: string | null }) => usePresence(v, 160), {
      initialProps: { v: "dialog" as string | null },
    });
    expect(result.current.mounted).toBe(true);
    expect(result.current.closing).toBe(false);

    rerender({ v: null });
    expect(result.current.mounted).toBe(true);
    expect(result.current.closing).toBe(true);
    expect(result.current.data).toBe("dialog");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.mounted).toBe(false);
  });

  it("unmounts immediately when motion is reduced", () => {
    useGameStore.setState({ reducedMotionPref: "on" });
    const { result, rerender } = renderHook(({ v }: { v: string | null }) => usePresence(v, 160), {
      initialProps: { v: "dialog" as string | null },
    });
    rerender({ v: null });
    expect(result.current.mounted).toBe(false);
  });
});

describe("modal stack", () => {
  it("closes the top-most modal first and reports when nothing is open", () => {
    const closed: string[] = [];
    const offA = registerModal("a", () => closed.push("a"));
    const offB = registerModal("b", () => closed.push("b"));
    expect(hasOpenModal()).toBe(true);
    expect(closeTopModal()).toBe(true);
    expect(closed).toEqual(["b"]);
    offB();
    expect(closeTopModal()).toBe(true);
    expect(closed).toEqual(["b", "a"]);
    offA();
    expect(hasOpenModal()).toBe(false);
    expect(closeTopModal()).toBe(false);
  });

  it("a must-answer modal swallows Escape without closing anything", () => {
    const closed: string[] = [];
    const offA = registerModal("under", () => closed.push("under"));
    const offCab = registerModal("cab", null);
    expect(closeTopModal()).toBe(true);
    expect(closed).toEqual([]);
    offCab();
    offA();
  });
});

describe("TransitionList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameStore.setState({ reducedMotionPref: "off" });
  });
  afterEach(() => {
    vi.useRealTimers();
    useGameStore.setState({ reducedMotionPref: "system" });
  });

  it("keeps a removed row mounted while it exits, then drops it", () => {
    type Item = { id: string };
    const renderList = (items: Item[]) => (
      <TransitionList items={items} getKey={(i) => i.id} exitMs={200}>
        {(item) => <span>{item.id}</span>}
      </TransitionList>
    );
    const { rerender } = render(renderList([{ id: "one" }, { id: "two" }]));
    expect(screen.getByText("two")).toBeTruthy();

    rerender(renderList([{ id: "one" }]));
    expect(screen.getByText("two")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(screen.queryByText("two")).toBeNull();
    expect(screen.getByText("one")).toBeTruthy();
  });

  it("highlights a row added after the first render but not the initial ones", () => {
    type Item = { id: string };
    const renderList = (items: Item[]) => (
      <TransitionList items={items} getKey={(i) => i.id}>
        {(item, meta) => <span data-testid={item.id} data-new={meta.isNew ? "1" : "0"} />}
      </TransitionList>
    );
    const { rerender } = render(renderList([{ id: "first" }]));
    expect(screen.getByTestId("first").dataset.new).toBe("0");
    rerender(renderList([{ id: "first" }, { id: "second" }]));
    expect(screen.getByTestId("second").dataset.new).toBe("1");
    expect(screen.getByTestId("first").dataset.new).toBe("0");
  });
});
