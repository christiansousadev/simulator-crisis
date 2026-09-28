import IsoBox from "./IsoBox";
import { project, shade } from "./isoMath";

interface PropPosition {
  x: number;
  y: number;
  z?: number;
}

// POTTED OFFICE PLANT IN A WHITE CERAMIC PLANTER
export function OfficePlant({ x, y, z = 0 }: PropPosition) {
  const canopy = project(x + 0.15, y + 0.15, z + 0.45);
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.3} d={0.3} h={0.22} color="#f8fafc" />
      <ellipse cx={canopy.x} cy={canopy.y} rx={9} ry={7} fill="#16a34a" opacity={0.9} />
      <ellipse cx={canopy.x - 5} cy={canopy.y + 3} rx={6} ry={5} fill="#22c55e" opacity={0.85} />
      <ellipse cx={canopy.x + 5} cy={canopy.y + 2} rx={6} ry={5} fill="#15803d" opacity={0.85} />
    </g>
  );
}

// SMALL WASTE BIN, A QUIET DENSITY PROP FOR THE OPEN FLOOR
export function WasteBin({ x, y, z = 0 }: PropPosition) {
  return <IsoBox x={x} y={y} z={z} w={0.2} d={0.2} h={0.28} color="#57534e" topFactor={1.1} />;
}

// WALL CLOCK, DRAWN IN SCREEN SPACE AT THE GIVEN ANCHOR
export function WallClock({ x, y, z = 0.6 }: PropPosition) {
  const p = project(x, y, z);
  return (
    <g>
      <circle cx={p.x} cy={p.y} r={7} fill="#f8fafc" stroke="#334155" strokeWidth={1.4} />
      <line x1={p.x} y1={p.y} x2={p.x} y2={p.y - 3.8} stroke="#334155" strokeWidth={1} strokeLinecap="round" />
      <line x1={p.x} y1={p.y} x2={p.x + 2.6} y2={p.y} stroke="#334155" strokeWidth={1} strokeLinecap="round" />
    </g>
  );
}

// SECTIONAL LOUNGE COUCH WITH THROW PILLOWS
export function Sofa({ x, y, z = 0 }: PropPosition) {
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={1.3} d={0.55} h={0.22} color="#0e7490" />
      <IsoBox x={x} y={y} z={z + 0.2} w={1.3} d={0.12} h={0.32} color="#0891b2" />
      {/* corner return section */}
      <IsoBox x={x + 1.3} y={y} z={z} w={0.55} d={0.55} h={0.22} color="#0e7490" />
      <IsoBox x={x + 1.3} y={y} z={z + 0.2} w={0.12} d={0.55} h={0.32} color="#0891b2" />
      {/* throw pillows */}
      <IsoBox x={x + 0.15} y={y + 0.02} z={z + 0.22} w={0.22} d={0.2} h={0.16} color="#f97316" />
      <IsoBox x={x + 0.7} y={y + 0.02} z={z + 0.22} w={0.22} d={0.2} h={0.16} color="#fbbf24" />
    </g>
  );
}

interface GroundShadowProps extends PropPosition {
  rx?: number;
  ry?: number;
}

// SOFT DIRECTIONAL CONTACT SHADOW, ELONGATED TOWARD LOWER-RIGHT AS IF LIT FROM THE REAR-LEFT WINDOWS
export function GroundShadow({ x, y, z = 0.001, rx = 14, ry = 7 }: GroundShadowProps) {
  const p = project(x, y, z);
  return (
    <ellipse
      cx={p.x + rx * 0.22}
      cy={p.y + ry * 0.2}
      rx={rx * 1.15}
      ry={ry * 0.95}
      fill="url(#groundShadowGradient)"
    />
  );
}

// UNDER-DESK PC TOWER
export function PcTower({ x, y, z = 0 }: PropPosition) {
  return <IsoBox x={x} y={y} z={z} w={0.16} d={0.2} h={0.3} color="#18181b" topFactor={1.3} />;
}

// SMALL GOOSENECK DESK LAMP
export function DeskLamp({ x, y, z = 0 }: PropPosition) {
  const base = project(x + 0.05, y + 0.05, z + 0.28);
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.1} d={0.1} h={0.28} color="#44403c" />
      <ellipse cx={base.x} cy={base.y - 2} rx={4} ry={2} fill="#fde68a" opacity={0.9} />
    </g>
  );
}

