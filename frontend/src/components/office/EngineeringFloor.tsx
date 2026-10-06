import type { MouseEvent } from "react";
import { memo } from "react";
import { Service } from "../../types/game";
import EngineerDesk from "./EngineerDesk";
import { DeskLamp, GroundShadow, PcTower } from "./OfficeProps";
import IsoBox from "./IsoBox";
import RosterDirector from "./RosterDirector";
import RosterWalkers from "./RosterWalkers";
import { DESK_ORDER, DESK_SLOTS, RESERVE_SLOTS } from "./officeLayout";
import { useRosterStage } from "./rosterStage";
import { reserveSeatNodeId } from "./waypointGraph";

interface EngineeringFloorProps {
  originX: number;
  originY: number;
  services: Service[];
  selectedServiceId: string | null;
  onSelect: (serviceId: string) => void;
  onHoverService: (serviceId: string, evt: MouseEvent) => void;
  onLeaveService: () => void;
}

// a reserve desk: where an engineer without a service desk sits (an unassigned hire, or a second
// engineer on a service). it is bare until somebody takes it, its screens light once they sit down
const ReserveDesk = memo(function ReserveDesk({ x, y, index }: { x: number; y: number; index: number }) {
  const occupied = useRosterStage((s) => s.walkers.some((w) => w.seated && w.nodeId === reserveSeatNodeId(index)));
  const screen = occupied ? "#38bdf8" : "#1e293b";
  return (
    <g>
      <GroundShadow x={x + 0.5} y={y + 0.45} rx={20} ry={10} />
      <IsoBox x={x} y={y} z={0.03} w={1.0} d={0.55} h={0.28} color="#b98a5a" />
      <PcTower x={x + 0.05} y={y + 0.42} />
      <IsoBox x={x + 0.12} y={y + 0.08} z={0.31} w={0.28} d={0.06} h={0.22} color={screen} />
      <IsoBox x={x + 0.55} y={y + 0.08} z={0.31} w={0.28} d={0.06} h={0.22} color={screen} />
      <DeskLamp x={x + 0.9} y={y + 0.1} />
      <IsoBox x={x + 0.32} y={y + 0.85} z={0} w={0.32} d={0.08} h={0.4} color="#1e293b" />
      <IsoBox x={x + 0.32} y={y + 0.85} z={0} w={0.32} d={0.32} h={0.22} color="#475569" />
    </g>
  );
});

// OPEN-SPACE ENGINEERING BAY: ONE DESK PER SERVICE PLUS RESERVE DESKS, AND THE ROSTER THAT WALKS BETWEEN THEM.
// painted back to front -- desk row 1, the sprites standing behind row 2, desk row 2, the sprites
// between the rows and the reserve desks, the reserve desks, the sprites in front of everything.
function EngineeringFloor({ originX, originY, services, onSelect, selectedServiceId, onHoverService, onLeaveService }: EngineeringFloorProps) {
  const byId = new Map(services.map((s) => [s.id, s]));
  const orderedIds = [
    ...DESK_ORDER.filter((id) => byId.has(id)),
    ...services.map((s) => s.id).filter((id) => !(DESK_ORDER as readonly string[]).includes(id)),
  ];

  const desks = orderedIds.map((id, i) => ({ service: byId.get(id), slot: DESK_SLOTS[i], row: i < 3 ? 1 : 2 }));
  const renderDesk = (entry: (typeof desks)[number]) => {
    if (!entry.service || !entry.slot) return null;
    return (
      <EngineerDesk
        key={entry.service.id}
        service={entry.service}
        x={originX + entry.slot.x}
        y={originY + entry.slot.y}
        selected={selectedServiceId === entry.service.id}
        onSelect={onSelect}
        onHover={onHoverService}
        onLeave={onLeaveService}
      />
    );
  };

  return (
    <g>
      <RosterDirector />
      {desks.filter((d) => d.row === 1).map(renderDesk)}
      <RosterWalkers band="w0" onSelect={onSelect} />
      {desks.filter((d) => d.row === 2).map(renderDesk)}
      <RosterWalkers band="w1" onSelect={onSelect} />
      {RESERVE_SLOTS.map((slot, i) => (
        <ReserveDesk key={i} x={originX + slot.x} y={originY + slot.y} index={i} />
      ))}
      <RosterWalkers band="w2" onSelect={onSelect} />
    </g>
  );
}

export default memo(EngineeringFloor);
