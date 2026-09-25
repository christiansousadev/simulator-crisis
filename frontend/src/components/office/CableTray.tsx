import { project } from "./isoMath";

interface CableTrayProps {
  alert: boolean;
}

interface CablePoint {
  x: number;
  y: number;
}

// floor conduit runs linking the server vault doorway to the engineering bay across the hallway
const CABLE_PATHS: CablePoint[][] = [
  [
    { x: 7.6, y: 1.9 },
    { x: 9.8, y: 1.9 },
    { x: 11.0, y: 0.9 },
  ],
  [
    { x: 7.6, y: 2.6 },
    { x: 9.8, y: 2.6 },
    { x: 11.0, y: 3.9 },
  ],
];

function toPath(points: CablePoint[]): string {
  const projected = points.map((p) => project(p.x, p.y, 0.026));
  return `M ${projected.map((p) => `${p.x},${p.y}`).join(" L ")}`;
}

// FLOOR CABLE CONDUITS CARRYING ANIMATED DATA PULSES; TURN RED AND STUTTER DURING A P1 INCIDENT
export default function CableTray({ alert }: CableTrayProps) {
  const pulseColor = alert ? "#ef4444" : "#22d3ee";
  const pulseAnimation = alert ? "animate-dash-flow-stutter" : "animate-dash-flow";

  return (
    <g>
      {CABLE_PATHS.map((points, i) => {
        const d = toPath(points);
        return (
          <g key={i}>
            <path d={d} stroke="#475569" strokeWidth={2.6} fill="none" opacity={0.45} strokeLinecap="round" />
            <path
              d={d}
              stroke={pulseColor}
              strokeWidth={1.3}
              strokeDasharray="6 6"
              fill="none"
              strokeLinecap="round"
              className={pulseAnimation}
              opacity={0.9}
            />
          </g>
        );
      })}
    </g>
  );
}
