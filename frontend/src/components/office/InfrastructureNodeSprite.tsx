import { InfrastructureNode, Service } from "../../types/game";
import IsoBox from "./IsoBox";
import { project } from "./isoMath";

interface InfrastructureNodeSpriteProps {
  node: InfrastructureNode;
  services: Service[];
  serverRoomOriginX: number;
  serverRoomOriginY: number;
}

// mirrors ServerRoom.tsx's rack layout so the cable always lands on the right rack
const RACK_ORDER = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"];
const RACK_SPACING = 1.3;

const NODE_COLORS: Record<string, string> = {
  redis_cache: "#dc2626",
  kafka_queue: "#7c3aed",
  db_read_replica: "#0891b2",
  nginx_lb: "#059669",
};

// FIND THE PROJECTED ANCHOR OF A RACK BY SERVICE ID, MATCHING SERVERROOM'S LAYOUT EXACTLY
function rackAnchor(serviceId: string, originX: number, originY: number) {
  const index = RACK_ORDER.indexOf(serviceId);
  const slot = index >= 0 ? index : 0;
  return { x: originX + 0.8 + slot * RACK_SPACING, y: originY + 2.0 };
}

// PLACED BUILD-MODE HARDWARE MODULE PLUS AN ANIMATED DATA-PULSE CABLE BACK TO ITS TARGET RACK
export default function InfrastructureNodeSprite({ node, services, serverRoomOriginX, serverRoomOriginY }: InfrastructureNodeSpriteProps) {
  const config = JSON.parse(node.config_json) as { target_service_id: string; producer_service_id: string | null };
  const target = rackAnchor(config.target_service_id, serverRoomOriginX, serverRoomOriginY);
  const targetService = services.find((s) => s.id === config.target_service_id);
  if (!targetService) return null;

  const nodeAnchor = project(node.grid_x, node.grid_y, 0.02);
  const targetAnchor = project(target.x, target.y, 0.3);
  const color = NODE_COLORS[node.node_type] ?? "#64748b";

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
        className="animate-dash-flow"
      />
      <IsoBox x={node.grid_x} y={node.grid_y} z={0} w={0.32} d={0.32} h={0.3} color={color} topFactor={1.2} />
    </g>
  );
}
