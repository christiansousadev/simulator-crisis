import { useMemo } from "react";
import { Service } from "../../types/game";
import { project } from "./isoMath";
import { rackGridPosition } from "./ServerRoom";

interface ServiceDependencyLinesProps {
  services: Service[];
  originX: number;
  originY: number;
  purchasedUpgrades: string[];
}

// SERVICE-TO-SERVICE DEPENDENCY LINES IN THE ISOMETRIC OFFICE
// Animated data-flow lines connecting racks that have a declared dependency relationship.
// Color encodes the downstream service's live status; the animation direction flows FROM
// the dependency (upstream) TOWARD the dependent (downstream), modeling data-flow direction.
export default function ServiceDependencyLines({
  services,
  originX,
  originY,
  purchasedUpgrades,
}: ServiceDependencyLinesProps) {
  // Only render when APM Tracing is active — the lines symbolize observability data
  const apmActive = purchasedUpgrades.includes("apm_tracing");

  const lines = useMemo(() => {
    const result: Array<{
      key: string;
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      status: string;
      opacity: number;
    }> = [];

    for (const svc of services) {
      for (const depId of svc.dependencies) {
        const dep = services.find((s) => s.id === depId);
        if (!dep) continue;

        const fromPos = rackGridPosition(dep.id, services, originX, originY);
        const toPos = rackGridPosition(svc.id, services, originX, originY);
        if (!fromPos || !toPos) continue;

        // project to SVG screen coords, raised slightly above the floor (z=0.8)
        const from = project(fromPos.x + 0.35, fromPos.y + 0.15, 0.8);
        const to = project(toPos.x + 0.35, toPos.y + 0.15, 0.8);

        result.push({
          key: `${dep.id}→${svc.id}`,
          fromX: from.x,
          fromY: from.y,
          toX: to.x,
          toY: to.y,
          status: svc.status,
          opacity: apmActive ? 0.65 : 0.2,
        });
      }
    }
    return result;
  }, [services, originX, originY, apmActive]);

  if (lines.length === 0) return null;

  return (
    <g style={{ pointerEvents: "none" }}>
      <defs>
        <marker id="depArrow-healthy" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#10b981" opacity="0.7" />
        </marker>
        <marker id="depArrow-degraded" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#f59e0b" opacity="0.7" />
        </marker>
        <marker id="depArrow-down" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="#f43f5e" opacity="0.7" />
        </marker>
      </defs>
      {lines.map((line) => {
        const color =
          line.status === "down"
            ? "#f43f5e"
            : line.status === "degraded"
            ? "#f59e0b"
            : "#10b981";
        const markerId = `depArrow-${line.status}`;
        return (
          <g key={line.key}>
            {/* base glow line */}
            <line
              x1={line.fromX}
              y1={line.fromY}
              x2={line.toX}
              y2={line.toY}
              stroke={color}
              strokeWidth={apmActive ? 2 : 1}
              strokeOpacity={line.opacity * 0.5}
              strokeDasharray="4 6"
            />
            {/* animated data-flow line */}
            <line
              x1={line.fromX}
              y1={line.fromY}
              x2={line.toX}
              y2={line.toY}
              stroke={color}
              strokeWidth={apmActive ? 1.5 : 0.8}
              strokeOpacity={line.opacity}
              strokeDasharray="8 10"
              markerEnd={apmActive ? `url(#${markerId})` : undefined}
            >
              <animate
                attributeName="stroke-dashoffset"
                from="0"
                to="-36"
                dur={line.status === "down" ? "0.7s" : line.status === "degraded" ? "1.2s" : "2s"}
                repeatCount="indefinite"
              />
            </line>
          </g>
        );
      })}
    </g>
  );
}
