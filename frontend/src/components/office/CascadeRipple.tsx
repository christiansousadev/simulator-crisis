import type { CSSProperties } from "react";
import { memo } from "react";
import { useGameStore } from "../../store/useGameStore";
import { Service } from "../../types/game";
import { project } from "./isoMath";
import { rackGridPosition } from "./ServerRoom";
import "./officeLife.css";

interface CascadeRippleProps {
  services: Service[];
  originX: number;
  originY: number;
}

// durations / delays of the three expanding rings; the last one ends inside the `fail` run-animation's ttl
const RINGS = [
  { rx: 55, ry: 28, width: 3, dur: 0.9, delay: 0 },
  { rx: 75, ry: 38, width: 2, dur: 1.15, delay: 0.15 },
  { rx: 95, ry: 48, width: 1, dur: 1.4, delay: 0.3 },
];

// CASCADE FAILURE RIPPLE: A RADIAL SHOCK WAVE FROM A RACK THE MOMENT IT GOES DOWN. it renders for as long as
// that service has a `fail` run-animation (emitted by useServiceTransitions and dismissed after its ttl).
// the rings are plain CSS keyframes started when the element mounts -- the old SMIL <animate> elements
// counted time from page load, so a ripple added minutes into a session had already "finished" and never showed.
function CascadeRipple({ services, originX, originY }: CascadeRippleProps) {
  const failKey = useGameStore((s) =>
    s.runAnimations
      .filter((a) => a.kind === "fail")
      .map((a) => `${a.id}@${a.serviceId}`)
      .join("|")
  );
  if (!failKey) return null;

  return (
    <g style={{ pointerEvents: "none" }}>
      {failKey.split("|").map((entry) => {
        const [id, serviceId] = entry.split("@");
        const svc = services.find((s) => s.id === serviceId);
        const pos = rackGridPosition(serviceId, services, originX, originY);
        if (!svc || !pos) return null;
        const pt = project(pos.x + 0.35, pos.y + 0.15, 1.2);
        const color = svc.tier === "critical" ? "#f43f5e" : "#f59e0b";
        return (
          <g key={id} transform={`translate(${pt.x}, ${pt.y})`} className="motion-only">
            {RINGS.map((ring, i) => (
              <ellipse
                key={i}
                cx={0}
                cy={0}
                rx={ring.rx}
                ry={ring.ry}
                fill="none"
                stroke={color}
                strokeWidth={ring.width}
                vectorEffect="non-scaling-stroke"
                className="ol-ripple"
                style={{ "--ol-ripple-dur": `${ring.dur}s`, "--ol-ripple-delay": `${ring.delay}s` } as CSSProperties}
              />
            ))}
            {/* central impact flash */}
            <ellipse cx={0} cy={0} rx={12} ry={6} fill={color} className="ol-ripple-core" />
          </g>
        );
      })}
    </g>
  );
}

export default memo(CascadeRipple);
