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

// 3D ARCHITECTURAL ISOMETRIC FLOOR SIGNAGE WITH TACTICAL ACCENTS
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
    <g transform={transform} style={{ pointerEvents: "none", userSelect: "none" }}>
      {/* Tactical bracket pip */}
      <circle cx={-5} cy={-2.5} r={1.2} fill={color} opacity={0.8} />
      <text
        x={0}
        y={0}
        fill={color}
        style={{
          fontSize: "8.5px",
          fontFamily: "'Rajdhani', monospace, sans-serif",
          fontWeight: 800,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          opacity: 0.75,
        }}
      >
        {text}
      </text>
      {/* Accent underline */}
      <line x1={0} y1={2.5} x2={text.length * 5.5} y2={2.5} stroke={color} strokeWidth={0.6} opacity={0.4} strokeDasharray="3 2" />
    </g>
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

// Reusable radial and linear shader gradients, shared by every light pool, rack face, glass sheen, and holographic HUD
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

      {/* High-tech brushed metallic chassis gradients */}
      <linearGradient id="metallicRackFace" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#2a374a" />
        <stop offset="50%" stopColor="#182334" />
        <stop offset="100%" stopColor="#0c1322" />
      </linearGradient>

      <linearGradient id="metallicRackTop" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#3d4f66" />
        <stop offset="50%" stopColor="#293749" />
        <stop offset="100%" stopColor="#1e293b" />
      </linearGradient>

      {/* Tinted tempered glass specular diagonal sheen */}
      <linearGradient id="rackGlassSheen" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.28)" />
        <stop offset="25%" stopColor="rgba(56,189,248,0.12)" />
        <stop offset="50%" stopColor="rgba(255,255,255,0)" />
        <stop offset="75%" stopColor="rgba(56,189,248,0.1)" />
        <stop offset="100%" stopColor="rgba(255,255,255,0.05)" />
      </linearGradient>

      {/* Individual blade server unit tray face */}
      <linearGradient id="bladeTrayFace" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#283548" />
        <stop offset="35%" stopColor="#16202e" />
        <stop offset="100%" stopColor="#0c121d" />
      </linearGradient>

      {/* Chrome blade ejection handles */}
      <linearGradient id="bladeHandle" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#94a3b8" />
        <stop offset="50%" stopColor="#cbd5e1" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>

      {/* Holographic HUD rings */}
      <radialGradient id="hologramHudCyan" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.8} />
        <stop offset="70%" stopColor="#0284c7" stopOpacity={0.3} />
        <stop offset="100%" stopColor="#0369a1" stopOpacity={0} />
      </radialGradient>

      <radialGradient id="hologramHudRed" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
        <stop offset="65%" stopColor="#b91c1c" stopOpacity={0.35} />
        <stop offset="100%" stopColor="#7f1d1d" stopOpacity={0} />
      </radialGradient>

      {/* Emerald laser scanline gradient */}
      <linearGradient id="laserScanGradient" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stopColor="rgba(16,185,129,0)" />
        <stop offset="50%" stopColor="rgba(52,211,153,0.3)" />
        <stop offset="90%" stopColor="rgba(110,231,183,0.9)" />
        <stop offset="100%" stopColor="#ffffff" />
      </linearGradient>

      {/* Fiber optic patch lead glow */}
      <linearGradient id="fiberGlowCyan" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38bdf8" />
        <stop offset="50%" stopColor="#00f0ff" />
        <stop offset="100%" stopColor="#0284c7" />
      </linearGradient>

      {/* Chrome reflection gradient for espresso machines and chair cylinders */}
      <linearGradient id="chromeMetal" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f1f5f9" />
        <stop offset="25%" stopColor="#94a3b8" />
        <stop offset="50%" stopColor="#f8fafc" />
        <stop offset="75%" stopColor="#64748b" />
        <stop offset="100%" stopColor="#cbd5e1" />
      </linearGradient>

      {/* Modern dark carbon / slate workstation surface */}
      <linearGradient id="carbonDeskFace" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="50%" stopColor="#151e2e" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>

      <linearGradient id="carbonDeskTop" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#334155" />
        <stop offset="60%" stopColor="#243142" />
        <stop offset="100%" stopColor="#1e293b" />
      </linearGradient>

      {/* Boardroom tempered executive glass */}
      <linearGradient id="boardroomGlassTop" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="rgba(56,189,248,0.35)" />
        <stop offset="40%" stopColor="rgba(15,23,42,0.85)" />
        <stop offset="70%" stopColor="rgba(14,165,233,0.25)" />
        <stop offset="100%" stopColor="rgba(15,23,42,0.92)" />
      </linearGradient>

      {/* Botanical lush foliage gradients */}
      <linearGradient id="foliageDark" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#15803d" />
        <stop offset="100%" stopColor="#052e16" />
      </linearGradient>

      <linearGradient id="foliageLight" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#4ade80" />
        <stop offset="60%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#16a34a" />
      </linearGradient>
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