// STICKY NOTE ON A MONITOR BEZEL, SCREEN-SPACE SQUARE
export function StickyNote({ x, y, z = 0 }: PropPosition) {
  const p = project(x, y, z);
  return <rect x={p.x - 2.4} y={p.y - 2.4} width={4.8} height={4.8} fill="#fde047" opacity={0.95} transform={`rotate(-8 ${p.x} ${p.y})`} />;
}

// MINI KPI DASHBOARD SCREEN, WALL-MOUNTED IN THE BOARDROOM
export function KpiDisplay({ x, y, z = 0 }: PropPosition) {
  const screen = project(x + 0.02, y + 0.02, z + 0.08);
  const bars = [0.5, 0.8, 0.35, 0.65];
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.06} d={0.7} h={0.5} color="#0f172a" />
      {bars.map((h, i) => (
        <rect key={i} x={screen.x - 10 + i * 5.5} y={screen.y + 8 - h * 16} width={3.6} height={h * 16} fill={i % 2 === 0 ? "#38bdf8" : "#22c55e"} />
      ))}
    </g>
  );
}

// KITCHEN FRIDGE FOR THE BREAKROOM KITCHENETTE
export function Fridge({ x, y, z = 0 }: PropPosition) {
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.42} d={0.4} h={0.75} color="#e2e8f0" topFactor={1.15} />
      <IsoBox x={x + 0.36} y={y - 0.02} z={z + 0.4} w={0.04} d={0.06} h={0.18} color="#94a3b8" />
    </g>
  );
}

// ESPRESSO MACHINE ON THE KITCHENETTE COUNTER
export function EspressoMachine({ x, y, z = 0 }: PropPosition) {
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.26} d={0.22} h={0.24} color="#3f3f46" topFactor={1.2} />
      <IsoBox x={x + 0.04} y={y + 0.04} z={z + 0.24} w={0.06} d={0.06} h={0.08} color="#a1a1aa" />
    </g>
  );
}

// HEAVY GLASS SLIDING DOOR WITH AN ACCESS KEYPAD, MARKING THE SERVER VAULT ENTRANCE
export function SlidingGlassDoor({ x, y, z = 0, height = 0.95 }: PropPosition & { height?: number }) {
  const keypad = project(x + 0.28, y - 0.03, z + height * 0.5);
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.05} d={0.5} h={height} color="#cbd5e1" opacity={0.5} topFactor={1.3} rightFactor={1.1} leftFactor={0.9} />
      <IsoBox x={x - 0.02} y={y - 0.02} z={z} w={0.02} d={0.02} h={height} color="#475569" />
      <IsoBox x={x - 0.02} y={y + 0.5} z={z} w={0.02} d={0.02} h={height} color="#475569" />
      <rect x={keypad.x - 2} y={keypad.y - 3} width={4} height={6} rx={0.8} fill="#1e293b" />
      <circle cx={keypad.x} cy={keypad.y - 0.5} r={0.7} fill="#22c55e" />
    </g>
  );
}

// PING-PONG TABLE: DARK END SUPPORTS HOLDING UP A THIN RAISED TABLETOP, WITH A NET ACROSS THE MIDDLE
export function PingPongTable({ x, y, z = 0 }: PropPosition) {
  const width = 1.1;
  const depth = 0.6;
  const legHeight = 0.28;
  const topThickness = 0.05;
  const supportWidth = 0.16;
  return (
    <g>
      {/* end supports, raising the tabletop clear of the floor so it reads as furniture, not a slab */}
      <IsoBox x={x} y={y} z={z} w={supportWidth} d={depth} h={legHeight} color="#334155" topFactor={1.1} />
      <IsoBox x={x + width - supportWidth} y={y} z={z} w={supportWidth} d={depth} h={legHeight} color="#334155" topFactor={1.1} />
      {/* thin tabletop resting on the supports */}
      <IsoBox x={x} y={y} z={z + legHeight} w={width} d={depth} h={topThickness} color="#15803d" />
      {/* net, standing upright across the midline */}
      <IsoBox
        x={x + width / 2 - 0.02}
        y={y}
        z={z + legHeight + topThickness}
        w={0.04}
        d={depth}
        h={0.16}
        color="#f8fafc"
      />
    </g>
  );
}

