import { memo } from "react";
import IsoBox from "./IsoBox";
import { project, shade } from "./isoMath";

interface ZoneBounds {
  originX: number;
  originY: number;
  width: number;
  depth: number;
}

// flat quad on the floor as an svg path segment (the raised tiles are only 0.02 tall, so drawing
// just the top face loses nothing visible but turns hundreds of boxes into a couple of paths)
function quad(x: number, y: number, z: number, w: number, d: number): string {
  const a = project(x, y, z);
  const b = project(x + w, y, z);
  const c = project(x + w, y + d, z);
  const e = project(x, y + d, z);
  return `M${a.x},${a.y}L${b.x},${b.y}L${c.x},${c.y}L${e.x},${e.y}Z`;
}

interface TileFieldProps extends ZoneBounds {
  tileSize: number;
  z: number;
  colorA: string;
  colorB: string;
  stroke: string;
}

// CHECKERBOARD OF FLAT TILES DRAWN AS TWO PATHS, ONE PER COLOR
function TileField({ originX, originY, width, depth, tileSize, z, colorA, colorB, stroke }: TileFieldProps) {
  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(depth / tileSize);
  let dA = "";
  let dB = "";
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const q = quad(originX + c * tileSize, originY + r * tileSize, z, tileSize, tileSize);
      if ((r + c) % 2 === 0) dA += q;
      else dB += q;
    }
  }
  return (
    <g>
      <path d={dA} fill={shade(colorA, 1.18)} stroke={stroke} strokeWidth={0.6} />
      <path d={dB} fill={shade(colorB, 1.18)} stroke={stroke} strokeWidth={0.6} />
    </g>
  );
}

// RAISED ANTI-STATIC TECHNICAL TILE GRID FOR THE SERVER ROOM FLOOR
export const ServerRoomTiles = memo(function ServerRoomTiles(props: ZoneBounds) {
  return <TileField {...props} tileSize={0.5} z={0.042} colorA="#cbd5e1" colorB="#b6c2d1" stroke="rgba(71,85,105,0.25)" />;
});

interface HazardStripeProps {
  axis: "x" | "y";
  fixed: number;
  from: number;
  to: number;
}

// ONE YELLOW/BLACK HAZARD STRIPE RUN, DRAWN AS TWO FLAT PATHS
export function HazardStripe({ axis, fixed, from, to }: HazardStripeProps) {
  const stripeSize = 0.14;
  const count = Math.ceil((to - from) / stripeSize);
  let yellow = "";
  let black = "";
  for (let i = 0; i < count; i++) {
    const along = from + i * stripeSize;
    const q = axis === "x" ? quad(along, fixed, 0.026, stripeSize, 0.12) : quad(fixed, along, 0.026, 0.12, stripeSize);
    if (i % 2 === 0) yellow += q;
    else black += q;
  }
  return (
    <g>
      <path d={yellow} fill={shade("#facc15", 1)} />
      <path d={black} fill={shade("#18181b", 1)} />
    </g>
  );
}

// FULL YELLOW/BLACK HAZARD BORDER RUNNING AROUND THE SERVER ROOM SECURITY PERIMETER
export const HazardBorder = memo(function HazardBorder({ originX, originY, width, depth }: ZoneBounds) {
  return (
    <g>
      <HazardStripe axis="x" fixed={originY} from={originX} to={originX + width} />
      <HazardStripe axis="x" fixed={originY + depth} from={originX} to={originX + width} />
      <HazardStripe axis="y" fixed={originX} from={originY} to={originY + depth} />
      <HazardStripe axis="y" fixed={originX + width} from={originY} to={originY + depth} />
    </g>
  );
});

// DEEP NAVY EXECUTIVE CARPET WITH A WOVEN LIGHTER BORDER BAND
export const BoardroomRug = memo(function BoardroomRug({ originX, originY, width, depth }: ZoneBounds) {
  const border = 0.16;
  return (
    <g>
      <IsoBox x={originX} y={originY} z={0.021} w={width} d={depth} h={0.014} color="#2b3548" topFactor={1.15} stroke="rgba(0,0,0,0.3)" />
      <IsoBox
        x={originX + border}
        y={originY + border}
        z={0.023}
        w={width - border * 2}
        d={depth - border * 2}
        h={0.014}
        color="#1a2233"
        topFactor={1.05}
        stroke="rgba(0,0,0,0.2)"
      />
    </g>
  );
});

