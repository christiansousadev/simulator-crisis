import type { MouseEvent } from "react";
import { IncidentSeverity, Service } from "../../types/game";
import { SlidingGlassDoor } from "./OfficeProps";
import ServerRack from "./ServerRack";

interface ServerRoomProps {
  originX: number;
  originY: number;
  services: Service[];
  selectedServiceId: string | null;
  /** highest-severity active incident per service id, for the office incident-highlight fx */
  serviceSeverities: Map<string, IncidentSeverity>;
  /** the service whose incident is currently open in the log-triage terminal, for the rack's investigation LED */
  investigatingServiceId: string | null;
  /** service the incident-detail modal is currently focused on, if any -- every other rack dims slightly */
  focusedServiceId: string | null;
  onSelect: (serviceId: string) => void;
  onHoverService: (serviceId: string, evt: MouseEvent) => void;
  onLeaveService: () => void;
}

// fixed left-to-right rack order for a stable, readable floor layout
const RACK_ORDER = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"];
const RACK_SPACING = 1.3;

// exported so callers outside this component (the camera-focus rig in IsometricOffice) can find
// exactly where a given service's rack sits on the floor, without duplicating the ordering rule
export function rackGridPosition(serviceId: string, services: Service[], originX: number, originY: number): { x: number; y: number } | null {
  const ids = services.map((s) => s.id);
  const orderedIds = [...RACK_ORDER.filter((id) => ids.includes(id)), ...ids.filter((id) => !RACK_ORDER.includes(id))];
  const i = orderedIds.indexOf(serviceId);
  if (i === -1) return null;
  return { x: originX + 0.8 + i * RACK_SPACING, y: originY + 2.0 };
}

// SECURE SERVER VAULT HOUSING ONE 42U CABINET PER MICROSERVICE, GATED BY A GLASS SLIDING DOOR
export default function ServerRoom({
  originX,
  originY,
  services,
  selectedServiceId,
  serviceSeverities,
  investigatingServiceId,
  focusedServiceId,
  onSelect,
  onHoverService,
  onLeaveService,
}: ServerRoomProps) {
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
            severity={serviceSeverities.get(id)}
            investigating={investigatingServiceId === id}
            dimmed={focusedServiceId !== null && focusedServiceId !== id}
            onSelect={onSelect}
            onHover={onHoverService}
            onLeave={onLeaveService}
          />
        );
      })}
    </g>
  );
}