// SMALL ANIMATED BALL VOLLEYING ACROSS THE PING-PONG TABLE
export function PingPongBall({ x, y, z = 0 }: PropPosition) {
  const p = project(x, y, z);
  return (
    <g style={{ transformOrigin: `${p.x}px ${p.y}px` }} className="animate-ball-volley">
      <circle cx={p.x} cy={p.y} r={1.6} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.4} />
    </g>
  );
}

// FREESTANDING WATER COOLER WITH A REFILL BOTTLE
export function WaterCooler({ x, y, z = 0 }: PropPosition) {
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.24} d={0.24} h={0.5} color="#93c5fd" />
      <IsoBox x={x + 0.02} y={y + 0.02} z={z + 0.5} w={0.2} d={0.2} h={0.22} color="#bfdbfe" topFactor={1.3} />
    </g>
  );
}

// CURVED MODERN RECEPTION COUNTER, FRONT FACADE BOWED OUTWARD TOWARD THE VISITOR SIDE
export function ReceptionDesk({ x, y, z = 0 }: PropPosition) {
  const width = 1.5;
  const depth = 0.42;
  const height = 0.5;
  const bow = 0.16;

  const p = (dx: number, dy: number, dz: number) => project(x + dx, y + dy, z + dz);

  const botL = p(0, depth, 0);
  const botM = p(width / 2, depth + bow, 0);
  const botR = p(width, depth, 0);
  const topL = p(0, depth, height);
  const topM = p(width / 2, depth + bow, height);
  const topR = p(width, depth, height);
  const backL = p(0, 0, height);
  const backR = p(width, 0, height);
  const ledZ = height * 0.55;
  const ledL = p(0, depth, ledZ);
  const ledM = p(width / 2, depth + bow, ledZ);
  const ledR = p(width, depth, ledZ);

  const frontPath = `M ${botL.x} ${botL.y} Q ${botM.x} ${botM.y} ${botR.x} ${botR.y} L ${topR.x} ${topR.y} Q ${topM.x} ${topM.y} ${topL.x} ${topL.y} Z`;
  const topPath = `M ${backL.x} ${backL.y} L ${backR.x} ${backR.y} L ${topR.x} ${topR.y} Q ${topM.x} ${topM.y} ${topL.x} ${topL.y} Z`;
  const leftCapPath = `M ${p(0, 0, 0).x} ${p(0, 0, 0).y} L ${backL.x} ${backL.y} L ${topL.x} ${topL.y} L ${botL.x} ${botL.y} Z`;
  const ledPath = `M ${ledL.x} ${ledL.y} Q ${ledM.x} ${ledM.y} ${ledR.x} ${ledR.y}`;

  return (
    <g>
      <path d={leftCapPath} fill={shade("#1e293b", 0.65)} stroke="rgba(15,23,42,0.3)" strokeWidth={0.6} />
      <path d={frontPath} fill={shade("#1e293b", 0.95)} stroke="rgba(15,23,42,0.3)" strokeWidth={0.6} />
      <path d={topPath} fill={shade("#1e293b", 1.25)} stroke="rgba(15,23,42,0.25)" strokeWidth={0.6} />
      {/* backlit accent strip following the counter's curve */}
      <path d={ledPath} fill="none" stroke="#38bdf8" strokeWidth={2} opacity={0.85} strokeLinecap="round" />
    </g>
  );
}

// FLAT RECEPTION DESK MONITOR, ANGLED TOWARD THE RECEPTIONIST
export function ReceptionMonitor({ x, y, z = 0 }: PropPosition) {
  const screen = project(x + 0.02, y + 0.02, z + 0.2);
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.05} d={0.22} h={0.2} color="#1e293b" />
      <IsoBox x={x - 0.02} y={y + 0.08} z={z} w={0.04} d={0.04} h={0.06} color="#334155" />
      <rect x={screen.x - 5} y={screen.y - 4} width={9} height={6} rx={0.6} fill="#38bdf8" opacity={0.55} />
    </g>
  );
}

// FREESTANDING LOGO PARTITION WALL BEHIND THE RECEPTION COUNTER
export function LogoPartitionWall({ x, y, z = 0 }: PropPosition) {
  const height = 1.5;
  const logo = project(x + 0.55, y + 0.02, z + height * 0.58);
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={1.1} d={0.07} h={height} color="#0f172a" topFactor={1.1} rightFactor={0.85} leftFactor={0.6} />
      <circle cx={logo.x} cy={logo.y} r={9} fill="none" stroke="#38bdf8" strokeWidth={1.6} opacity={0.9} />
      <circle cx={logo.x} cy={logo.y} r={3.2} fill="#38bdf8" opacity={0.9} />
      <rect x={logo.x - 16} y={logo.y + 13} width={32} height={3} rx={1} fill="#94a3b8" opacity={0.6} />
    </g>
  );
}

