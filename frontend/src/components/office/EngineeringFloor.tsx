import type { MouseEvent } from "react";
import { Service } from "../../types/game";
import EngineerDesk from "./EngineerDesk";
import { DeskLamp, GroundShadow, PcTower } from "./OfficeProps";
import IsoBox from "./IsoBox";
import OfficeWorker from "./OfficeWorker";

interface EngineeringFloorProps {
  originX: number;
  originY: number;
  services: Service[];
  selectedServiceId: string | null;
  onSelect: (serviceId: string) => void;
  onHoverService: (serviceId: string, evt: MouseEvent) => void;
  onLeaveService: () => void;
}

// stable desk order and per-engineer visual identity, giving each assigned role a distinct look
const DESK_ORDER = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"];
const SHIRT_COLORS: Record<string, string> = {
  "srv-auth": "#2563eb",
  "srv-payment": "#7c3aed",
  "srv-api-gw": "#0891b2",
  "srv-search": "#059669",
  "srv-notify": "#d97706",
};
const HAIR_COLORS: Record<string, string> = {
  "srv-auth": "#2b1a12",
  "srv-payment": "#6b4226",
  "srv-api-gw": "#1c1c1c",
  "srv-search": "#8a5a2b",
  "srv-notify": "#4a2e19",
};
const GLASSES: Record<string, boolean> = {
  "srv-auth": true,
  "srv-payment": false,
  "srv-api-gw": true,
  "srv-search": false,
  "srv-notify": false,
};

// two roomy rows for the five assigned engineers, spread wide across the expanded bay
const DESK_SLOTS = [
  { x: 0, y: 0 },
  { x: 2.5, y: 0 },
  { x: 5.0, y: 0 },
  { x: 1.2, y: 2.6 },
  { x: 3.7, y: 2.6 },
];

// unassigned filler desks, purely decorative, conveying a larger engineering headcount
const FILLER_SLOTS = [
  { x: 0, y: 5.1, shirt: "#94a3b8", hair: "#1c1917" },
  { x: 2.5, y: 5.1, shirt: "#f472b6", hair: "#3f2e25" },
  { x: 5.0, y: 5.1, shirt: "#65a30d", hair: "#1c1917" },
];

// OPEN-SPACE ENGINEERING BAY WITH ONE DESK PER ON-CALL ENGINEER, PLUS FILLER WORKSTATIONS FOR DENSITY
export default function EngineeringFloor({ originX, originY, services, selectedServiceId, onSelect, onHoverService, onLeaveService }: EngineeringFloorProps) {
  const byId = new Map(services.map((s) => [s.id, s]));
  const orderedIds = [...DESK_ORDER.filter((id) => byId.has(id)), ...services.map((s) => s.id).filter((id) => !DESK_ORDER.includes(id))];

  return (
    <g>
      {orderedIds.map((id, i) => {
        const service = byId.get(id);
        const slot = DESK_SLOTS[i];
        if (!service || !slot) return null;
        return (
          <EngineerDesk
            key={id}
            service={service}
            x={originX + slot.x}
            y={originY + slot.y}
            shirtColor={SHIRT_COLORS[id] ?? "#475569"}
            hairColor={HAIR_COLORS[id] ?? "#3f2e25"}
            glasses={GLASSES[id]}
            selected={selectedServiceId === id}
            onSelect={onSelect}
            onHover={onHoverService}
            onLeave={onLeaveService}
          />
        );
      })}

      {FILLER_SLOTS.map((slot, i) => {
        const x = originX + slot.x;
        const y = originY + slot.y;
        return (
          <g key={i}>
            <GroundShadow x={x + 0.5} y={y + 0.45} rx={20} ry={10} />
            <IsoBox x={x} y={y} z={0.03} w={1.0} d={0.55} h={0.28} color="#b98a5a" />
            <PcTower x={x + 0.05} y={y + 0.42} />
            <IsoBox x={x + 0.12} y={y + 0.08} z={0.31} w={0.28} d={0.06} h={0.22} color="#1e293b" />
            <IsoBox x={x + 0.55} y={y + 0.08} z={0.31} w={0.28} d={0.06} h={0.22} color="#1e293b" />
            <DeskLamp x={x + 0.9} y={y + 0.1} />
            <IsoBox x={x + 0.32} y={y + 0.85} z={0} w={0.32} d={0.08} h={0.4} color="#1e293b" />
            <IsoBox x={x + 0.32} y={y + 0.85} z={0} w={0.32} d={0.32} h={0.22} color="#475569" />
            <OfficeWorker x={x + 0.5} y={y + 0.72} z={0.24} shirtColor={slot.shirt} hairColor={slot.hair} role="engineer" seated mood="idle" />
          </g>
        );
      })}
    </g>
  );
}
