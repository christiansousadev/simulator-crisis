import { Service } from "../../types/game";
import { project } from "./isoMath";
import "./officeLife.css";

export type NetworkHealth = "healthy" | "degraded" | "down";

interface CableTrayProps {
  networkHealth: NetworkHealth;
}

interface CablePoint {
  x: number;
  y: number;
}

// DERIVE THE OVERALL DATA-PATH HEALTH TIER FROM THE CURRENT SERVICE FLEET
export function computeNetworkHealth(services: Service[]): NetworkHealth {
  if (services.some((s) => s.status === "down")) return "down";
  if (services.some((s) => s.status === "degraded")) return "degraded";
  return "healthy";
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

// per-health tier visual tuning: pulse color, dash speed, and whether the line stutters/sparks
// the dash pattern is "6 6" (period 12) and the css keyframes travel exactly one period per loop, so a loop never jumps
const HEALTH_STYLE: Record<NetworkHealth, { color: string; durationS: number; className: string; sparking: boolean }> = {
  healthy: { color: "#22c55e", durationS: 0.7, className: "ol-dash-12", sparking: false },
  degraded: { color: "#f59e0b", durationS: 1.2, className: "ol-dash-12", sparking: false },
  down: { color: "#ef4444", durationS: 0.5, className: "ol-dash-12-stutter", sparking: true },
};

function toPath(points: CablePoint[]): string {
  const projected = points.map((p) => project(p.x, p.y, 0.026));
  return `M ${projected.map((p) => `${p.x},${p.y}`).join(" L ")}`;
}

// midpoint of a multi-segment path, used to anchor the "connection severed" spark burst
function midpoint(points: CablePoint[]): CablePoint {
  const mid = points[Math.floor(points.length / 2)];
  return mid;
}

// FLOOR CABLE CONDUITS CARRYING ANIMATED DATA PULSES; COLOR, SPEED AND STUTTER TRACK FLEET-WIDE HEALTH:
// green/fast when every service is healthy, amber/slow when one is degraded, red/stuttering with
// spark bursts when a service is fully down -- a data-flow readout, not just a single alert flag.
export default function CableTray({ networkHealth }: CableTrayProps) {
  const style = HEALTH_STYLE[networkHealth];

  return (
    <g>
      {CABLE_PATHS.map((points, i) => {
        const d = toPath(points);
        const spark = project(midpoint(points).x, midpoint(points).y, 0.04);
        return (
          <g key={i}>
            <path d={d} stroke="#475569" strokeWidth={2.6} fill="none" opacity={0.45} strokeLinecap="round" />
            <path
              d={d}
              stroke={style.color}
              strokeWidth={1.3}
              strokeDasharray="6 6"
              fill="none"
              strokeLinecap="round"
              className={style.className}
              style={{ animationDuration: `${style.durationS}s` }}
              opacity={0.9}
            />
            {style.sparking && (
              <circle
                cx={spark.x}
                cy={spark.y}
                r={1.6}
                fill="#fef08a"
                className="animate-spark-flicker"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            )}
          </g>
        );
      })}
    </g>
  );
}
