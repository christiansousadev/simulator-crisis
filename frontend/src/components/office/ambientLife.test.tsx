import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../../store/useGameStore";
import type { Engineer, Service } from "../../types/game";
import BoardRoom from "./BoardRoom";
import BreakRoom from "./BreakRoom";
import EngineerDesk from "./EngineerDesk";
import OfficeWorker from "./OfficeWorker";
import { OfficePlant, SlidingGlassDoor, Sofa } from "./OfficeProps";
import { useRosterStage, type WalkerView } from "./rosterStage";
import ServerRack from "./ServerRack";
import { seatNodeId } from "./waypointGraph";
import WanderingEmployee from "./WanderingEmployee";
import { isLampHour } from "./officeLifeUtils";

const noop = () => undefined;

const svc = (id: string, status: Service["status"] = "healthy"): Service => ({
  id,
  session_id: "s",
  name: id,
  tier: "critical",
  status,
  latency_ms: 40,
  error_rate: 0,
  dependencies: [],
});

const engineer = (id: string, service: string | null): Engineer => ({
  id,
  session_id: "s",
  name: `Eng ${id}`,
  assigned_service_id: service,
  core_competency: "auth",
  stress_index: 10,
  stamina: 90,
  on_call_status: "on_duty",
  hired_at_tick: 0,
});

const walker = (over: Partial<WalkerView>): WalkerView => ({
  id: "w1",
  nodeId: "n",
  x: 0,
  y: 0,
  z: 0,
  hopMs: 0,
  facing: "right",
  heading: "se",
  easing: "linear",
  seated: false,
  band: "w0",
  place: "desk",
  mug: false,
  ...over,
});

function setWorld({ services = [svc("srv-auth")], engineers = [] as Engineer[], tick = 0, happiness = 80 } = {}) {
  const telemetry = useGameStore.getState().telemetry;
  useGameStore.setState({
    telemetry: { ...telemetry, services, engineers, tick, user_happiness: happiness, active_incidents: [], status: "active" as typeof telemetry.status },
  });
}

const desk = () => (
  <svg>
    <EngineerDesk service={svc("srv-auth")} x={1} y={1} selected={false} onSelect={noop} onHover={noop} onLeave={noop} />
  </svg>
);

const rack = () => (
  <svg>
    <ServerRack service={svc("srv-auth")} x={1} y={1} selected={false} onSelect={noop} onHover={noop} onLeave={noop} />
  </svg>
);

