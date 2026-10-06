import { memo, useCallback } from "react";
import { useLightScope } from "./lightingBus";

interface SkylineBackdropProps {
  // receives the wrapper element so the camera can slide it for parallax (translate only)
  onElement?: (el: HTMLDivElement | null) => void;
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
}: {
  x: number;
  top: number;
  width: number;
  height: number;
  rows: number;
  cols: number;
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
        <g key={`${row}-${col}`}>
          <circle cx={wx} cy={wy} r={4} fill={color === "#7dd3fc" ? "url(#skylineGlowCool)" : "url(#skylineGlowWarm)"} opacity={0.35 + intensity * 0.2} />
          <rect x={wx - 1.4} y={wy - 1.8} width={2.8} height={3.6} rx={0.4} fill={color} opacity={intensity} />
        </g>
      );
    }
  }
  // one group per slab, faded as a unit by the night intensity (windows come on as the sun goes)
  return <g style={{ opacity: "clamp(0, calc((var(--night) - 0.3) * 2.2), 1)" }}>{windows}</g>;
}

// ONE BUILDING SILHOUETTE: A MAIN SLAB PLUS AN OPTIONAL NARROWER SETBACK TOWER ON TOP
function BuildingSilhouette({ building }: { building: Building }) {
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
      />
      {building.setbackWidth > 0 && (
        <BuildingWindows
          x={setbackX}
          top={setbackTop}
          width={building.setbackWidth}
          height={building.setbackHeight}
          rows={Math.max(2, Math.round(building.windowRows * 0.4))}
          cols={Math.max(2, Math.round(building.windowCols * 0.6))}
        />
      )}
      {/* aerial-perspective haze veil, thicker over farther/shorter buildings to push them back visually */}
      <rect x={building.x} y={baseTop} width={building.width} height={building.height} fill="#c7dcf5" opacity={tone.haze} />
    </g>
  );
}

// atmospheric parallax skyline sitting behind the isometric svg canvas, seen through the office
// windows. Fully static: the sky darkness and the lit windows follow --night from the light scope
// on the wrapper, so nothing here re-renders as the hours pass.
function SkylineBackdrop({ onElement }: SkylineBackdropProps) {
  const scope = useLightScope();
  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      scope(el);
      onElement?.(el);
    },
    [scope, onElement]
  );

  return (
    // inset by a few percent so the parallax slide never reveals an edge
    <div ref={setRef} className="absolute pointer-events-none overflow-hidden" style={{ zIndex: 0, inset: "-4%" }} aria-hidden="true">
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
          {/* window glow as radial gradients: a blur filter on ~200 panes was the costliest thing here */}
          <radialGradient id="skylineGlowWarm">
            <stop offset="0%" stopColor="#fef08a" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#fef08a" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="skylineGlowCool">
            <stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.9} />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity={0} />
          </radialGradient>
        </defs>

        <rect x={0} y={0} width={340} height={200} fill="url(#skylineDeepGradient)" style={{ opacity: "calc(0.22 + 0.78 * var(--night))" }} />

        {/* far-to-near paint order for correct overlap between depth bands */}
        {BUILDINGS.map((b, i) => (
          <BuildingSilhouette key={i} building={b} />
        ))}

        {/* soft aerial haze wash over the whole skyline, strongest near the rooftops fading to the horizon */}
        <rect x={0} y={0} width={340} height={200} fill="url(#skylineAirGradient)" />

        {/* horizon fog band grounding the skyline into the scene instead of a hard silhouette cutoff */}
        <rect x={0} y={140} width={340} height={60} fill="url(#skylineHorizonHaze)" />
      </svg>
    </div>
  );
}

export default memo(SkylineBackdrop);
