import { useGameStore } from "../../store/useGameStore";
import { project } from "./isoMath";

interface BoardroomMetricsDisplayProps {
  x: number;
  y: number;
  z?: number;
  hasP1: boolean;
}

const PANEL_WIDTH = 78;
const PANEL_HEIGHT = 42;

// NORMALIZE A SERIES TO THE 0-1 RANGE, USED SO EACH SPARKLINE READS CLEARLY ON ITS OWN SCALE
function normalize(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v) => (v - min) / range);
}

function buildPolyline(values: number[], width: number, height: number): string {
  const normalized = normalize(values);
  if (normalized.length < 2) return "";
  return normalized
    .map((v, i) => {
      const px = (i / (normalized.length - 1)) * width;
      const py = height - v * height;
      return `${px},${py}`;
    })
    .join(" ");
}

// LIVE SVG SPARKLINE WALL PANEL: LATENCY, THROUGHPUT AND ERROR RATE OVER THE LAST 60 TICKS
export default function BoardroomMetricsDisplay({ x, y, z = 0, hasP1 }: BoardroomMetricsDisplayProps) {
  const history = useGameStore((s) => s.metricsHistory);
  const screen = project(x, y, z);

  const innerW = PANEL_WIDTH - 8;
  const innerH = PANEL_HEIGHT - 12;

  const latencyPoints = buildPolyline(history.map((h) => h.avgLatencyMs), innerW, innerH);
  const throughputPoints = buildPolyline(history.map((h) => h.throughputProxy), innerW, innerH);
  const errorPoints = buildPolyline(history.map((h) => h.errorRatePct), innerW, innerH);

  return (
    <g transform={`translate(${screen.x - PANEL_WIDTH / 2}, ${screen.y - PANEL_HEIGHT})`}>
      {/* Heavy titanium wall bracket */}
      <rect x={-2} y={-2} width={PANEL_WIDTH + 4} height={PANEL_HEIGHT + 4} rx={3} fill="#090d16" stroke="#334155" strokeWidth={1} />

      {/* Screen chassis */}
      <rect
        width={PANEL_WIDTH}
        height={PANEL_HEIGHT}
        rx={2}
        fill="#0b1324"
        stroke={hasP1 ? "#ef4444" : "#1e293b"}
        strokeWidth={1}
        className={hasP1 ? "animate-beacon-flash" : undefined}
        style={hasP1 ? { fill: "#450a0a" } : undefined}
      />

      {/* Header bar */}
      <rect x={1} y={1} width={PANEL_WIDTH - 2} height={7} fill="#0f172a" />
      <circle cx={5} cy={4.5} r={1.5} fill={hasP1 ? "#ef4444" : "#10b981"} className={hasP1 ? "animate-pulse" : undefined} />
      <text
        x={10}
        y={5.5}
        fill={hasP1 ? "#fca5a5" : "#94a3b8"}
        style={{ fontSize: 3.8, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.08em" }}
      >
        {hasP1 ? "CRITICAL ALERT // SEV-1 ACTIVE" : "TELEMETRY // LATENCY • ERRORS"}
      </text>

      {/* Oscilloscope subtle grid lines */}
      {[0.25, 0.5, 0.75].map((frac, i) => (
        <line
          key={i}
          x1={4}
          y1={9 + frac * innerH}
          x2={4 + innerW}
          y2={9 + frac * innerH}
          stroke="rgba(56,189,248,0.12)"
          strokeDasharray="2 2"
          strokeWidth={0.5}
        />
      ))}

      {/* Live Sparkline Curves */}
      <g transform="translate(4, 9)">
        {throughputPoints && <polyline points={throughputPoints} fill="none" stroke="#10b981" strokeWidth={1.2} opacity={0.7} />}
        {latencyPoints && <polyline points={latencyPoints} fill="none" stroke="#00f0ff" strokeWidth={1.4} />}
        {errorPoints && <polyline points={errorPoints} fill="none" stroke="#ef4444" strokeWidth={1.4} />}
      </g>
    </g>
  );
}
