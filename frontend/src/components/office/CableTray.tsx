import { useReducedMotion } from "../../hooks/useReducedMotion";
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

// how far along the cable a pulse gets before the line is "cut" on a failed network
export const SEVER_FRACTION = 0.45;

interface PulseStyle {
  color: string;
  // how many light pulses ride each cable
  count: number;
  // seconds for one pulse to cross the whole cable
  durationS: number;
  // delay between consecutive pulses; small = bunched up behind a bottleneck
  spacingS: number;
  radius: number;
  // true when pulses die at the break instead of arriving
  severed: boolean;
}

// per-health pulse tuning: soft regular cyan pulses when healthy, slow amber ones piling up behind a
// latency bottleneck, red ones that stop dead at a break (with sparks) when the network is down
export const PULSE_STYLE: Record<NetworkHealth, PulseStyle> = {
  healthy: { color: "#22d3ee", count: 3, durationS: 2.4, spacingS: 0.8, radius: 1.9, severed: false },
  degraded: { color: "#fbbf24", count: 4, durationS: 5.2, spacingS: 0.45, radius: 2.1, severed: false },
  down: { color: "#ef4444", count: 3, durationS: 2.0, spacingS: 0.65, radius: 1.9, severed: true },
};

function toPath(points: CablePoint[]): string {
  const projected = points.map((p) => project(p.x, p.y, 0.026));
  return `M ${projected.map((p) => `${p.x},${p.y}`).join(" L ")}`;
}

// midpoint of a multi-segment path, used to anchor the "connection severed" spark burst
function midpoint(points: CablePoint[]): CablePoint {
  return points[Math.floor(points.length / 2)];
}

function Pulse({ d, style, index, animated }: { d: string; style: PulseStyle; index: number; animated: boolean }) {
  const begin = `${(index * style.spacingS).toFixed(2)}s`;
  if (!animated) return null;
  return (
    <circle r={style.radius} fill={style.color} opacity={0.95} data-testid="cable-pulse">
      {style.severed ? (
        <>
          <animateMotion dur={`${style.durationS}s`} begin={begin} repeatCount="indefinite" path={d} keyPoints={`0;${SEVER_FRACTION};${SEVER_FRACTION}`} keyTimes="0;0.8;1" calcMode="linear" />
          <animate attributeName="opacity" dur={`${style.durationS}s`} begin={begin} repeatCount="indefinite" values="0.95;0.95;0" keyTimes="0;0.8;1" />
        </>
      ) : (
        <animateMotion dur={`${style.durationS}s`} begin={begin} repeatCount="indefinite" path={d} />
      )}
    </circle>
  );
}

// FLOOR CABLE CONDUITS CARRYING LIGHT PULSES THAT TRACK FLEET-WIDE HEALTH: cyan and regular when every
// service is healthy, amber, slow and bunched up when one is degraded (a visible bottleneck), red pulses
// that stop at a break with a spark burst when a service is fully down. Under reduced motion the pulses
// are not drawn at all (SMIL ignores the css reduced-motion rule, so the component decides itself).
export default function CableTray({ networkHealth }: CableTrayProps) {
  const style = PULSE_STYLE[networkHealth];
  const reduced = useReducedMotion();

  return (
    <g>
      {CABLE_PATHS.map((points, i) => {
        const d = toPath(points);
        const mid = midpoint(points);
        const breakPoint = project(mid.x, mid.y, 0.04);
        return (
          <g key={i} data-network-health={networkHealth}>
            <path d={d} stroke="#475569" strokeWidth={2.6} fill="none" opacity={0.45} strokeLinecap="round" />
            <path d={d} stroke={style.color} strokeWidth={0.8} fill="none" strokeLinecap="round" opacity={0.28} />
            {Array.from({ length: style.count }, (_, k) => (
              <Pulse key={k} d={d} style={style} index={k + i * 0.5} animated={!reduced} />
            ))}
            {style.severed && (
              <g>
                <circle cx={breakPoint.x} cy={breakPoint.y} r={1.6} fill="#fef08a" className="animate-spark-flicker" style={{ animationDelay: `${i * 0.15}s` }} />
                <path
                  d={`M ${breakPoint.x - 3},${breakPoint.y + 1} L ${breakPoint.x},${breakPoint.y - 2.5} L ${breakPoint.x + 1},${breakPoint.y + 0.5} L ${breakPoint.x + 4},${breakPoint.y - 3}`}
                  stroke="#fca5a5"
                  strokeWidth={0.8}
                  fill="none"
                  className="animate-spark-flicker"
                  style={{ animationDelay: `${0.1 + i * 0.15}s` }}
                />
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
