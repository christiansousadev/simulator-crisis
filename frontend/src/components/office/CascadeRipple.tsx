import { useEffect, useMemo, useRef, useState } from "react";
import { Service } from "../../types/game";
import { project } from "./isoMath";
import { rackGridPosition } from "./ServerRoom";

interface CascadeRippleProps {
  services: Service[];
  originX: number;
  originY: number;
}

interface RippleEvent {
  id: string;
  screenX: number;
  screenY: number;
  color: string;
  startedAt: number;
}

// CASCADE FAILURE RIPPLE EFFECT
// Detects when a service's status transitions to "down" and emits a radial shock-wave
// ripple emanating from that rack's position, giving instant visual feedback that a
// cascade has been triggered.
export default function CascadeRipple({ services, originX, originY }: CascadeRippleProps) {
  const prevStatuses = useRef<Map<string, string>>(new Map());
  const [ripples, setRipples] = useState<RippleEvent[]>([]);
  const seqRef = useRef(0);

  useEffect(() => {
    const newRipples: RippleEvent[] = [];
    for (const svc of services) {
      const prev = prevStatuses.current.get(svc.id);
      if (prev && prev !== "down" && svc.status === "down") {
        const pos = rackGridPosition(svc.id, services, originX, originY);
        if (pos) {
          const pt = project(pos.x + 0.35, pos.y + 0.15, 1.2);
          newRipples.push({
            id: `ripple-${seqRef.current++}`,
            screenX: pt.x,
            screenY: pt.y,
            color: svc.tier === "critical" ? "#f43f5e" : "#f59e0b",
            startedAt: Date.now(),
          });
        }
      }
      prevStatuses.current.set(svc.id, svc.status);
    }

    if (newRipples.length > 0) {
      setRipples((prev) => [...prev, ...newRipples]);
      // auto-clean ripples after animation completes (1.6s)
      setTimeout(() => {
        const ids = new Set(newRipples.map((r) => r.id));
        setRipples((prev) => prev.filter((r) => !ids.has(r.id)));
      }, 1700);
    }
  }, [services, originX, originY]);

  if (ripples.length === 0) return null;

  return (
    <g style={{ pointerEvents: "none" }}>
      {ripples.map((ripple) => (
        <g key={ripple.id} transform={`translate(${ripple.screenX}, ${ripple.screenY})`}>
          {/* 3 expanding concentric rings */}
          {[0, 1, 2].map((ring) => (
            <ellipse
              key={ring}
              cx={0}
              cy={0}
              rx={0}
              ry={0}
              fill="none"
              stroke={ripple.color}
              strokeWidth={ring === 0 ? 3 : ring === 1 ? 2 : 1}
              opacity={1}
            >
              <animate
                attributeName="rx"
                from="4"
                to={55 + ring * 20}
                dur={`${0.9 + ring * 0.35}s`}
                begin={`${ring * 0.15}s`}
                fill="freeze"
              />
              <animate
                attributeName="ry"
                from="2"
                to={28 + ring * 10}
                dur={`${0.9 + ring * 0.35}s`}
                begin={`${ring * 0.15}s`}
                fill="freeze"
              />
              <animate
                attributeName="opacity"
                from="0.85"
                to="0"
                dur={`${1.0 + ring * 0.35}s`}
                begin={`${ring * 0.15}s`}
                fill="freeze"
              />
            </ellipse>
          ))}
          {/* central impact flash */}
          <ellipse cx={0} cy={0} rx={8} ry={4} fill={ripple.color} opacity={0}>
            <animate attributeName="opacity" values="0;0.9;0" dur="0.4s" fill="freeze" />
            <animate attributeName="rx" from="2" to="12" dur="0.4s" fill="freeze" />
            <animate attributeName="ry" from="1" to="6" dur="0.4s" fill="freeze" />
          </ellipse>
        </g>
      ))}
    </g>
  );
}
