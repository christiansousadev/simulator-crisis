import IsoBox from "./IsoBox";
import { EspressoMachine, Fridge, GroundShadow, OfficePlant, PingPongBall, Sofa, WaterCooler } from "./OfficeProps";
import { useGameStore } from "../../store/useGameStore";
import WanderingEmployee from "./WanderingEmployee";

interface BreakRoomProps {
  originX: number;
  originY: number;
}

// LOUNGE: PING PONG TABLE, KITCHENETTE, SECTIONAL SOFA AND TWO WANDERING STAFF
export default function BreakRoom({ originX, originY }: BreakRoomProps) {
  const happiness = useGameStore((s) => s.telemetry.user_happiness);
  const gameInPlay = happiness > 70;

  const employeeA = [
    { x: originX + 0.55, y: originY + 1.35, action: "walk" as const },
    { x: originX + 2.55, y: originY + 1.05, action: "coffee" as const },
    { x: originX + 0.2, y: originY + 1.6, action: "sofa" as const },
  ];
  const employeeB = [
    { x: originX + 1.55, y: originY + 0.65, action: "walk" as const },
    { x: originX + 0.65, y: originY + 0.5, action: "pingpong" as const, requiresMoraleAbove: 70 },
    { x: originX + 0.55, y: originY + 1.65, action: "sofa" as const },
  ];

  return (
    <g>
      <GroundShadow x={originX + 0.85} y={originY + 0.6} rx={24} ry={12} />

      {/* ping pong table with net */}
      <IsoBox x={originX + 0.3} y={originY + 0.3} z={0.02} w={1.1} d={0.6} h={0.2} color="#15803d" />
      <IsoBox x={originX + 0.83} y={originY + 0.3} z={0.22} w={0.04} d={0.6} h={0.08} color="#f8fafc" />
      {gameInPlay && <PingPongBall x={originX + 0.83} y={originY + 0.55} z={0.3} />}

      {/* kitchenette counter with water cooler, espresso machine and fridge */}
      <WaterCooler x={originX + 1.7} y={originY + 0.25} />
      <IsoBox x={originX + 2.05} y={originY + 0.2} z={0} w={0.9} d={0.3} h={0.32} color="#d6d3d1" />
      <EspressoMachine x={originX + 2.15} y={originY + 0.3} z={0.32} />
      <Fridge x={originX + 2.75} y={originY + 0.85} />

      {/* lounge sofa */}
      <Sofa x={originX + 0.2} y={originY + 1.5} />

      <OfficePlant x={originX + 2.9} y={originY + 1.7} />

      <WanderingEmployee waypoints={employeeA} shirtColor="#ea580c" hairColor="#1c1917" />
      <WanderingEmployee waypoints={employeeB} shirtColor="#0d9488" hairColor="#3f2e25" dwellMs={5200} />
    </g>
  );
}