// stores are reset BEFORE each test, never after: resetting them while the previous test's tree is
// still mounted would re-render it outside act
beforeEach(() => {
  useGameStore.setState({ reducedMotionPref: "off", runAnimations: [], triageIncidentId: null });
  useRosterStage.setState({ walkers: [], serverRoomOccupied: false });
  setWorld();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("vault door", () => {
  it("slides open on its stepped track while a walker crosses into the vault", () => {
    const { getByTestId, rerender } = render(
      <svg>
        <SlidingGlassDoor x={1} y={1} />
      </svg>
    );
    expect(getByTestId("vault-door")).not.toHaveAttribute("data-open");
    expect(getByTestId("vault-door")).toHaveClass("ol-door-slide");
    rerender(
      <svg>
        <SlidingGlassDoor x={1} y={1} open />
      </svg>
    );
    expect(getByTestId("vault-door")).toHaveAttribute("data-open");
    expect(getByTestId("vault-door").style.transform).toBe("translate(-10px, 5px)");
  });
});

describe("engineer desk ambient life", () => {
  it("leaves the chair pushed back and turned while its engineer is away, and tucks it in once seated", () => {
    setWorld({ engineers: [engineer("e1", "srv-auth")] });
    const { getByTestId } = render(desk());
    expect(getByTestId("desk-chair")).toHaveAttribute("data-state", "out");
    act(() => useRosterStage.setState({ walkers: [walker({ seated: true, nodeId: seatNodeId("srv-auth") })] }));
    expect(getByTestId("desk-chair")).toHaveAttribute("data-state", "in");
  });

  it("keeps a vacant desk's chair tucked in", () => {
    const { getByTestId } = render(desk());
    expect(getByTestId("desk-chair")).toHaveAttribute("data-state", "in");
  });

  it("runs a dim screensaver on both monitors of a desk nobody is assigned to", () => {
    const { queryAllByTestId, unmount } = render(desk());
    const bars = queryAllByTestId("desk-screensaver");
    expect(bars).toHaveLength(2);
    expect(bars[0].querySelector(".ol-screensaver")).not.toBeNull();
    unmount();
    setWorld({ engineers: [engineer("e1", "srv-auth")] });
    expect(render(desk()).queryAllByTestId("desk-screensaver")).toHaveLength(0);
  });

  it("switches the desk lamp on at dusk with a flicker, and leaves it off by day", () => {
    expect(isLampHour(8)).toBe(false);
    expect(isLampHour(18)).toBe(true);
    expect(isLampHour(3)).toBe(true);
    const { queryByTestId } = render(desk());
    // tick 0 is 08:00
    expect(queryByTestId("desk-lamp-light")).toBeNull();
    act(() => setWorld({ tick: 10 }));
    expect(queryByTestId("desk-lamp-light")).toHaveClass("ol-lamp-on");
  });
});

describe("world-anchored value chips", () => {
  it("raises +SLA off a restored rack and -$ off a rack being mitigated, both motion-only", () => {
    useGameStore.setState({ runAnimations: [{ id: "m1", serviceId: "srv-auth", kind: "mitigate" }] });
    const { queryByTestId, rerender } = render(rack());
    const cost = queryByTestId("rack-chip-cost");
    expect(cost).not.toBeNull();
    expect(cost!.textContent).toBe("-$");
    expect(cost!.querySelector(".ol-chip.motion-only")).not.toBeNull();

    act(() => useGameStore.setState({ runAnimations: [{ id: "r1", serviceId: "srv-auth", kind: "recover" }] }));
    rerender(rack());
    expect(queryByTestId("rack-chip-cost")).toBeNull();
    expect(queryByTestId("rack-chip-sla")?.textContent).toBe("+SLA");
  });

  it("raises +XP off the desk of the engineer whose service was restored, and nothing off a vacant desk", () => {
    useGameStore.setState({ runAnimations: [{ id: "r1", serviceId: "srv-auth", kind: "recover" }] });
    const vacant = render(desk());
    expect(vacant.queryByTestId("desk-chip-xp")).toBeNull();
    vacant.unmount();
    setWorld({ engineers: [engineer("e1", "srv-auth")] });
    expect(render(desk()).queryByTestId("desk-chip-xp")?.textContent).toBe("+XP");
  });
});

describe("run dust", () => {
  const Worker = (props: Parameters<typeof OfficeWorker>[0]) => (
    <svg>
      <OfficeWorker {...props} />
    </svg>
  );

  it("kicks up two recycled motes behind the heels on an urgency run, none on a walk", () => {
    const run = render(<Worker x={1} y={1} transitionMs={500} />);
    run.rerender(<Worker x={3} y={1} transitionMs={500} />);
    const dust = run.getByTestId("worker-dust");
    expect(dust.querySelectorAll(".ol-dust")).toHaveLength(2);
    run.unmount();

    const walk = render(<Worker x={1} y={1} transitionMs={1000} />);
    walk.rerender(<Worker x={2} y={1} transitionMs={1000} />);
    expect(walk.container.querySelector(".ol-rig")).toHaveAttribute("data-gait", "walk");
    expect(walk.queryByTestId("worker-dust")).toBeNull();
  });
});

describe("executives at the metrics tv", () => {
  it("on red alert one points at the screen and the other taps a foot, instead of the panic style", () => {
    setWorld({ services: [svc("srv-auth", "down")] });
    const { container } = render(
      <svg>
        <BoardRoom originX={0} originY={0} />
      </svg>
    );
    const pointer = container.querySelector('.ol-rig[data-action="point"]');
    const stomper = container.querySelector('.ol-rig[data-action="stomp"]');
    expect(pointer).not.toBeNull();
    expect(stomper).not.toBeNull();
    expect(pointer).not.toHaveAttribute("data-panic");
    expect(stomper).not.toHaveAttribute("data-panic");
    // still alarmed: the panic balloon stays over both of them
    expect(pointer).toHaveAttribute("data-mood", "panic");
  });

  it("sit calmly with no action outside an alert", () => {
    const { container } = render(
      <svg>
        <BoardRoom originX={0} originY={0} />
      </svg>
    );
    expect(container.querySelector(".ol-rig[data-action]")).toBeNull();
  });
});

describe("wanderers on red alert", () => {
  const Wanderer = () => (
    <svg>
      <WanderingEmployee waypoints={[{ x: 2, y: 2, action: "walk" }]} shirtColor="#111111" hairColor="#222222" />
    </svg>
  );
  const sprite = (c: HTMLElement) => c.querySelector("svg > g") as SVGGElement;

  it("turn to the vault, crane their head and take one short hesitant step back", () => {
    const { container } = render(<Wanderer />);
    const before = sprite(container).style.transform;
    expect(container.querySelector(".ol-rig")).not.toHaveAttribute("data-wary");

    act(() => setWorld({ services: [svc("srv-auth", "down")] }));
    expect(sprite(container).style.transform).not.toBe(before);
    expect(sprite(container).style.transition).toContain("500ms");
    expect(container.querySelector(".ol-rig")).toHaveAttribute("data-wary");
    // a single short stride, read as a walk rather than a slide
    expect(container.querySelector(".ol-rig")).toHaveAttribute("data-gait", "walk");
  });

  it("only turn and look under reduced motion, without stepping", () => {
    useGameStore.setState({ reducedMotionPref: "on" });
    const { container } = render(<Wanderer />);
    const before = sprite(container).style.transform;
    act(() => setWorld({ services: [svc("srv-auth", "down")] }));
    expect(sprite(container).style.transform).toBe(before);
    expect(container.querySelector(".ol-rig")).toHaveAttribute("data-wary");
  });
});

describe("potted plant", () => {
  const plant = () => (
    <svg>
      <OfficePlant x={2} y={2} />
    </svg>
  );

  it("rustles one pixel when somebody runs past it on red alert", () => {
    setWorld({ services: [svc("srv-auth", "down")] });
    useRosterStage.setState({ walkers: [walker({ x: 2.6, y: 2.4, hopMs: 300 })] });
    const { getByTestId } = render(plant());
    expect(getByTestId("office-plant")).toHaveAttribute("data-rustling");
    expect(getByTestId("office-plant").querySelector(".ol-plant-sway")).not.toBeNull();
  });

  it("stays still for a walker far away, a seated one, or when there is no alert", () => {
    setWorld({ services: [svc("srv-auth", "down")] });
    useRosterStage.setState({ walkers: [walker({ x: 6, y: 6, hopMs: 300 }), walker({ id: "w2", x: 2.2, y: 2.2, seated: true, hopMs: 300 })] });
    const { getByTestId, unmount } = render(plant());
    expect(getByTestId("office-plant")).not.toHaveAttribute("data-rustling");
    unmount();
    setWorld();
    useRosterStage.setState({ walkers: [walker({ x: 2.6, y: 2.4, hopMs: 300 })] });
    expect(render(plant()).getByTestId("office-plant")).not.toHaveAttribute("data-rustling");
  });
});

describe("sofa cushion", () => {
  it("sinks a pixel under somebody lounging and springs back when they leave", () => {
    const { getByTestId, rerender } = render(
      <svg>
        <Sofa x={1} y={1} />
      </svg>
    );
    expect(getByTestId("sofa-cushion")).not.toHaveAttribute("data-sunk");
    rerender(
      <svg>
        <Sofa x={1} y={1} occupied />
      </svg>
    );
    expect(getByTestId("sofa-cushion")).toHaveAttribute("data-sunk");
    expect(getByTestId("sofa-cushion")).toHaveClass("ol-cushion");
  });

  it("sinks in the lounge when an engineer on a break sits down", () => {
    setWorld({ happiness: 10 });
    const { getByTestId } = render(
      <svg>
        <BreakRoom originX={0} originY={0} />
      </svg>
    );
    expect(getByTestId("sofa-cushion")).not.toHaveAttribute("data-sunk");
    act(() => useRosterStage.setState({ walkers: [walker({ seated: true, place: "lounge", band: "lounge" })] }));
    expect(getByTestId("sofa-cushion")).toHaveAttribute("data-sunk");
  });

  it("sinks when the wandering employee reaches the sofa on their patrol", () => {
    vi.useFakeTimers();
    // only employee A walks the lounge at this morale; its loop is walk -> coffee -> sofa
    setWorld({ happiness: 30 });
    const { getByTestId } = render(
      <svg>
        <BreakRoom originX={0} originY={0} />
      </svg>
    );
    // step the patrol one leg at a time so each arrival effect commits before the next timer
    for (const ms of [4500, 4500, 1900]) {
      act(() => {
        vi.advanceTimersByTime(ms);
      });
    }
    expect(getByTestId("sofa-cushion")).toHaveAttribute("data-sunk");
  });
});
