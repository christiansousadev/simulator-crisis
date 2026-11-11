import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "../../store/useGameStore";
import type { Service } from "../../types/game";
import BoardRoom from "./BoardRoom";
import EngineerDesk from "./EngineerDesk";
import { faceTransform, faceWidth, FACE_SLOPE } from "./IsoFaceDecal";
import { project } from "./isoMath";
import PerimeterWalls from "./PerimeterWalls";
import { setDeskSipping } from "./deskLife";
import { EspressoMachine } from "./OfficeProps";
import { rosterChoreographer } from "./rosterStage";

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

function setServices(services: Service[]) {
  const telemetry = useGameStore.getState().telemetry;
  useGameStore.setState({ telemetry: { ...telemetry, services, engineers: [], active_incidents: [], status: "active" as typeof telemetry.status } });
}

beforeEach(() => {
  rosterChoreographer.dispose();
  useGameStore.setState({ runAnimations: [], triageIncidentId: null });
  setServices([svc("srv-auth")]);
});

afterEach(() => {
  rosterChoreographer.dispose();
});

describe("IsoFaceDecal geometry", () => {
  it("skews face-local pixels onto the 2:1 plane of each wall axis", () => {
    // one tile along x is +32 / +16 px, along y it is -32 / +16 px: a 0.5 rise per px either way
    const alongX = { dx: project(1, 0).x - project(0, 0).x, dy: project(1, 0).y - project(0, 0).y };
    const alongY = { dx: project(0, 0).x - project(0, 1).x, dy: project(0, 0).y - project(0, 1).y };
    expect(alongX.dy / alongX.dx).toBe(FACE_SLOPE.x);
    expect(alongY.dy / alongY.dx).toBe(FACE_SLOPE.y);
  });

  it("anchors the decal at the projected corner", () => {
    const origin = project(2, 3, 0.5);
    expect(faceTransform(2, 3, 0.5, "x")).toBe(`translate(${origin.x} ${origin.y}) matrix(1 0.5 0 1 0 0)`);
    expect(faceTransform(2, 3, 0.5, "y")).toContain("matrix(1 -0.5 0 1 0 0)");
  });

  it("the whiteboard sketch fits inside the 0.52-tile board face", () => {
    expect(faceWidth(0.52)).toBeCloseTo(16.64);
  });
});

describe("boardroom whiteboard C4 sketch", () => {
  const sketch = (container: HTMLElement) => container.querySelector('g[transform*="matrix(1 0.5 0 1 0 0)"]');

  it("draws the diagram flat on the board with crisp pixel edges and no rounded corners", () => {
    const { container } = render(
      <svg>
        <BoardRoom originX={0} originY={0} />
      </svg>
    );
    const g = sketch(container);
    expect(g).not.toBeNull();
    expect(g).toHaveAttribute("shape-rendering", "crispEdges");
    const rects = Array.from(g!.querySelectorAll("rect"));
    expect(rects.length).toBeGreaterThan(8);
    expect(rects.every((r) => !r.hasAttribute("rx"))).toBe(true);
    // everything stays inside the face's ~16.6px width
    for (const r of rects) {
      expect(Number(r.getAttribute("x")) + Number(r.getAttribute("width"))).toBeLessThanOrEqual(faceWidth(0.52));
    }
    expect(g!.querySelector(".animate-blink")).toBeNull();
  });

  it("marks the failing service in red during a red alert", () => {
    setServices([svc("srv-auth", "down")]);
    const { container } = render(
      <svg>
        <BoardRoom originX={0} originY={0} />
      </svg>
    );
    const g = sketch(container)!;
    expect(g.querySelector(".animate-blink")).not.toBeNull();
    expect(g.querySelector('rect[fill="#dc2626"]')).not.toBeNull();
  });
});

describe("desk and wall micro details", () => {
  it("gives every desk a crisp SRE mug with a handle and coffee, steaming only while someone is seated", () => {
    const noop = () => undefined;
    const { getByTestId } = render(
      <svg>
        <EngineerDesk service={svc("srv-auth")} x={1} y={1} selected={false} onSelect={noop} onHover={noop} onLeave={noop} />
      </svg>
    );
    const mug = getByTestId("sre-mug");
    expect(mug).toHaveAttribute("shape-rendering", "crispEdges");
    // body, band, coffee and handle: four iso boxes of three faces each
    expect(mug.querySelectorAll(":scope > g[shape-rendering] > polygon").length).toBeGreaterThanOrEqual(12);
    expect(mug.querySelector(".ol-pixel-steam")).toBeNull();
  });

  it("hangs the extinguisher, first-aid cabinet and exit sign on the wall in crisp pixel art", () => {
    const { getByTestId } = render(
      <svg>
        <PerimeterWalls minX={0} minY={0} maxX={10} maxY={8} />
      </svg>
    );
    for (const id of ["wall-extinguisher", "wall-first-aid", "wall-exit-sign"]) {
      const el = getByTestId(id);
      expect(el).toHaveAttribute("shape-rendering", "crispEdges");
      expect(el.querySelector('g[transform*="matrix(1 0.5 0 1 0 0)"]')).not.toBeNull();
    }
  });
});

describe("office life props", () => {
  const noop = () => undefined;
  const desk = () => (
    <svg>
      <EngineerDesk service={svc("srv-auth")} x={1} y={1} selected={false} onSelect={noop} onHover={noop} onLeave={noop} />
    </svg>
  );

  it("takes the mug off the desk while its engineer sips, and puts it back", () => {
    const { queryByTestId } = render(desk());
    expect(queryByTestId("sre-mug")).not.toBeNull();
    act(() => setDeskSipping("srv-auth", true));
    expect(queryByTestId("sre-mug")).toBeNull();
    expect(queryByTestId("sre-mug-lifted")).not.toBeNull();
    act(() => setDeskSipping("srv-auth", false));
    expect(queryByTestId("sre-mug")).not.toBeNull();
  });

  it("throws pixel confetti over the desk while its service is restored", () => {
    useGameStore.setState({ runAnimations: [{ id: "r1", serviceId: "srv-auth", kind: "recover" }] });
    const { queryByTestId } = render(desk());
    expect(queryByTestId("desk-burst")).not.toBeNull();
  });

  it("the espresso machine pulls a shot with a lit brew LED and a coffee stream", () => {
    const { queryByTestId, rerender } = render(
      <svg>
        <EspressoMachine x={1} y={1} />
      </svg>
    );
    expect(queryByTestId("espresso-brewing")).toBeNull();
    rerender(
      <svg>
        <EspressoMachine x={1} y={1} brewing />
      </svg>
    );
    expect(queryByTestId("espresso-brewing")).not.toBeNull();
  });
});
