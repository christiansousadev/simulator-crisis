import {
  GlassCoffeeTable,
  GroundShadow,
  LobbyArmchair,
  LogoPartitionWall,
  OfficePlant,
  ReceptionDesk,
  ReceptionMonitor,
  SecurityTurnstile,
  WaterCooler,
} from "./OfficeProps";
import OfficeWorker from "./OfficeWorker";

interface ReceptionLobbyProps {
  originX: number;
  originY: number;
}

// CORPORATE ENTRANCE LOBBY: RECEPTION COUNTER, SECURITY TURNSTILES AND A VISITOR WAITING LOUNGE
export default function ReceptionLobby({ originX, originY }: ReceptionLobbyProps) {
  return (
    <g>
      <GroundShadow x={originX + 1.0} y={originY + 0.6} rx={30} ry={14} />

      {/* security checkpoint guarding the approach from the main corridor */}
      <SecurityTurnstile x={originX - 1.8} y={originY + 0.35} />

      {/* logo partition wall anchors the counter and screens the back office beyond it */}
      <LogoPartitionWall x={originX + 0.1} y={originY - 0.38} />

      <ReceptionDesk x={originX} y={originY} />
      <ReceptionMonitor x={originX + 0.62} y={originY + 0.05} z={0.5} />
      <OfficeWorker
        x={originX + 0.78}
        y={originY - 0.1}
        z={0.22}
        shirtColor="#be185d"
        hairColor="#3f2e25"
        role="casual"
        seated
        mood="happy"
        badge
      />

      <WaterCooler x={originX + 1.9} y={originY + 0.6} />
      <OfficePlant x={originX - 0.6} y={originY + 1.5} />
      <OfficePlant x={originX + 2.3} y={originY + 1.9} />

      {/* visitor waiting lounge: two facing armchairs around a glass coffee table with magazines */}
      <LobbyArmchair x={originX + 2.6} y={originY + 0.4} />
      <LobbyArmchair x={originX + 2.6} y={originY + 1.4} />
      <GlassCoffeeTable x={originX + 2.95} y={originY + 0.85} />
    </g>
  );
}
