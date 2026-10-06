import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "../../store/useGameStore";
import type { Engineer, Service } from "../../types/game";
import EngineeringFloor from "./EngineeringFloor";
import { rosterChoreographer } from "./rosterStage";
import ServerRoom from "./ServerRoom";

const IDS = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"];
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
const engineer = (id: string, service: string | null, over: Partial<Engineer> = {}): Engineer => ({
  id,
  session_id: "s",
  name: `Eng ${id}`,
  assigned_service_id: service,
  core_competency: "auth",
  stress_index: 10,
  stamina: 90,
  on_call_status: "on_duty",
  hired_at_tick: 0,
  ...over,
});

function setTelemetry(services: Service[], engineers: Engineer[], tick = 100) {
  const telemetry = useGameStore.getState().telemetry;
  useGameStore.setState({ telemetry: { ...telemetry, services, engineers, tick, active_incidents: [] } });
}

function Scene({ services }: { services: Service[] }) {
  const noop = () => undefined;
  return (
    <svg>
      <ServerRoom
        originX={0.5}
        originY={0.5}
        services={services}
        selectedServiceId={null}
        serviceSeverities={new Map()}
        investigatingServiceId={null}
        focusedServiceId={null}
        onSelect={noop}
        onHoverService={noop}
        onLeaveService={noop}
      />
      <EngineeringFloor
        originX={9.9}
        originY={0.5}
        services={services}
        selectedServiceId={null}
        onSelect={noop}
        onHoverService={noop}
        onLeaveService={noop}
      />
    </svg>
  );
}

describe("office scene roster and transitions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    rosterChoreographer.dispose();
    useGameStore.setState({ runAnimations: [], reducedMotionPref: "off" });
  });
  afterEach(() => {
    rosterChoreographer.dispose();
    vi.useRealTimers();
  });

  it("keeps one clickable desk per service and shows empty desks as vacant", () => {
    const services = IDS.map((id) => svc(id));
    setTelemetry(services, []);
    const { container } = render(<Scene services={services} />);
    expect(container.querySelectorAll("[data-service-id]")).toHaveLength(5);
    // no sprite exists without a roster: no worker title, every desk carries a vacancy marker
    expect(container.querySelectorAll("title")).toHaveLength(0);
    expect(container.textContent?.match(/VACANT/g)).toHaveLength(5);
  });

  it("seats an engineer on the books at their own desk and clears that desk's vacancy marker", () => {
    const services = IDS.map((id) => svc(id));
    setTelemetry(services, [engineer("e1", "srv-auth")]);
    const { container } = render(<Scene services={services} />);
    expect(container.textContent?.match(/VACANT/g)).toHaveLength(4);
    expect(container.querySelectorAll("title")).toHaveLength(1);
    expect(container.querySelector("title")?.textContent).toContain("Eng e1");
  });

  it("walks a freshly hired engineer in, and keeps walking while the simulation is paused", () => {
    const services = IDS.map((id) => svc(id));
    setTelemetry(services, [], 100);
    const { container } = render(<Scene services={services} />);
    act(() => setTelemetry(services, [engineer("new", "srv-payment", { hired_at_tick: 100 })], 100));
    expect(container.querySelectorAll("title")).toHaveLength(1);
    // the telemetry tick never advances here (a paused sim), yet the hop timers move the sprite and its legs
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(container.querySelector(".animate-walk-cycle-left, .animate-walk-cycle-right")).not.toBeNull();
  });

  it("shakes a failing rack once and runs the restore sequence on recovery", () => {
    const healthy = IDS.map((id) => svc(id));
    setTelemetry(healthy, []);
    const { container, rerender } = render(<Scene services={healthy} />);
    expect(container.querySelector(".ol-rack-shake")).toBeNull();

    const failing = IDS.map((id) => svc(id, id === "srv-auth" ? "down" : "healthy"));
    act(() => setTelemetry(failing, []));
    rerender(<Scene services={failing} />);
    expect(container.querySelectorAll(".ol-rack-shake")).toHaveLength(1);
    // the cascade ripple is made of css-animated ellipses, not SMIL
    expect(container.querySelector("animate")).toBeNull();

    const recovered = IDS.map((id) => svc(id));
    act(() => setTelemetry(recovered, []));
    rerender(<Scene services={recovered} />);
    expect(container.querySelector(".ol-scan")).not.toBeNull();
    expect(container.textContent).toContain("RESTORED");
    // smoke is still mounted, fading out rather than vanishing in one frame
    expect(container.querySelector(".ol-fx-fade")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(container.querySelector(".ol-scan")).toBeNull();
    expect(container.querySelector(".ol-fx-fade")).toBeNull();
  });
});
