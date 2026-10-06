import { useMemo, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import IsoBox from "./IsoBox";
import {
  EspressoMachine,
  Fridge,
  GroundShadow,
  OfficePlant,
  PingPongBall,
  PingPongTable,
  Sofa,
  WaterCooler,
} from "./OfficeProps";
import RosterWalkers from "./RosterWalkers";
import WanderingEmployee from "./WanderingEmployee";

interface BreakRoomProps {
  originX: number;
  originY: number;
}

// morale gates the lounge traffic: below the first line nobody is in the mood to hang around at all,
// below the second only the one coffee-drinker is left (the ping-pong waypoint has its own gate)
const MORALE_SOME_TRAFFIC = 45;
const MORALE_ANY_TRAFFIC = 20;

// LOUNGE: PING PONG TABLE, KITCHENETTE, SECTIONAL SOFA, TWO WANDERING STAFF AND THE ENGINEERS ON BREAK
export default function BreakRoom({ originX, originY }: BreakRoomProps) {
  // boolean selectors: the room re-renders when traffic crosses a morale line, not on every tick of drift
  const showEmployeeA = useGameStore((s) => s.telemetry.user_happiness >= MORALE_ANY_TRAFFIC);
  const showEmployeeB = useGameStore((s) => s.telemetry.user_happiness >= MORALE_SOME_TRAFFIC);
  const espressoBought = useGameStore((s) => s.telemetry.purchased_upgrades.includes("espresso_machine"));

  // the ball animates only while employeeB has actually arrived at the pingpong waypoint --
  // previously it played on an infinite CSS loop keyed to a bare happiness threshold, so it kept
  // volleying by itself across the empty table for the two-thirds of the patrol loop employeeB
  // spent walking or on the sofa instead
  const [employeeBAction, setEmployeeBAction] = useState<string>("walk");
  const gameInPlay = showEmployeeB && employeeBAction === "pingpong";

  const employeeA = useMemo(
    () => [
      { x: originX + 0.55, y: originY + 1.35, action: "walk" as const },
      { x: originX + 2.3, y: originY + 0.72, action: "coffee" as const },
      { x: originX + 0.5, y: originY + 1.78, action: "sofa" as const },
    ],
    [originX, originY]
  );
  const employeeB = useMemo(
    () => [
      { x: originX + 1.55, y: originY + 0.65, action: "walk" as const },
      { x: originX + 0.65, y: originY + 0.5, action: "pingpong" as const, requiresMoraleAbove: 70 },
      { x: originX + 0.95, y: originY + 1.78, action: "sofa" as const },
    ],
    [originX, originY]
  );

  return (
    <g>
      <GroundShadow x={originX + 0.85} y={originY + 0.6} rx={24} ry={12} />

      {/* ping pong table with net */}
      <PingPongTable x={originX + 0.3} y={originY + 0.3} z={0.02} />
      {gameInPlay && <PingPongBall x={originX + 0.83} y={originY + 0.55} z={0.43} />}

      {/* kitchenette counter with water cooler, espresso machine and fridge */}
      <WaterCooler x={originX + 1.7} y={originY + 0.25} />
      <IsoBox x={originX + 2.05} y={originY + 0.2} z={0} w={0.9} d={0.3} h={0.32} color="#d6d3d1" />
      <EspressoMachine x={originX + 2.15} y={originY + 0.3} z={0.32} steam={espressoBought ? "full" : "light"} />
      <Fridge x={originX + 2.75} y={originY + 0.85} />

      {/* lounge sofa */}
      <Sofa x={originX + 0.2} y={originY + 1.5} />

      <OfficePlant x={originX + 2.9} y={originY + 1.7} />

      {showEmployeeA && <WanderingEmployee waypoints={employeeA} shirtColor="#ea580c" hairColor="#1c1917" />}
      {showEmployeeB && (
        <WanderingEmployee
          waypoints={employeeB}
          shirtColor="#0d9488"
          hairColor="#3f2e25"
          dwellMs={5200}
          onActionChange={setEmployeeBAction}
        />
      )}

      {/* engineers on their break: they walk in from the engineering bay and are drawn by this layer */}
      <RosterWalkers band="lounge" />
    </g>
  );
}
