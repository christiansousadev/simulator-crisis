import { memo } from "react";
import IsoBox from "./IsoBox";
import { project } from "./isoMath";

interface PerimeterWallsProps {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  height?: number;
}

const WALL_COLOR = "#334155";
const WINDOW_COLOR = "#0f2942";
const BASEBOARD_COLOR = "#1e293b";
const THICKNESS = 0.06;
const BUILDING_COUNT = 9;
const BUILDING_PALETTE = ["#1e3a5f", "#25476f", "#2c5282", "#173352"];

interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
}

function footprint(axis: "x" | "y", fixed: number, from: number, to: number): Footprint {
  return axis === "x" ? { x: from, y: fixed, w: to - from, d: THICKNESS } : { x: fixed, y: from, w: THICKNESS, d: to - from };
}

interface WindowMullionsProps {
  axis: "x" | "y";
  fixed: number;
  from: number;
  to: number;
  z0: number;
  z1: number;
}

// VERTICAL MULLIONS AND A HORIZONTAL TRANSOM OVERLAID ON THE GLAZING, READING AS REAL WINDOW PANES
function WindowMullions({ axis, fixed, from, to, z0, z1 }: WindowMullionsProps) {
  const centerOffset = THICKNESS / 2;
  const paneAt = (along: number, z: number) =>
    axis === "x" ? project(along, fixed + centerOffset, z) : project(fixed + centerOffset, along, z);

  const paneCount = Math.max(3, Math.round((to - from) / 1.15));
  const stroke = "rgba(15,23,42,0.55)";

  const verticals = [];
  for (let i = 0; i <= paneCount; i++) {
    const along = from + ((to - from) * i) / paneCount;
    const top = paneAt(along, z1);
    const bottom = paneAt(along, z0);
    verticals.push(<line key={`v${i}`} x1={top.x} y1={top.y} x2={bottom.x} y2={bottom.y} stroke={stroke} strokeWidth={1} />);
  }

  // one transom roughly two-fifths of the way up, breaking the ribbon into upper and lower lites
  const transomZ = z0 + (z1 - z0) * 0.42;
  const left = paneAt(from, transomZ);
  const right = paneAt(to, transomZ);

  return (
    <g style={{ pointerEvents: "none" }}>
      {verticals}
      <line x1={left.x} y1={left.y} x2={right.x} y2={right.y} stroke={stroke} strokeWidth={1.3} />
    </g>
  );
}

interface WallRunProps {
  axis: "x" | "y";
  fixed: number;
  from: number;
  to: number;
  height: number;
}

// ONE TALL BACK WALL WITH A PANORAMIC RIBBON WINDOW, A BASEBOARD AND A DISTANT SKYLINE
function WallRun({ axis, fixed, from, to, height }: WallRunProps) {
  const fp = footprint(axis, fixed, from, to);
  // panoramic ribbon glazing spans nearly the full height, leaving only a thin sill and header
  const windowZ0 = height * 0.06;
  const windowZ1 = height * 0.96;

  const buildings = Array.from({ length: BUILDING_COUNT }).map((_, i) => {
    const t = (i + 0.5) / BUILDING_COUNT;
    const along = from + (to - from) * t;
    const p = axis === "x" ? project(along, fixed + THICKNESS / 2, windowZ0) : project(fixed + THICKNESS / 2, along, windowZ0);
    const h = 6 + ((i * 37) % 15);
    const w = 5 + ((i * 19) % 5);
    return { x: p.x, y: p.y, h, w, color: BUILDING_PALETTE[i % BUILDING_PALETTE.length] };
  });

  // ambient occlusion contact shadow where the wall meets the floor
  const shadowA = axis === "x" ? project(from, fixed, 0.021) : project(fixed, from, 0.021);
  const shadowB = axis === "x" ? project(to, fixed, 0.021) : project(fixed, to, 0.021);

  return (
    <g>
      <IsoBox x={fp.x} y={fp.y} z={0} w={fp.w} d={fp.d} h={height} color={WALL_COLOR} topFactor={1.15} rightFactor={0.9} leftFactor={0.65} />

      <IsoBox
        x={fp.x}
        y={fp.y}
        z={windowZ0}
        w={fp.w}
        d={fp.d}
        h={windowZ1 - windowZ0}
        color={WINDOW_COLOR}
        topFactor={1.4}
        rightFactor={1.1}
        leftFactor={0.85}
        opacity={0.94}
      />
      {buildings.map((b, i) => (
        <rect key={i} x={b.x - b.w / 2} y={b.y - b.h} width={b.w} height={b.h} fill={b.color} opacity={0.8} />
      ))}

      {/* window frame: mullions and a transom so the glazing reads as panes, not an empty void */}
      <WindowMullions axis={axis} fixed={fixed} from={from} to={to} z0={windowZ0} z1={windowZ1} />

      {/* baseboard trim along the floor line */}
      <IsoBox x={fp.x} y={fp.y} z={0} w={fp.w} d={fp.d} h={0.1} color={BASEBOARD_COLOR} topFactor={1.05} />

      {/* soft contact shadow cast by the wall onto the adjoining floor */}
      <line x1={shadowA.x} y1={shadowA.y} x2={shadowB.x} y2={shadowB.y} stroke="rgba(15,23,42,0.18)" strokeWidth={10} />
    </g>
  );
}

// L-SHAPED PERIMETER BACK WALLS WITH PANORAMIC DAYLIGHT WINDOWS, FRAMING THE OFFICE FLOOR
// night is handled by the ambient light overlay, not by re-tinting the glazing here
function PerimeterWalls({ minX, minY, maxX, maxY, height = 2.8 }: PerimeterWallsProps) {
  return (
    <g>
      <WallRun axis="x" fixed={minY} from={minX} to={maxX} height={height} />
      <WallRun axis="y" fixed={minX} from={minY} to={maxY} height={height} />
    </g>
  );
}

export default memo(PerimeterWalls);