// CHECKERED TERRAZZO-STYLE TILE FLOOR FOR THE BREAKROOM LOUNGE
export const BreakroomTiles = memo(function BreakroomTiles(props: ZoneBounds) {
  return <TileField {...props} tileSize={0.55} z={0.037} colorA="#fdf6e8" colorB="#c9ad84" stroke="rgba(120,90,50,0.25)" />;
});

// WOVEN ENTRANCE MAT MARKING THE RECEPTION LOUNGE THRESHOLD
export const EntranceMat = memo(function EntranceMat({ originX, originY, width, depth }: ZoneBounds) {
  return (
    <g>
      <IsoBox x={originX} y={originY} z={0.021} w={width} d={depth} h={0.012} color="#334155" topFactor={1.1} />
      <IsoBox
        x={originX + 0.1}
        y={originY + 0.1}
        z={0.023}
        w={width - 0.2}
        d={depth - 0.2}
        h={0.012}
        color="#475569"
        topFactor={1.1}
      />
    </g>
  );
});

// SUBTLE DIRECTIONAL GUIDE LINE MARKING A WALKWAY BETWEEN TWO ZONES
export const WalkwayGuide = memo(function WalkwayGuide({ axis, fixed, from, to }: HazardStripeProps) {
  const footprint =
    axis === "x" ? { x: from, y: fixed, w: to - from, d: 0.05 } : { x: fixed, y: from, w: 0.05, d: to - from };
  return <IsoBox x={footprint.x} y={footprint.y} z={0.023} w={footprint.w} d={footprint.d} h={0.001} color="#94a3b8" stroke="none" opacity={0.35} />;
});

// 3D ARCHITECTURAL ISOMETRIC FLOOR SIGNAGE
export const FloorSignage = memo(function FloorSignage({
  x,
  y,
  text,
  color = "#64748b",
  axis = "x",
}: {
  x: number;
  y: number;
  text: string;
  color?: string;
  axis?: "x" | "y";
}) {
  const p = project(x, y, 0.025);
  const transform =
    axis === "x"
      ? `translate(${p.x}, ${p.y}) rotate(26.565) skewX(-30)`
      : `translate(${p.x}, ${p.y}) rotate(-26.565) skewX(30)`;
  return (
    <text
      transform={transform}
      fill={color}
      style={{
        fontSize: "8.5px",
        fontFamily: "'Rajdhani', monospace, sans-serif",
        fontWeight: 800,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        opacity: 0.65,
        userSelect: "none",
        pointerEvents: "none",
      }}
    >
      {text}
    </text>
  );
});

export type PoolTone = "cyan" | "red" | "amber" | "warm" | "blue";

const POOL_COLORS: Record<PoolTone, string> = {
  cyan: "#06b6d4",
  red: "#ef4444",
  amber: "#f59e0b",
  warm: "#fef3c7",
  blue: "#60a5fa",
};

// one radial gradient per tone, shared by every light pool and glow; replaces the old per-pool
// blur() filter, which forced an offscreen blur pass for each ellipse on every repaint
export const LightGradients = memo(function LightGradients() {
  return (
    <>
      {(Object.keys(POOL_COLORS) as PoolTone[]).map((tone) => (
        <radialGradient key={tone} id={`lightPool-${tone}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={POOL_COLORS[tone]} stopOpacity={0.95} />
          <stop offset="55%" stopColor={POOL_COLORS[tone]} stopOpacity={0.45} />
          <stop offset="100%" stopColor={POOL_COLORS[tone]} stopOpacity={0} />
        </radialGradient>
      ))}
    </>
  );
});

// DYNAMIC FLOOR LIGHT POOL CAST BY SERVERS OR DESK LAMPS. `opacity` is any css opacity value, so
// callers can pass a calc() over the lighting variables and the pool follows day/night and DEFCON
// with no React render (the nearest light scope supplies --night, --alert-dark and friends).
export const FloorLightPool = memo(function FloorLightPool({
  x,
  y,
  z = 0.023,
  tone = "cyan",
  radiusX = 45,
  radiusY = 22,
  opacity = 0.2,
  pulse = false,
}: {
  x: number;
  y: number;
  z?: number;
  tone?: PoolTone;
  radiusX?: number;
  radiusY?: number;
  opacity?: number | string;
  pulse?: boolean;
}) {
  const p = project(x, y, z);
  return (
    <g style={{ opacity, pointerEvents: "none" }}>
      <ellipse
        cx={p.x}
        cy={p.y}
        rx={radiusX}
        ry={radiusY}
        fill={`url(#lightPool-${tone})`}
        className={pulse ? "animate-glow-pulse" : undefined}
      />
    </g>
  );
});
