import { DayPhase } from "../../utils/officeClock";

interface SkylineBackdropProps {
  dayPhase: DayPhase;
}

interface Building {
  x: number;
  width: number;
  height: number;
  setbackWidth: number;
  setbackHeight: number;
  windowRows: number;
  windowCols: number;
  depth: "near" | "mid" | "far";
}

const VIEW_HEIGHT = 200;

// three depth bands give the skyline real aerial perspective: nearer silhouettes read darker
// and more saturated, farther ones fade toward the pale haze color at the horizon
const DEPTH_TONES: Record<Building["depth"], { fill: string; haze: number }> = {
  near: { fill: "#0f1f38", haze: 0.05 },
  mid: { fill: "#1c3358", haze: 0.28 },
  far: { fill: "#3a5a86", haze: 0.55 },
};

// fixed parallax skyline silhouette, three depth bands, windows lit at dusk/night
const BUILDINGS: Building[] = [
  { x: -10, width: 46, height: 90, setbackWidth: 26, setbackHeight: 24, windowRows: 6, windowCols: 3, depth: "far" },
  { x: 30, width: 56, height: 130, setbackWidth: 32, setbackHeight: 30, windowRows: 8, windowCols: 4, depth: "mid" },
  { x: 80, width: 40, height: 78, setbackWidth: 0, setbackHeight: 0, windowRows: 5, windowCols: 3, depth: "far" },
  { x: 115, width: 64, height: 168, setbackWidth: 34, setbackHeight: 36, windowRows: 10, windowCols: 5, depth: "near" },
  { x: 175, width: 42, height: 100, setbackWidth: 0, setbackHeight: 0, windowRows: 6, windowCols: 3, depth: "mid" },
  { x: 212, width: 58, height: 150, setbackWidth: 30, setbackHeight: 28, windowRows: 9, windowCols: 4, depth: "near" },
  { x: 265, width: 44, height: 84, setbackWidth: 0, setbackHeight: 0, windowRows: 5, windowCols: 3, depth: "far" },
  { x: 300, width: 50, height: 116, setbackWidth: 28, setbackHeight: 26, windowRows: 7, windowCols: 4, depth: "mid" },
];

// GENERATE THE LIT WINDOW GRID FOR ONE BUILDING SLAB, WITH A SOFT GLOW LAYER UNDER EACH PANE.
// tones are deliberately muted (warm white / soft cyan, never a flat saturated yellow) and each
// pane's intensity is nudged by a per-cell pseudo-random factor so the grid doesn't read as a
// wall of identical chapado squares.
function BuildingWindows({
  x,
  top,
  width,
  height,
  rows,
  cols,
  lit,
}: {
  x: number;
  top: number;
  width: number;
  height: number;
  rows: number;
  cols: number;
  lit: boolean;
}) {
  const cellW = width / (cols + 1);
  const cellH = height / (rows + 1);
  const windows = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      // deterministic pseudo-random skip so not every window is lit at once
      if ((row * 7 + col * 13) % 5 === 0) continue;
      const wx = x + cellW * (col + 1);
      const wy = top + cellH * (row + 1);
      const color = (row + col) % 3 === 0 ? "#7dd3fc" : "#fef08a";
      const intensity = 0.55 + ((row * 3 + col * 5) % 4) * 0.12;
      windows.push(
        <g key={`${row}-${col}`} style={{ transition: "opacity 4s linear" }} opacity={lit ? 1 : 0}>
          <circle cx={wx} cy={wy} r={3.2} fill={color} opacity={0.2 + intensity * 0.15} filter="url(#skylineWindowGlow)" />
          <rect x={wx - 1.4} y={wy - 1.8} width={2.8} height={3.6} rx={0.4} fill={color} opacity={intensity} />
        </g>
      );
    }
  }
  return <>{windows}</>;
}

