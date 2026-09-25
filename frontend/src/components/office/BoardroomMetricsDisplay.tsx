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

  const latencyPoints = buildPolyline(history.map((h) => h.avgLatencyMs), PANEL_WIDTH - 6, PANEL_HEIGHT - 6);
  const throughputPoints = buildPolyline(history.map((h) => h.throughputProxy), PANEL_WIDTH - 6, PANEL_HEIGHT - 6);
  const errorPoints = buildPolyline(history.map((h) => h.errorRatePct), PANEL_WIDTH - 6, PANEL_HEIGHT - 6);

  return (
    <g transform={`translate(${screen.x - PANEL_WIDTH / 2}, ${screen.y - PANEL_HEIGHT})`}>
      <rect
        width={PANEL_WIDTH}
        height={PANEL_HEIGHT}
        rx={2}
        fill="#0f172a"
        stroke="#334155"
        strokeWidth={1}
        className={hasP1 ? "animate-beacon-flash" : undefined}
        style={hasP1 ? { fill: "#7f1d1d" } : undefined}
      />
      <g transform="translate(3, 3)">
        {latencyPoints && <polyline points={latencyPoints} fill="none" stroke="#38bdf8" strokeWidth={1.2} />}
        {throughputPoints && <polyline points={throughputPoints} fill="none" stroke="#22c55e" strokeWidth={1.2} />}
        {errorPoints && <polyline points={errorPoints} fill="none" stroke="#f87171" strokeWidth={1.2} />}
      </g>
    </g>
  );
}
