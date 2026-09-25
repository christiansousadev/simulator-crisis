import type { MouseEvent } from "react";
import { Service } from "../../types/game";
import { SlidingGlassDoor } from "./OfficeProps";
import ServerRack from "./ServerRack";

interface ServerRoomProps {
  originX: number;
  originY: number;
  services: Service[];
  selectedServiceId: string | null;
  onSelect: (serviceId: string) => void;
  onHoverService: (serviceId: string, evt: MouseEvent) => void;
  onLeaveService: () => void;
}

// fixed left-to-right rack order for a stable, readable floor layout
const RACK_ORDER = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"];
const RACK_SPACING = 1.3;

// SECURE SERVER VAULT HOUSING ONE 42U CABINET PER MICROSERVICE, GATED BY A GLASS SLIDING DOOR
export default function ServerRoom({ originX, originY, services, selectedServiceId, onSelect, onHoverService, onLeaveService }: ServerRoomProps) {
  const byId = new Map(services.map((s) => [s.id, s]));
  const orderedIds = [...RACK_ORDER.filter((id) => byId.has(id)), ...services.map((s) => s.id).filter((id) => !RACK_ORDER.includes(id))];

  return (
    <g>
      <SlidingGlassDoor x={originX + 3.4} y={originY + 3.55} />

      {orderedIds.map((id, i) => {
        const service = byId.get(id);
        if (!service) return null;
        return (
          <ServerRack
            key={id}
            service={service}
            x={originX + 0.8 + i * RACK_SPACING}
            y={originY + 2.0}
            selected={selectedServiceId === id}
            onSelect={onSelect}
            onHover={onHoverService}
            onLeave={onLeaveService}
          />
        );
      })}
    </g>
  );
}