// ONE BUILDING SILHOUETTE: A MAIN SLAB PLUS AN OPTIONAL NARROWER SETBACK TOWER ON TOP
function BuildingSilhouette({ building, lit }: { building: Building; lit: boolean }) {
  const tone = DEPTH_TONES[building.depth];
  const baseTop = VIEW_HEIGHT - building.height;
  const setbackTop = baseTop - building.setbackHeight;
  const setbackX = building.x + (building.width - building.setbackWidth) / 2;

  return (
    <g>
      <rect x={building.x} y={baseTop} width={building.width} height={building.height} fill={tone.fill} />
      {building.setbackWidth > 0 && (
        <rect x={setbackX} y={setbackTop} width={building.setbackWidth} height={building.setbackHeight} fill={tone.fill} />
      )}
      {/* rooftop antenna/mechanical unit, a light silhouette accent so the skyline is not just flat-topped boxes */}
      {building.setbackWidth > 0 && (
        <line
          x1={setbackX + building.setbackWidth / 2}
          y1={setbackTop}
          x2={setbackX + building.setbackWidth / 2}
          y2={setbackTop - 10}
          stroke={tone.fill}
          strokeWidth={1.4}
        />
      )}
      {/* aviation warning beacon atop the tallest towers, blinking red as a small skyline accent */}
      {building.setbackWidth > 0 && building.depth === "near" && (
        <circle cx={setbackX + building.setbackWidth / 2} cy={setbackTop - 10} r={1.2} fill="#f87171" className="animate-pulse" />
      )}
      <BuildingWindows
        x={building.x}
        top={baseTop}
        width={building.width}
        height={building.height}
        rows={building.windowRows}
        cols={building.windowCols}
        lit={lit}
      />
      {building.setbackWidth > 0 && (
        <BuildingWindows
          x={setbackX}
          top={setbackTop}
          width={building.setbackWidth}
          height={building.setbackHeight}
          rows={Math.max(2, Math.round(building.windowRows * 0.4))}
          cols={Math.max(2, Math.round(building.windowCols * 0.6))}
          lit={lit}
        />
      )}
      {/* aerial-perspective haze veil, thicker over farther/shorter buildings to push them back visually */}
      <rect x={building.x} y={baseTop} width={building.width} height={building.height} fill="#c7dcf5" opacity={tone.haze} />
    </g>
  );
}

// atmospheric parallax skyline sitting behind the isometric svg canvas, seen through the office windows
export default function SkylineBackdrop({ dayPhase }: SkylineBackdropProps) {
  const lit = dayPhase === "night" || dayPhase === "dusk";
  // the deep navy/black backdrop reads fully at night and dusk; during the day it stays a faint
  // vignette so the CSS daylight gradient behind this layer still shows through
  const deepSkyOpacity = lit ? 1 : 0.22;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      <svg viewBox="0 0 340 200" preserveAspectRatio="xMidYMax slice" className="w-full h-full">
        <defs>
          <linearGradient id="skylineAirGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#bfdbfe" stopOpacity={0.5} />
            <stop offset="65%" stopColor="#dbeafe" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#f8fafc" stopOpacity={0} />
          </linearGradient>
          {/* deep atmospheric backdrop behind every building silhouette, near-black at the top
              fading to a lighter navy at the horizon -- gives the skyline real depth instead of
              sitting on a flat, pale wash */}
          <linearGradient id="skylineDeepGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#030712" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>
          {/* volumetric ground-hugging fog band where the skyline meets the office floor */}
          <linearGradient id="skylineHorizonHaze" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgba(15,23,42,0.85)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0)" />
          </linearGradient>
          <filter id="skylineWindowGlow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>

        <rect
          x={0}
          y={0}
          width={340}
          height={200}
          fill="url(#skylineDeepGradient)"
          opacity={deepSkyOpacity}
          style={{ transition: "opacity 4s linear" }}
        />

        {/* far-to-near paint order for correct overlap between depth bands */}
        {BUILDINGS.map((b, i) => (
          <BuildingSilhouette key={i} building={b} lit={lit} />
        ))}

        {/* soft aerial haze wash over the whole skyline, strongest near the rooftops fading to the horizon */}
        <rect x={0} y={0} width={340} height={200} fill="url(#skylineAirGradient)" />

        {/* horizon fog band grounding the skyline into the scene instead of a hard silhouette cutoff */}
        <rect x={0} y={140} width={340} height={60} fill="url(#skylineHorizonHaze)" />
      </svg>
    </div>
  );
}
