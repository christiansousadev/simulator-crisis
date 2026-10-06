import { memo, useMemo } from "react";
import { useGameStore } from "../../store/useGameStore";
import { usePresenceFlag } from "../../hooks/usePresence";
import type { Service } from "../../types/game";
import { defconLightingTier, selectDefconLevel } from "../../utils/defcon";
import { AlertBeacon, floorWallPath, type FloorBounds } from "./EmergencyFx";
import { FloorLightPool, type PoolTone } from "./FloorDecals";
import { project } from "./isoMath";
import { useLightScope } from "./lightingBus";
import {
  BOARDROOM_ORIGIN,
  ENGINEERING_ORIGIN,
  FLOOR,
  SERVER_ROOM_ORIGIN,
  SERVER_ROOM_SIZE,
  WALL_HEIGHT,
  deskGridPosition,
} from "./sceneLayout";
import { rackGridPosition } from "./ServerRoom";

// THE LIGHTING LAYERS OF THE OFFICE. Three pieces, all driven by css variables that
// LightingDriver eases on rAF (see lighting.ts), so none of this re-renders on a lighting change:
//  - FloorPools: lamp / server / alert pools, drawn on the floor beneath the props
//  - AmbientLightOverlay: night, dusk and red-alert darkness over floor and walls
//  - EmissiveLayer: drawn AFTER the overlay so monitors, rack LEDs and beacons cut through the dark

const POOL_FADE_ALERT = "(1 - var(--alert-dark))";
const LAMP_OPACITY = "calc((0.15 + var(--night) * 0.3) * var(--lights))";

export const FloorPools = memo(function FloorPools() {
  const scope = useLightScope();
  const cx = SERVER_ROOM_ORIGIN.x + SERVER_ROOM_SIZE.width / 2;
  const cy = SERVER_ROOM_ORIGIN.y + SERVER_ROOM_SIZE.depth / 2;
  const lamps: Array<[number, number]> = [
    [10.4, 1.2],
    [12.9, 1.2],
    [15.4, 1.2],
    [11.6, 3.8],
    [14.1, 3.8],
  ];
  return (
    <g ref={scope}>
      {/* server neon glow, swapped for an amber pool at DEFCON 4/3 and a pulsing red one in a red alert */}
      <FloorLightPool x={cx} y={cy} tone="cyan" radiusX={115} radiusY={58} opacity={`calc((0.16 + var(--night) * 0.12) * var(--lights) * ${POOL_FADE_ALERT})`} />
      <FloorLightPool x={cx} y={cy} tone="amber" radiusX={125} radiusY={62} opacity={`calc(var(--pool) * 0.26 * ${POOL_FADE_ALERT})`} />
      <FloorLightPool x={cx} y={cy} tone="red" radiusX={125} radiusY={62} opacity="calc(var(--alert-dark) * 0.34)" pulse />
      {/* warm lamp pools across the engineering workstations */}
      {lamps.map(([x, y]) => (
        <FloorLightPool key={`${x}-${y}`} x={x} y={y} tone="warm" radiusX={36} radiusY={18} opacity={LAMP_OPACITY} />
      ))}
      {/* boardroom screen glow */}
      <FloorLightPool x={2.5} y={10.2} tone="blue" radiusX={48} radiusY={24} opacity="calc((0.14 + var(--night) * 0.26) * var(--lights))" />
    </g>
  );
});

interface AmbientLightOverlayProps {
  bounds: FloorBounds;
  wallHeight: number;
}

