import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CableTray, { PULSE_STYLE, SEVER_FRACTION, type NetworkHealth } from "./CableTray";
import { AlertBeacon } from "./EmergencyFx";
import OfficeWorker from "./OfficeWorker";
import { RUN_SPEED_TILES_PER_S, rosterChoreographer, setRosterUrgency } from "./rosterStage";
import { WALK_SPEED_TILES_PER_S, hopDurationMs } from "./waypointGraph";

const reducedMotion = vi.hoisted(() => ({ value: false }));
vi.mock("../../hooks/useReducedMotion", () => ({ useReducedMotion: () => reducedMotion.value }));

beforeEach(() => {
  reducedMotion.value = false;
  setRosterUrgency(false);
});

function renderTray(health: NetworkHealth) {
  return render(
    <svg>
      <CableTray networkHealth={health} />
    </svg>
  );
}

describe("CableTray data pulses", () => {
  it.each(["healthy", "degraded", "down"] as const)("draws %s pulses in that tier's colour, two cables wide", (health) => {
    const { container } = renderTray(health);
    const pulses = container.querySelectorAll('[data-testid="cable-pulse"]');
    expect(pulses).toHaveLength(PULSE_STYLE[health].count * 2);
    for (const pulse of pulses) expect(pulse.getAttribute("fill")).toBe(PULSE_STYLE[health].color);
  });

  it("is cyan when healthy, amber and slower when degraded, red when down", () => {
    expect(PULSE_STYLE.healthy.color).toBe("#22d3ee");
    expect(PULSE_STYLE.degraded.durationS).toBeGreaterThan(PULSE_STYLE.healthy.durationS);
    expect(PULSE_STYLE.degraded.spacingS).toBeLessThan(PULSE_STYLE.healthy.spacingS);
    expect(PULSE_STYLE.down.color).toBe("#ef4444");
  });

  it("stops down-network pulses at the break and adds sparks there", () => {
    const { container } = renderTray("down");
    const motion = container.querySelector("animateMotion");
    expect(motion?.getAttribute("keyPoints")?.split(";")[1]).toBe(String(SEVER_FRACTION));
    expect(container.querySelectorAll(".animate-spark-flicker").length).toBeGreaterThan(0);
  });

  it("lets healthy pulses run the whole cable and shows no sparks", () => {
    const { container } = renderTray("healthy");
    expect(container.querySelector("animateMotion")?.getAttribute("keyPoints")).toBeNull();
    expect(container.querySelectorAll(".animate-spark-flicker")).toHaveLength(0);
  });

  it("draws no travelling pulses under reduced motion", () => {
    reducedMotion.value = true;
    const { container } = renderTray("down");
    expect(container.querySelectorAll('[data-testid="cable-pulse"]')).toHaveLength(0);
  });
});

describe("emergency lighting and sprites", () => {
  it("projects the beacon's sweep onto the floor as well as the ceiling", () => {
    const { container } = render(
      <svg>
        <AlertBeacon x={2} y={2} />
      </svg>
    );
    expect(container.querySelector('[data-testid="floor-sweep"]')).not.toBeNull();
    expect(container.querySelectorAll(".animate-beacon-sweep").length).toBeGreaterThanOrEqual(3);
  });

  it("only draws the laptop while an engineer is rushing with one", () => {
    const { container, rerender } = render(
      <svg>
        <OfficeWorker x={1} y={1} role="engineer" mood="running" carriesLaptop />
      </svg>
    );
    expect(container.querySelector('[data-testid="worker-laptop"]')).not.toBeNull();
    rerender(
      <svg>
        <OfficeWorker x={1} y={1} role="engineer" mood="running" />
      </svg>
    );
    expect(container.querySelector('[data-testid="worker-laptop"]')).toBeNull();
  });
});

describe("red-alert pace", () => {
  it("runs faster than it walks", () => {
    expect(RUN_SPEED_TILES_PER_S).toBeGreaterThan(WALK_SPEED_TILES_PER_S);
    const from = { x: 0, y: 0 };
    const to = { x: 6, y: 0 };
    expect(hopDurationMs(from, to, RUN_SPEED_TILES_PER_S)).toBeLessThan(hopDurationMs(from, to));
  });

  it("exposes the urgency switch without needing a mounted stage", () => {
    expect(() => setRosterUrgency(true)).not.toThrow();
    expect(rosterChoreographer).toBeDefined();
    setRosterUrgency(false);
  });
});