// PAIRED GLASS SECURITY TURNSTILES MARKING THE ENTRANCE LANE
export function SecurityTurnstile({ x, y, z = 0 }: PropPosition) {
  const beacon = project(x + 0.02, y + 0.14, z + 0.55);
  const beacon2 = project(x + 0.5, y + 0.14, z + 0.55);
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.55} d={0.28} h={0.05} color="#334155" topFactor={1.15} />
      <IsoBox x={x} y={y} z={z + 0.05} w={0.06} d={0.28} h={0.5} color="#bae6fd" opacity={0.5} topFactor={1.3} />
      <IsoBox x={x + 0.49} y={y} z={z + 0.05} w={0.06} d={0.28} h={0.5} color="#bae6fd" opacity={0.5} topFactor={1.3} />
      <circle cx={beacon.x} cy={beacon.y} r={1.2} fill="#22c55e" />
      <circle cx={beacon2.x} cy={beacon2.y} r={1.2} fill="#22c55e" />
    </g>
  );
}

// LEATHER LOUNGE ARMCHAIR FOR THE VISITOR WAITING AREA
export function LobbyArmchair({ x, y, z = 0 }: PropPosition) {
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.4} d={0.4} h={0.2} color="#7c2d12" topFactor={1.15} />
      <IsoBox x={x} y={y + 0.32} z={z} w={0.4} d={0.08} h={0.42} color="#78350f" topFactor={1.05} />
      <IsoBox x={x} y={y} z={z} w={0.08} d={0.4} h={0.3} color="#78350f" topFactor={1.1} />
      <IsoBox x={x + 0.32} y={y} z={z} w={0.08} d={0.4} h={0.3} color="#78350f" topFactor={1.1} />
    </g>
  );
}

// GLASS COFFEE TABLE WITH SCATTERED MAGAZINES, CENTERPIECE OF THE WAITING LOUNGE
export function GlassCoffeeTable({ x, y, z = 0 }: PropPosition) {
  const top = project(x + 0.25, y + 0.2, z + 0.18);
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.05} d={0.05} h={0.18} color="#94a3b8" />
      <IsoBox x={x + 0.45} y={y} z={z} w={0.05} d={0.05} h={0.18} color="#94a3b8" />
      <IsoBox x={x} y={y + 0.35} z={z} w={0.05} d={0.05} h={0.18} color="#94a3b8" />
      <IsoBox x={x + 0.45} y={y + 0.35} z={z} w={0.05} d={0.05} h={0.18} color="#94a3b8" />
      <IsoBox x={x} y={y} z={z + 0.18} w={0.5} d={0.4} h={0.02} color="#bae6fd" opacity={0.5} topFactor={1.4} />
      <rect x={top.x - 7} y={top.y - 2} width={10} height={7} rx={0.6} fill="#f472b6" opacity={0.92} transform={`rotate(-12 ${top.x} ${top.y})`} />
      <rect x={top.x - 1} y={top.y - 1} width={10} height={7} rx={0.6} fill="#38bdf8" opacity={0.92} transform={`rotate(8 ${top.x} ${top.y})`} />
    </g>
  );
}

// ROUND MEETING NOOK TABLE WITH TWO CHAIRS, FILLER DENSITY FOR THE OPEN FLOOR
export function MeetingNook({ x, y, z = 0 }: PropPosition) {
  const top = project(x + 0.3, y + 0.3, z + 0.24);
  return (
    <g>
      <IsoBox x={x + 0.15} y={y + 0.15} z={z} w={0.06} d={0.06} h={0.24} color="#78716c" />
      <ellipse cx={top.x} cy={top.y} rx={13} ry={9} fill="#a8734a" />
      <IsoBox x={x - 0.1} y={y + 0.35} z={0} w={0.22} d={0.22} h={0.26} color="#475569" />
      <IsoBox x={x + 0.6} y={y + 0.05} z={0} w={0.22} d={0.22} h={0.26} color="#475569" />
    </g>
  );
}
