import type { CSSProperties } from "react";
import { memo, useEffect, useMemo, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import { InfrastructureNode, Service } from "../../types/game";
import IsoBox from "./IsoBox";
import { project } from "./isoMath";
import "./officeLife.css";

interface InfrastructureNodeSpriteProps {
  node: InfrastructureNode;
  services: Service[];
  serverRoomOriginX: number;
  serverRoomOriginY: number;
}

// mirrors ServerRoom.tsx's rack layout so the cable always lands on the right rack
const RACK_ORDER = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"];
const RACK_SPACING = 1.3;

export const NODE_COLORS: Record<string, string> = {
  redis_cache: "#dc2626",
  kafka_queue: "#7c3aed",
  db_read_replica: "#0891b2",
  nginx_lb: "#059669",
};

// the landing ring only exists for the drop-in
const DROP_RING_MS = 900;

// FIND THE PROJECTED ANCHOR OF A RACK BY SERVICE ID, MATCHING SERVERROOM'S LAYOUT EXACTLY
function rackAnchor(serviceId: string, originX: number, originY: number) {
  const index = RACK_ORDER.indexOf(serviceId);
  const slot = index >= 0 ? index : 0;
  return { x: originX + 0.8 + slot * RACK_SPACING, y: originY + 2.0 };
}

// PLACED BUILD-MODE HARDWARE MODULE PLUS AN ANIMATED DATA-PULSE CABLE BACK TO ITS TARGET RACK. a module
// placed while build mode is open drops in from above and lands with a ring; one that was already
// there when the office loaded just appears.
function InfrastructureNodeSprite({ node, services, serverRoomOriginX, serverRoomOriginY }: InfrastructureNodeSpriteProps) {
  const config = useMemo(() => {
    try {
      return JSON.parse(node.config_json) as { target_service_id: string; producer_service_id: string | null };
    } catch {
      return null;
    }
  }, [node.config_json]);

  // build mode is only ever on while the player is placing nodes, so it marks a fresh placement
  const [fresh] = useState(() => useGameStore.getState().buildModeActive);
  const [ringShown, setRingShown] = useState(fresh);
  useEffect(() => {
    if (!ringShown) return;
    const timer = setTimeout(() => setRingShown(false), DROP_RING_MS);
    return () => clearTimeout(timer);
  }, [ringShown]);

  if (!config) return null;
  const target = rackAnchor(config.target_service_id, serverRoomOriginX, serverRoomOriginY);
  const targetService = services.find((s) => s.id === config.target_service_id);
  if (!targetService) return null;

  const nodeAnchor = project(node.grid_x, node.grid_y, 0.02);
  const targetAnchor = project(target.x, target.y, 0.3);
  const color = NODE_COLORS[node.node_type] ?? "#64748b";
  const landing = project(node.grid_x + 0.16, node.grid_y + 0.16, 0.02);

  return (
    <g>
      <line
        x1={nodeAnchor.x}
        y1={nodeAnchor.y}
        x2={targetAnchor.x}
        y2={targetAnchor.y}
        stroke={color}
        strokeWidth={1.5}
        strokeDasharray="4 3"
        opacity={0.7}
        className="ol-dash-7"
      />
      {ringShown && (
        <ellipse
          cx={landing.x}
          cy={landing.y}
          rx={20}
          ry={10}
          fill="none"
          stroke={color}
          strokeWidth={1.4}
          className="ol-ripple motion-only"
          style={{ "--ol-ripple-delay": "0.35s", "--ol-ripple-dur": "0.6s", transformBox: "fill-box", transformOrigin: "center" } as CSSProperties}
        />
      )}
      <g className={fresh ? "ol-drop-in" : undefined}>
        <IsoBox x={node.grid_x} y={node.grid_y} z={0} w={0.32} d={0.32} h={0.3} color={color} topFactor={1.2} />
      </g>
    </g>
  );
}

export default memo(InfrastructureNodeSprite);
