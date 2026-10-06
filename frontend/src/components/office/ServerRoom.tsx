import type { MouseEvent } from "react";
import { memo } from "react";
import { useServiceTransitions } from "../../hooks/useServiceTransitions";
import { IncidentSeverity, Service } from "../../types/game";
import BuildPlacementGhost from "./BuildPlacementGhost";
import { SERVER_DOOR_OFFSET } from "./officeLayout";
import { SlidingGlassDoor } from "./OfficeProps";
import { useRosterStage } from "./rosterStage";
import ServerRack from "./ServerRack";
import "./officeLife.css";

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
function ServerRoom({
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
  // this is the one mount point of the status-transition watcher: racks, ripple and restore fx read its run-animations
  useServiceTransitions(services);
  const someoneInside = useRosterStage((s) => s.serverRoomOccupied);

  const byId = new Map(services.map((s) => [s.id, s]));
  const orderedIds = [...RACK_ORDER.filter((id) => byId.has(id)), ...services.map((s) => s.id).filter((id) => !RACK_ORDER.includes(id))];

  return (
    <g>
      <SlidingGlassDoor x={originX + SERVER_DOOR_OFFSET.x} y={originY + SERVER_DOOR_OFFSET.y} open={someoneInside} />

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
      <BuildPlacementGhost />
    </g>
  );
}

export default memo(ServerRoom);