// SMOOTHED NIGHT / DUSK / RED-ALERT DARKNESS OVER THE FLOOR AND WALLS. Replaces the old scene-wide
// feColorMatrix filter (a full offscreen pass over the whole scene, re-run on every repaint) with
// plain translucent polygons.
export const AmbientLightOverlay = memo(function AmbientLightOverlay({ bounds, wallHeight }: AmbientLightOverlayProps) {
  const scope = useLightScope();
  const d = useMemo(() => floorWallPath(bounds, wallHeight), [bounds, wallHeight]);
  return (
    <g ref={scope} style={{ pointerEvents: "none" }}>
      <path d={d} fill="#0a1226" style={{ opacity: "calc(var(--night) * 0.6)" }} />
      <path d={d} fill="#fb923c" style={{ opacity: "calc(var(--twilight) * 0.13)" }} />
      {/* emergency power: near-black wash, plus the dimmed normal lights while they are out */}
      <path d={d} fill="#020617" style={{ opacity: "calc(var(--alert-dark) * 0.38 + (1 - var(--lights)) * 0.2)" }} />
      <g style={{ opacity: "calc(var(--alert-dark) * 0.5)" }}>
        <path d={d} fill="#7f1d1d" opacity={0.2} className="animate-glow-pulse" />
      </g>
    </g>
  );
});

const GLOW_TONE: Record<Service["status"], PoolTone> = {
  healthy: "cyan",
  degraded: "amber",
  down: "red",
};

function useServiceStatusList(): Array<{ id: string; status: Service["status"] }> {
  // a string signature keeps the selector primitive, so the glows only re-render on a real change
  const signature = useGameStore((s) => s.telemetry.services.map((sv) => `${sv.id}:${sv.status}`).join("|"));
  return useMemo(
    () =>
      signature
        .split("|")
        .filter(Boolean)
        .map((entry) => {
          const [id, status] = entry.split(":");
          return { id, status: status as Service["status"] };
        }),
    [signature]
  );
}

function RackAndDeskGlows() {
  const list = useServiceStatusList();
  const ids = list.map((s) => s.id);
  const asServices = ids.map((id) => ({ id })) as Service[];
  return (
    <>
      {list.map(({ id, status }) => {
        const rack = rackGridPosition(id, asServices, SERVER_ROOM_ORIGIN.x, SERVER_ROOM_ORIGIN.y);
        const desk = deskGridPosition(id, ids);
        const rackPt = rack ? project(rack.x + 0.35, rack.y + 0.3, 0.9) : null;
        const deskPt = desk ? project(desk.x, desk.y, 0.8) : null;
        const strength = status === "healthy" ? 0.45 : 0.75;
        return (
          <g key={id}>
            {rackPt && (
              <ellipse
                cx={rackPt.x}
                cy={rackPt.y}
                rx={17}
                ry={26}
                fill={`url(#lightPool-${GLOW_TONE[status]})`}
                style={{ opacity: `calc(var(--emit) * ${strength})` }}
              />
            )}
            {deskPt && (
              <ellipse cx={deskPt.x} cy={deskPt.y} rx={15} ry={10} fill="url(#lightPool-blue)" style={{ opacity: "calc(var(--emit) * 0.5)" }} />
            )}
          </g>
        );
      })}
    </>
  );
}

const BEACON_SPOTS = [
  { x: SERVER_ROOM_ORIGIN.x + 0.1, y: SERVER_ROOM_ORIGIN.y - 0.05 },
  { x: ENGINEERING_ORIGIN.x + 2.5, y: ENGINEERING_ORIGIN.y + 1.0 },
  { x: BOARDROOM_ORIGIN.x + 1.6, y: BOARDROOM_ORIGIN.y + 0.9 },
];

// LIGHTS THAT STAY ON IN THE DARK: rack LEDs and desk monitors, plus the DEFCON beacon rig
export const EmissiveLayer = memo(function EmissiveLayer() {
  const scope = useLightScope();
  const level = useGameStore(selectDefconLevel);
  const tier = defconLightingTier(level);
  const wanted = tier === "alert" || tier === "warning";
  // keep the rig mounted just long enough for the 500ms fade-out of the staged exit
  const { mounted } = usePresenceFlag(wanted, 700);
  return (
    <g ref={scope} style={{ pointerEvents: "none" }}>
      <RackAndDeskGlows />
      {mounted && BEACON_SPOTS.map((spot) => <AlertBeacon key={`${spot.x}-${spot.y}`} x={spot.x} y={spot.y} />)}
    </g>
  );
});

export const LIGHTING_BOUNDS: FloorBounds = FLOOR;
export const LIGHTING_WALL_HEIGHT = WALL_HEIGHT;
