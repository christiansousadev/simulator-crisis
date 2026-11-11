import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ImpactFlash from "../common/ImpactFlash";
import { shouldShake, SHAKE_COOLDOWN_MS, useSceneShake } from "../../hooks/useSceneShake";
import { useGameStore } from "../../store/useGameStore";
import type { Service } from "../../types/game";
import { useRef } from "react";
import OfficeWorker from "./OfficeWorker";
import PixelBurst from "./PixelBurst";
import { hopEasing, RosterChoreographer, WalkerView } from "./rosterStage";
import ServerRack from "./ServerRack";
import { GESTURE_GAP_MAX_MS, GESTURE_GAP_MIN_MS, nextGestureDelay, pickGesture } from "./useIdleGesture";
import { buildGraph, frontHeading, headingForMove, isBackHeading } from "./waypointGraph";
import { gaitFor, headingFromDelta, panicVariantFor, seedOf, startleWaveMs } from "./workerRig";

const Worker = (props: Parameters<typeof OfficeWorker>[0]) => (
  <svg>
    <OfficeWorker {...props} />
  </svg>
);

beforeEach(() => {
  useGameStore.setState({ reducedMotionPref: "off", runAnimations: [] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("gait timing: one --step clock derived from speed", () => {
  it("walks at 1.5 tiles/s with a 0.33s cycle and runs at 3.2 tiles/s with a 0.2s cycle", () => {
    expect(gaitFor(1.5, 1000)).toEqual({ gait: "walk", stepS: 0.333 });
    expect(gaitFor(3.2, 1000)).toEqual({ gait: "run", stepS: 0.2 });
  });

  it("covers one stride per cycle, so a slower walk takes longer steps in time, clamped to sane bounds", () => {
    expect(gaitFor(1, 1000).stepS).toBe(0.5);
    expect(gaitFor(0.1, 1000).stepS).toBe(0.6);
    expect(gaitFor(20, 1000).stepS).toBe(0.16);
    expect(gaitFor(0, 1000)).toEqual({ gait: "walk", stepS: 0.33 });
  });
});

describe("four isometric headings", () => {
  it("n* walks away from the camera, s* toward it, and e/w always matches the facing", () => {
    expect(headingForMove({ x: 5, y: 5 }, { x: 4, y: 4 }, "right")).toBe("ne");
    expect(headingForMove({ x: 5, y: 5 }, { x: 4, y: 4 }, "left")).toBe("nw");
    expect(headingForMove({ x: 4, y: 4 }, { x: 5, y: 5 }, "right")).toBe("se");
    expect(headingForMove({ x: 4, y: 4 }, { x: 5, y: 5 }, "left")).toBe("sw");
    // no depth change keeps the north/south half of the previous heading
    expect(headingForMove({ x: 4, y: 5 }, { x: 5, y: 4 }, "right", "nw")).toBe("ne");
  });

  it("free sprites derive the heading from their grid delta", () => {
    expect(headingFromDelta(-1, 0, "se")).toBe("nw");
    expect(headingFromDelta(0, -1, "se")).toBe("ne");
    expect(headingFromDelta(1, 0, "nw")).toBe("se");
    expect(headingFromDelta(0, 0, "nw")).toBe("nw");
  });

  it("front headings for a sprite standing still", () => {
    expect(frontHeading("left")).toBe("sw");
    expect(frontHeading("right")).toBe("se");
    expect(isBackHeading("ne") && isBackHeading("nw")).toBe(true);
    expect(isBackHeading("se") || isBackHeading("sw")).toBe(false);
  });
});

describe("RosterChoreographer heading + easing contract", () => {
  beforeEach(() => vi.useFakeTimers());

  // a → b → c walks away from the camera, c → d turns back toward it and sits down facing left
  const graph = buildGraph(
    [
      { id: "a", x: 5, y: 5, face: "right" },
      { id: "b", x: 4, y: 4 },
      { id: "c", x: 3, y: 3 },
      { id: "d", x: 3, y: 4, face: "left", seat: true },
    ],
    [
      ["a", "b"],
      ["b", "c"],
      ["c", "d"],
    ]
  );

  it("publishes n* headings walking away, s* coming back, eases in and out of the route, and faces front once seated", () => {
    let views: WalkerView[] = [];
    const stage = new RosterChoreographer(graph, { publish: (v) => (views = v), checkIn: () => undefined });
    const tgt = (nodeId: string) => ({ id: "e1", nodeId, place: "desk" as const, mug: false, fresh: false });
    stage.sync([tgt("a")], { instant: false });
    expect(views[0]).toMatchObject({ heading: "se", easing: "linear" });

    stage.sync([tgt("d")], { instant: false });
    const seen: Array<Pick<WalkerView, "nodeId" | "heading" | "easing" | "seated">> = [];
    const record = () => {
      const v = views[0];
      const last = seen[seen.length - 1];
      if (!last || last.nodeId !== v.nodeId || last.seated !== v.seated) seen.push({ nodeId: v.nodeId, heading: v.heading, easing: v.easing, seated: v.seated });
    };
    for (let i = 0; i < 80; i++) {
      act(() => {
        vi.advanceTimersByTime(100);
      });
      record();
    }
    expect(seen).toEqual([
      { nodeId: "b", heading: "ne", easing: "ease-in", seated: false },
      { nodeId: "c", heading: "ne", easing: "linear", seated: false },
      { nodeId: "d", heading: "sw", easing: "ease-out", seated: false },
      { nodeId: "d", heading: "sw", easing: "ease-out", seated: true },
    ]);
    stage.dispose();
  });

  it("names the easing of every hop position in a route", () => {
    expect(hopEasing(true, false)).toBe("ease-in");
    expect(hopEasing(false, false)).toBe("linear");
    expect(hopEasing(false, true)).toBe("ease-out");
    expect(hopEasing(true, true)).toBe("ease-in-out");
  });
});

describe("OfficeWorker rig", () => {
  it("keeps the contact shadow on the floor, outside every bobbing layer", () => {
    const { container } = render(<Worker x={1} y={1} />);
    const shadow = container.querySelector("ellipse.ol-shadow")!;
    expect(shadow).not.toBeNull();
    expect(shadow.closest(".ol-bob")).toBeNull();
    expect(shadow.closest(".ol-cue")).toBeNull();
    expect(shadow.closest(".ol-rig")).not.toBeNull();
    // legs bob with the body; breathing only moves the upper body, never the feet
    const bob = container.querySelector(".ol-bob")!;
    expect(bob.querySelector(".ol-leg-l")).not.toBeNull();
    expect(container.querySelector(".ol-upper .ol-leg-l")).toBeNull();
    expect(container.querySelector(".ol-upper .ol-head")).not.toBeNull();
  });

  it("stands still by default, with a per-sprite breathing phase and a mood-paced cycle", () => {
    const { container, rerender } = render(<Worker x={1} y={1} seedKey="eng-a" mood="idle" />);
    const rig = container.querySelector(".ol-rig") as HTMLElement;
    expect(rig.dataset.gait).toBe("still");
    expect(rig.style.getPropertyValue("--breathe")).toBe("3s");
    const phaseA = rig.style.getPropertyValue("--phase");
    rerender(<Worker x={1} y={1} seedKey="eng-b" mood="tired" />);
    const rigB = container.querySelector(".ol-rig") as HTMLElement;
    expect(rigB.style.getPropertyValue("--breathe")).toBe("4.5s");
    expect(rigB.style.getPropertyValue("--phase")).not.toBe(phaseA);
  });

  it("enters a walking gait while sliding to a new spot and drops back to still when it arrives", () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<Worker x={1} y={1} transitionMs={1000} />);
    rerender(<Worker x={2.5} y={1} transitionMs={1000} />);
    const rig = () => container.querySelector(".ol-rig") as HTMLElement;
    expect(rig().dataset.gait).toBe("walk");
    expect(rig().style.getPropertyValue("--step")).toBe("0.333s");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(rig().dataset.gait).toBe("still");
  });

  it("runs (and leans) above the run threshold", () => {
    const { container, rerender } = render(<Worker x={1} y={1} transitionMs={500} />);
    rerender(<Worker x={3} y={1} transitionMs={500} />);
    expect((container.querySelector(".ol-rig") as HTMLElement).dataset.gait).toBe("run");
  });

  it("shows the back view only for n* headings: no face, no glasses, no lanyard", () => {
    const { container, rerender, queryByTestId } = render(<Worker x={1} y={1} heading="ne" glasses badge role="engineer" />);
    expect(queryByTestId("worker-back-head")).not.toBeNull();
    expect(queryByTestId("worker-face")).toBeNull();
    expect(container.querySelector(".ol-rig")).toHaveAttribute("data-view", "back");
    rerender(<Worker x={1} y={1} heading="sw" glasses badge role="engineer" />);
    expect(queryByTestId("worker-face")).not.toBeNull();
    expect(queryByTestId("worker-back-head")).toBeNull();
    expect(container.querySelector(".ol-rig")).toHaveAttribute("data-view", "front");
  });

  it("locks the arm holding a laptop or a mug so only the free arm swings", () => {
    const { container, rerender } = render(<Worker x={1} y={1} carriesLaptop />);
    const locked = container.querySelectorAll(".ol-arm-r[data-locked]");
    expect(locked.length).toBeGreaterThan(0);
    expect(container.querySelector(".ol-arm-l[data-locked]")).toBeNull();
    expect(container.querySelector('[data-testid="worker-laptop"]')!.closest(".ol-arm-r")).not.toBeNull();
    rerender(<Worker x={1} y={1} />);
    expect(container.querySelector(".ol-arm-r[data-locked]")).toBeNull();
  });

  it("gives each engineer a stable panic style, so a panicking floor is not a choir", () => {
    const variants = new Set(["e1", "e2", "e3", "e4", "e5", "e6", "e7"].map((id) => panicVariantFor(seedOf(id))));
    expect(variants.size).toBeGreaterThan(1);
    const { container } = render(<Worker x={1} y={1} seedKey="e1" mood="panic" />);
    expect(container.querySelector(".ol-rig")).toHaveAttribute("data-panic", panicVariantFor(seedOf("e1")));
  });

  it("marks the lounge pose and types in bursts at a desk", () => {
    const { container, rerender, queryByTestId } = render(<Worker x={1} y={1} seated lounging />);
    expect(container.querySelector(".ol-rig")).toHaveAttribute("data-pose", "lounge");
    rerender(<Worker x={1} y={1} seated typing role="engineer" />);
    expect(queryByTestId("worker-typing")!.querySelector(".ol-type-l")).not.toBeNull();
  });

  it("startles on a fresh alarm: cue replayed and a '!' balloon in the floor wave", () => {
    vi.useFakeTimers();
    const { container, rerender, queryByTestId } = render(<Worker x={1} y={1} alarmed={false} />);
    rerender(<Worker x={1} y={1} alarmed />);
    expect(container.querySelector(".ol-cue")).toHaveClass("ol-cue-startle");
    const balloon = queryByTestId("worker-exclaim");
    expect(balloon).not.toBeNull();
    expect((balloon as unknown as HTMLElement).style.getPropertyValue("--wave")).toBe(`${startleWaveMs(1, 1)}ms`);
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(queryByTestId("worker-exclaim")).toBeNull();
  });

  it("cheers with both arms up while its service is being restored", () => {
    const { container } = render(<Worker x={1} y={1} cheering />);
    expect(container.querySelector(".ol-rig")).toHaveAttribute("data-gesture", "cheer");
  });

  it("plays a sporadic idle gesture within 6-14s and then returns to rest", () => {
    vi.useFakeTimers();
    // r = 1 schedules the gesture at exactly the 14s upper bound
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const { container } = render(<Worker x={1} y={1} gestures={["look"]} />);
    const rig = () => container.querySelector(".ol-rig")!;
    expect(rig()).not.toHaveAttribute("data-gesture");
    act(() => {
      vi.advanceTimersByTime(GESTURE_GAP_MAX_MS);
    });
    expect(rig()).toHaveAttribute("data-gesture", "look");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(rig()).not.toHaveAttribute("data-gesture");
  });

  it("sips from the mug: the mug travels in the hand and the callback lets the desk hide its own", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const onGesture = vi.fn();
    const { queryByTestId } = render(<Worker x={1} y={1} seated typing gestures={["sip"]} onGestureChange={onGesture} />);
    act(() => {
      vi.advanceTimersByTime(GESTURE_GAP_MAX_MS);
    });
    expect(queryByTestId("worker-sip-mug")).not.toBeNull();
    // typing pauses while drinking
    expect(queryByTestId("worker-typing")).toBeNull();
    expect(onGesture).toHaveBeenLastCalledWith("sip");
  });

  it("squashes on click from its feet", () => {
    const { container } = render(<Worker x={1} y={1} />);
    act(() => {
      (container.querySelector("g.cursor-pointer") as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".ol-cue")).toHaveClass("ol-press");
  });
});

describe("reduced motion", () => {
  beforeEach(() => {
    useGameStore.setState({ reducedMotionPref: "on" });
  });

  it("no startle cue and no balloon; the static panic pose still tells the story", () => {
    const { container, rerender, queryByTestId } = render(<Worker x={1} y={1} alarmed={false} mood="panic" />);
    rerender(<Worker x={1} y={1} alarmed mood="panic" />);
    expect(container.querySelector(".ol-cue")!.getAttribute("class")).toBe("ol-cue");
    expect(queryByTestId("worker-exclaim")).toBeNull();
    // the panic "!" box is a static, readable state
    expect(container.textContent).toContain("!");
  });

  it("schedules no idle gestures and no click squash", () => {
    vi.useFakeTimers();
    const { container } = render(<Worker x={1} y={1} gestures={["look", "watch"]} />);
    act(() => {
      vi.advanceTimersByTime(GESTURE_GAP_MAX_MS * 3);
    });
    expect(container.querySelector(".ol-rig")).not.toHaveAttribute("data-gesture");
    act(() => {
      (container.querySelector("g.cursor-pointer") as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".ol-cue")).not.toHaveClass("ol-press");
  });

  it("replaces the shake with a static border flash", () => {
    vi.useFakeTimers();
    const { queryByTestId } = render(<ImpactFlash />);
    act(() => useGameStore.setState((s) => ({ impactFlashSeq: s.impactFlashSeq + 1 })));
    expect(queryByTestId("impact-border")).not.toBeNull();
    expect(queryByTestId("impact-border")).not.toHaveClass("animate-impact-flash-fx");
    expect(queryByTestId("impact-flash")).toBeNull();
  });

  it("never shakes the scene", () => {
    function Scene() {
      const ref = useRef<SVGSVGElement>(null);
      useSceneShake(ref);
      return <svg ref={ref} data-testid="scene" />;
    }
    const { getByTestId } = render(<Scene />);
    act(() => useGameStore.getState().triggerScreenShake("heavy"));
    expect(getByTestId("scene").getAttribute("class") ?? "").not.toMatch(/screen-shake/);
  });
});

describe("scene shake", () => {
  it("shakes the scene element with the magnitude's class", () => {
    function Scene() {
      const ref = useRef<SVGSVGElement>(null);
      useSceneShake(ref);
      return <svg ref={ref} data-testid="scene" />;
    }
    const { getByTestId } = render(<Scene />);
    act(() => useGameStore.getState().triggerScreenShake("quake"));
    expect(getByTestId("scene")).toHaveClass("screen-shake-quake");
  });

  it("holds a cooldown so a cascade is not one continuous earthquake, unless the hit is harder", () => {
    const last = { at: 1000, magnitude: "heavy" as const };
    expect(shouldShake(null, "light", 0)).toBe(true);
    expect(shouldShake(last, "light", 1000 + SHAKE_COOLDOWN_MS - 1)).toBe(false);
    expect(shouldShake(last, "heavy", 1500)).toBe(false);
    expect(shouldShake(last, "quake", 1500)).toBe(true);
    expect(shouldShake(last, "light", 1000 + SHAKE_COOLDOWN_MS)).toBe(true);
  });
});

describe("idle gesture scheduling", () => {
  it("waits 6-14s between gestures and picks from the pool", () => {
    expect(nextGestureDelay(0)).toBe(GESTURE_GAP_MIN_MS);
    expect(nextGestureDelay(1)).toBe(GESTURE_GAP_MAX_MS);
    expect(nextGestureDelay(5)).toBe(GESTURE_GAP_MAX_MS);
    expect(pickGesture(["look", "watch"], 0)).toBe("look");
    expect(pickGesture(["look", "watch"], 0.99)).toBe("watch");
    expect(pickGesture([], 0.5)).toBeNull();
  });
});

describe("rack juice", () => {
  const svc = (status: Service["status"]): Service => ({
    id: "srv-auth",
    session_id: "s",
    name: "auth",
    tier: "critical",
    status,
    latency_ms: 40,
    error_rate: 0,
    dependencies: [],
  });
  const Rack = ({ status }: { status: Service["status"] }) => (
    <svg>
      <ServerRack service={svc(status)} x={1} y={1} selected={false} onSelect={() => undefined} onHover={() => undefined} onLeave={() => undefined} />
    </svg>
  );

  it("fans strain when degraded and spin down when down; only a down chassis rattles", () => {
    const { getByTestId, rerender } = render(<Rack status="healthy" />);
    expect(getByTestId("rack-fan")).toHaveClass("ol-fan");
    expect(getByTestId("rack-chassis")).not.toHaveClass("ol-rack-rattle");
    rerender(<Rack status="degraded" />);
    expect(getByTestId("rack-fan")).toHaveClass("ol-fan-strain");
    rerender(<Rack status="down" />);
    expect(getByTestId("rack-fan")).toHaveClass("ol-fan-spindown");
    expect(getByTestId("rack-chassis")).toHaveClass("ol-rack-rattle");
  });

  it("throws a pixel burst while the rack is restored", () => {
    useGameStore.setState({ runAnimations: [{ id: "r1", serviceId: "srv-auth", kind: "recover" } as never] });
    const { getByTestId } = render(<Rack status="healthy" />);
    expect(getByTestId("rack-burst").querySelectorAll(".ol-burst-px")).toHaveLength(14);
  });

  it("presses into the floor on click", () => {
    const { container } = render(<Rack status="healthy" />);
    const root = container.querySelector("[data-rack-service-id]")!;
    act(() => {
      root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(root).toHaveClass("ol-press");
  });

  it("pixel bursts are drawn from a fixed pool on whole pixels", () => {
    const { getByTestId } = render(
      <svg>
        <PixelBurst x={10.4} y={20.6} count={20} />
      </svg>
    );
    const burst = getByTestId("pixel-burst");
    expect(burst.getAttribute("transform")).toBe("translate(10 21)");
    expect(burst.querySelectorAll("rect")).toHaveLength(16);
  });
});
