import { memo } from "react";
import { project } from "./isoMath";

export interface FloorBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// OUTLINE OF THE FLOOR PLUS THE TWO BACK WALLS AS ONE POLYGON, THE SURFACE THE AMBIENT LIGHT
// OVERLAY COVERS. Same four floor corners the old red-alert vignette used, with the wall tops
// added so the glazed walls darken together with the floor instead of glowing above it.
export function floorWallPath({ minX, minY, maxX, maxY }: FloorBounds, wallHeight: number): string {
  const pts = [
    project(minX, maxY, wallHeight),
    project(minX, minY, wallHeight),
    project(maxX, minY, wallHeight),
    project(maxX, minY, 0),
    project(maxX, maxY, 0),
    project(minX, maxY, 0),
  ];
  return `M ${pts.map((p) => `${p.x},${p.y}`).join(" L ")} Z`;
}

interface BeaconProps {
  x: number;
  y: number;
  z?: number;
}

// CEILING-MOUNTED EMERGENCY BEACON WITH A ROTATING SWEEP. It reads the lighting variables of the
// nearest light scope: at DEFCON 3 a slow amber sweep, at DEFCON 2 and worse a fast red one, scaled
// in by --beacons during the staged red-alert entrance. Nothing here re-renders on a lighting
// change; the beacon is simply mounted while the DEFCON level asks for it.
export const AlertBeacon = memo(function AlertBeacon({ x, y, z = 1.95 }: BeaconProps) {
  const p = project(x, y, z);
  const origin = `${p.x}px ${p.y}px`;
  const cone = `M ${p.x},${p.y} L ${p.x - 34},${p.y - 6} A 36 36 0 0 1 ${p.x - 24},${p.y - 26} Z`;
  return (
    <g style={{ transformOrigin: origin, transform: "scale(max(var(--beacons), var(--amber)))", pointerEvents: "none" }}>
      {/* amber warning sweep, DEFCON 3 */}
      <g style={{ opacity: "var(--amber)" }}>
        <g style={{ transformOrigin: origin, animationDuration: "6s" }} className="animate-beacon-sweep">
          <path d={cone} fill="#f59e0b" opacity={0.2} />
        </g>
        <circle cx={p.x} cy={p.y} r={11} fill="url(#lightPool-amber)" opacity={0.55} className="animate-glow-pulse" />
        <circle cx={p.x} cy={p.y} r={3.4} fill="#f59e0b" />
      </g>
      {/* red alert sweep, DEFCON 2 and worse, starting once the beacons have scaled in */}
      <g style={{ opacity: "var(--sweep)" }}>
        <g style={{ transformOrigin: origin, animationDuration: "1.1s" }} className="animate-beacon-sweep">
          <path d={cone} fill="#ef4444" opacity={0.26} />
        </g>
        <circle cx={p.x} cy={p.y} r={13} fill="url(#lightPool-red)" opacity={0.6} />
      </g>
      <g style={{ opacity: "var(--beacons)" }}>
        <circle cx={p.x} cy={p.y} r={5.5} fill="#7f1d1d" />
        <circle cx={p.x} cy={p.y} r={4} fill="#ef4444" className="animate-beacon-flash" />
      </g>
    </g>
  );
});
