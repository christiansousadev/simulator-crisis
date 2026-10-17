import { useRef } from "react";
import { useGameStore } from "../../store/useGameStore";
import { getHourOfDay } from "../../utils/officeClock";
import IsoBox from "./IsoBox";
import { project, shade } from "./isoMath";
import { clockHandAngles } from "./officeLifeUtils";
import "./officeLife.css";

interface PropPosition {
  x: number;
  y: number;
  z?: number;
}

// POTTED OFFICE PLANT IN A MODERN FACETED CERAMIC PLANTER WITH LUSH FOLIAGE
export function OfficePlant({ x, y, z = 0 }: PropPosition) {
  const canopy = project(x + 0.15, y + 0.15, z + 0.45);
  const potRim = project(x + 0.15, y + 0.15, z + 0.22);
  return (
    <g>
      {/* Faceted ceramic planter */}
      <IsoBox x={x} y={y} z={z} w={0.3} d={0.3} h={0.22} fillLeft="#1e293b" fillRight="#0f172a" fillTop="#334155" stroke="rgba(255,255,255,0.08)" highlightTop />
      {/* Dark soil bed */}
      <ellipse cx={potRim.x} cy={potRim.y} rx={9.5} ry={5.5} fill="#0f172a" />
      {/* Hydroponic sensor pip */}
      <circle cx={potRim.x + 6} cy={potRim.y - 2} r={0.8} fill="#10b981" />

      {/* Layered lush tropical foliage with organic depth */}
      {/* Deep shadow leaves */}
      <ellipse cx={canopy.x - 7} cy={canopy.y + 4} rx={8} ry={6.5} fill="url(#foliageDark)" />
      <ellipse cx={canopy.x + 7} cy={canopy.y + 3} rx={8} ry={6.5} fill="url(#foliageDark)" />
      {/* Mid canopy leaves */}
      <ellipse cx={canopy.x} cy={canopy.y + 2} rx={11} ry={8.5} fill="url(#foliageLight)" opacity={0.92} />
      <ellipse cx={canopy.x - 5} cy={canopy.y - 3} rx={9} ry={7} fill="url(#foliageLight)" opacity={0.95} />
      <ellipse cx={canopy.x + 5} cy={canopy.y - 4} rx={8.5} ry={6.5} fill="#16a34a" />
      {/* Leaf vein rib highlights */}
      <path d={`M ${canopy.x} ${canopy.y + 8} Q ${canopy.x - 3} ${canopy.y} ${canopy.x - 8} ${canopy.y - 5}`} stroke="rgba(255,255,255,0.25)" strokeWidth={0.7} fill="none" />
      <path d={`M ${canopy.x} ${canopy.y + 8} Q ${canopy.x + 4} ${canopy.y + 1} ${canopy.x + 8} ${canopy.y - 4}`} stroke="rgba(255,255,255,0.25)" strokeWidth={0.7} fill="none" />
    </g>
  );
}

// SMALL WASTE BIN, A QUIET DENSITY PROP FOR THE OPEN FLOOR
export function WasteBin({ x, y, z = 0 }: PropPosition) {
  return <IsoBox x={x} y={y} z={z} w={0.2} d={0.2} h={0.28} fillLeft="#334155" fillRight="#1e293b" fillTop="#475569" stroke="rgba(255,255,255,0.06)" />;
}

// WALL CLOCK, DRAWN IN SCREEN SPACE AT THE GIVEN ANCHOR. the hands follow the game hour (one tick is
// one game hour), so the clock on the wall agrees with the clock in the top bar
export function WallClock({ x, y, z = 0.6 }: PropPosition) {
  const p = project(x, y, z);
  const hour = useGameStore((s) => getHourOfDay(s.telemetry.tick));
  const angles = clockHandAngles(hour);
  // keep the angle growing across 12 o'clock so the hand never whips backwards through a full turn
  const turns = useRef({ last: angles.hour, extra: 0 });
  if (angles.hour < turns.current.last) turns.current.extra += 360;
  turns.current.last = angles.hour;
  const origin = `${p.x}px ${p.y}px`;
  return (
    <g>
      {/* Clock body with metallic chamfer bezel */}
      <circle cx={p.x} cy={p.y} r={8} fill="#0f172a" stroke="#38bdf8" strokeWidth={0.8} />
      <circle cx={p.x} cy={p.y} r={6.8} fill="#f8fafc" stroke="#1e293b" strokeWidth={0.6} />
      {[0, 90, 180, 270].map((deg) => (
        <line key={deg} x1={p.x} y1={p.y - 5.6} x2={p.x} y2={p.y - 4.4} stroke="#0f172a" strokeWidth={0.8} transform={`rotate(${deg} ${p.x} ${p.y})`} />
      ))}
      <line
        x1={p.x}
        y1={p.y}
        x2={p.x}
        y2={p.y - 3.2}
        stroke="#0f172a"
        strokeWidth={1.4}
        strokeLinecap="round"
        className="ol-clock-hand"
        style={{ transform: `rotate(${angles.hour + turns.current.extra}deg)`, transformOrigin: origin }}
      />
      <line
        x1={p.x}
        y1={p.y}
        x2={p.x}
        y2={p.y - 5.0}
        stroke="#0284c7"
        strokeWidth={0.9}
        strokeLinecap="round"
        className="ol-clock-hand"
        style={{ transform: `rotate(${angles.minute}deg)`, transformOrigin: origin }}
      />
      <circle cx={p.x} cy={p.y} r={1.0} fill="#0284c7" />
    </g>
  );
}

// MODERN ARCHITECTURAL SECTIONAL LOUNGE COUCH WITH OAK BASE & DESIGNER PILLOWS
export function Sofa({ x, y, z = 0 }: PropPosition) {
  return (
    <g>
      {/* Low oak wood reveal base */}
      <IsoBox x={x - 0.02} y={y - 0.02} z={z} w={1.34} d={0.59} h={0.04} color="#78350f" />
      <IsoBox x={x + 1.28} y={y - 0.02} z={z} w={0.59} d={0.59} h={0.04} color="#78350f" />

      {/* Main seat cushions in deep storm teal */}
      <IsoBox x={x} y={y} z={z + 0.04} w={1.3} d={0.55} h={0.2} fillLeft="#0f766e" fillRight="#115e59" fillTop="#14b8a6" stroke="rgba(255,255,255,0.06)" />
      <IsoBox x={x} y={y} z={z + 0.24} w={1.3} d={0.12} h={0.3} fillLeft="#0d9488" fillRight="#0f766e" fillTop="#2dd4bf" stroke="rgba(255,255,255,0.06)" />

      {/* Corner return section */}
      <IsoBox x={x + 1.3} y={y} z={z + 0.04} w={0.55} d={0.55} h={0.2} fillLeft="#0f766e" fillRight="#115e59" fillTop="#14b8a6" stroke="rgba(255,255,255,0.06)" />
      <IsoBox x={x + 1.3} y={y} z={z + 0.24} w={0.12} d={0.55} h={0.3} fillLeft="#0d9488" fillRight="#0f766e" fillTop="#2dd4bf" stroke="rgba(255,255,255,0.06)" />

      {/* Designer throw pillows */}
      <IsoBox x={x + 0.15} y={y + 0.02} z={z + 0.24} w={0.22} d={0.2} h={0.16} color="#f59e0b" stroke="rgba(255,255,255,0.12)" />
      <IsoBox x={x + 0.7} y={y + 0.02} z={z + 0.24} w={0.22} d={0.2} h={0.16} color="#06b6d4" stroke="rgba(255,255,255,0.12)" />
      <IsoBox x={x + 1.4} y={y + 0.2} z={z + 0.24} w={0.2} d={0.22} h={0.16} color="#ec4899" stroke="rgba(255,255,255,0.12)" />
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

// HIGH-TECH TEMPERED GLASS PC TOWER WITH RGB INTERIORS
export function PcTower({ x, y, z = 0 }: PropPosition) {
  const side = project(x + 0.08, y + 0.2, z + 0.15);
  return (
    <g>
      {/* Matte obsidian chassis */}
      <IsoBox x={x} y={y} z={z} w={0.16} d={0.22} h={0.32} fillLeft="#182334" fillRight="#0c1322" fillTop="#2a374a" stroke="rgba(255,255,255,0.08)" highlightTop />
      {/* Front vertical power strip */}
      <IsoBox x={x} y={y + 0.21} z={z + 0.04} w={0.02} d={0.01} h={0.24} color="#00f0ff" />
      {/* Side tempered glass panel showing interior components */}
      <ellipse cx={side.x + 2} cy={side.y} rx={3} ry={4} fill="#00f0ff" opacity={0.65} style={{ filter: "drop-shadow(0 0 2px #00f0ff)" }} />
      <circle cx={side.x + 2} cy={side.y} r={1.2} fill="#ffffff" opacity={0.8} />
    </g>
  );
}

// ARTICULATED ARCHITECT GOOSENECK TASK LAMP
export function DeskLamp({ x, y, z = 0 }: PropPosition) {
  const base = project(x + 0.05, y + 0.05, z);
  const head = project(x + 0.02, y + 0.08, z + 0.32);
  return (
    <g>
      {/* Weighted metallic base */}
      <circle cx={base.x} cy={base.y} r={3} fill="#0f172a" stroke="#475569" strokeWidth={0.5} />
      {/* Dual cantilever arm */}
      <line x1={base.x} y1={base.y} x2={base.x + 1} y2={base.y - 10} stroke="#475569" strokeWidth={1} />
      <line x1={base.x + 1} y1={base.y - 10} x2={head.x} y2={head.y} stroke="#64748b" strokeWidth={0.8} />
      {/* Lamp cone hood */}
      <ellipse cx={head.x} cy={head.y} rx={3.5} ry={2} fill="#334155" stroke="#94a3b8" strokeWidth={0.4} />
      {/* Soft downward light cone */}
      <ellipse cx={head.x} cy={head.y + 1} rx={2.2} ry={1.2} fill="#fef08a" opacity={0.95} />
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
      <IsoBox x={x} y={y} z={z} w={0.06} d={0.7} h={0.5} color="#0f172a" stroke="#334155" strokeWidth={0.5} />
      {bars.map((h, i) => (
        <rect key={i} x={screen.x - 10 + i * 5.5} y={screen.y + 8 - h * 16} width={3.6} height={h * 16} rx={0.6} fill={i % 2 === 0 ? "#38bdf8" : "#22c55e"} />
      ))}
    </g>
  );
}

// KITCHEN FRIDGE FOR THE BREAKROOM KITCHENETTE
export function Fridge({ x, y, z = 0 }: PropPosition) {
  return (
    <g>
      <IsoBox x={x} y={y} z={z} w={0.42} d={0.4} h={0.75} fillLeft="#cbd5e1" fillRight="#94a3b8" fillTop="#f8fafc" stroke="rgba(255,255,255,0.2)" />
      {/* Brushed aluminum handles */}
      <IsoBox x={x + 0.36} y={y - 0.02} z={z + 0.44} w={0.03} d={0.04} h={0.16} fillTop="url(#chromeMetal)" color="#64748b" />
      <IsoBox x={x + 0.36} y={y - 0.02} z={z + 0.16} w={0.03} d={0.04} h={0.16} fillTop="url(#chromeMetal)" color="#64748b" />
    </g>
  );
}

// COMMERCIAL DUAL-BOILER CHROME ESPRESSO MACHINE WITH PRESSURE GAUGES
export function EspressoMachine({ x, y, z = 0, steam = "light" }: PropPosition & { steam?: "off" | "light" | "full" }) {
  const spout = project(x + 0.07, y + 0.07, z + 0.36);
  const face = project(x + 0.13, y + 0.22, z + 0.18);
  const puffs = steam === "full" ? 3 : steam === "light" ? 1 : 0;
  return (
    <g>
      {/* Polished stainless steel chassis */}
      <IsoBox x={x} y={y} z={z} w={0.28} d={0.24} h={0.26} fillLeft="#94a3b8" fillRight="#64748b" fillTop="url(#chromeMetal)" stroke="rgba(255,255,255,0.3)" highlightTop />
      {/* Cup warmer rack on top with ceramic espresso cups */}
      <IsoBox x={x + 0.04} y={y + 0.04} z={z + 0.26} w={0.07} d={0.07} h={0.06} color="#f8fafc" stroke="#cbd5e1" strokeWidth={0.3} />
      <IsoBox x={x + 0.15} y={y + 0.04} z={z + 0.26} w={0.07} d={0.07} h={0.06} color="#f8fafc" stroke="#cbd5e1" strokeWidth={0.3} />

      {/* Front panel pressure gauges */}
      <circle cx={face.x - 4} cy={face.y - 2} r={2.2} fill="#f8fafc" stroke="#334155" strokeWidth={0.4} />
      <line x1={face.x - 4} y1={face.y - 2} x2={face.x - 3} y2={face.y - 3.5} stroke="#ef4444" strokeWidth={0.5} />
      <circle cx={face.x + 3} cy={face.y - 2} r={2.2} fill="#f8fafc" stroke="#334155" strokeWidth={0.4} />
      <line x1={face.x + 3} y1={face.y - 2} x2={face.x + 4.2} y2={face.y - 3.2} stroke="#0284c7" strokeWidth={0.5} />

      {/* Dual brass/copper group heads and drip tray */}
      <IsoBox x={x + 0.02} y={y + 0.2} z={z + 0.02} w={0.24} d={0.04} h={0.02} color="#475569" />

      {/* Rising steam clouds */}
      {Array.from({ length: puffs }).map((_, i) => (
        <ellipse
          key={i}
          cx={spout.x + (i - 1) * 2.2}
          cy={spout.y}
          rx={1.5}
          ry={2.5}
          fill="#f1f5f9"
          opacity={0.65}
          className="animate-steam-rise motion-only"
          style={{ animationDelay: `${i * 0.55}s` }}
        />
      ))}
    </g>
  );
}

// HEAVY GLASS SLIDING DOOR WITH AN ACCESS KEYPAD, MARKING THE SERVER VAULT ENTRANCE
export function SlidingGlassDoor({ x, y, z = 0, height = 0.95, open = false }: PropPosition & { height?: number; open?: boolean }) {
  const keypad = project(x + 0.28, y - 0.03, z + height * 0.5);
  return (
    <g>
      <g className="ol-door-slide" style={{ transform: open ? "translate(-10px, 5px)" : "translate(0, 0)" }}>
        <IsoBox x={x} y={y} z={z} w={0.05} d={0.5} h={height} color="#bae6fd" opacity={0.45} stroke="rgba(56,189,248,0.4)" strokeWidth={0.5} highlightTop />
      </g>
      <IsoBox x={x - 0.02} y={y - 0.02} z={z} w={0.02} d={0.02} h={height} color="#0f172a" />
      <IsoBox x={x - 0.02} y={y + 0.5} z={z} w={0.02} d={0.02} h={height} color="#0f172a" />
      {/* Biometric access terminal */}
      <rect x={keypad.x - 2.5} y={keypad.y - 4} width={5} height={8} rx={1} fill="#0f172a" stroke="#334155" strokeWidth={0.4} />
      <circle cx={keypad.x} cy={keypad.y - 1.5} r={1.2} fill={open ? "#00f0ff" : "#10b981"} />
    </g>
  );
}

// TOURNAMENT-GRADE PING-PONG TABLE: VIBRANT BLUE SURFACE WITH BOUNDARY LINES AND SUSPENDED NET
export function PingPongTable({ x, y, z = 0 }: PropPosition) {
  const width = 1.1;
  const depth = 0.6;
  const legHeight = 0.28;
  const topThickness = 0.04;
  const supportWidth = 0.14;
  return (
    <g>
      {/* Matte black tubular undercarriage */}
      <IsoBox x={x + 0.08} y={y + 0.06} z={z} w={supportWidth} d={depth - 0.12} h={legHeight} fillLeft="#1e293b" fillRight="#0f172a" fillTop="#334155" />
      <IsoBox x={x + width - supportWidth - 0.08} y={y + 0.06} z={z} w={supportWidth} d={depth - 0.12} h={legHeight} fillLeft="#1e293b" fillRight="#0f172a" fillTop="#334155" />

      {/* High-density tournament blue tabletop */}
      <IsoBox x={x} y={y} z={z + legHeight} w={width} d={depth} h={topThickness} fillLeft="#0369a1" fillRight="#075985" fillTop="#0284c7" stroke="#ffffff" strokeWidth={0.4} highlightTop />

      {/* Centerline stripe */}
      <IsoBox x={x} y={y + depth / 2 - 0.008} z={z + legHeight + topThickness} w={width} d={0.016} h={0.001} color="#ffffff" stroke="none" />

      {/* Suspended net across the midline */}
      <IsoBox
        x={x + width / 2 - 0.015}
        y={y - 0.02}
        z={z + legHeight + topThickness}
        w={0.03}
        d={depth + 0.04}
        h={0.14}
        color="#f8fafc"
        stroke="#cbd5e1"
        strokeWidth={0.3}
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

// LUXURY DESIGNER CLUB ARMCHAIR WITH CHROME BASE FOR THE VISITOR WAITING AREA
export function LobbyArmchair({ x, y, z = 0 }: PropPosition) {
  return (
    <g>
      {/* Chrome tubular frame legs */}
      <IsoBox x={x + 0.02} y={y + 0.02} z={z} w={0.03} d={0.03} h={0.08} fillTop="url(#chromeMetal)" color="#64748b" />
      <IsoBox x={x + 0.35} y={y + 0.02} z={z} w={0.03} d={0.03} h={0.08} fillTop="url(#chromeMetal)" color="#64748b" />
      <IsoBox x={x + 0.02} y={y + 0.35} z={z} w={0.03} d={0.03} h={0.08} fillTop="url(#chromeMetal)" color="#64748b" />
      <IsoBox x={x + 0.35} y={y + 0.35} z={z} w={0.03} d={0.03} h={0.08} fillTop="url(#chromeMetal)" color="#64748b" />

      {/* Cognac leather seat cushion */}
      <IsoBox x={x} y={y} z={z + 0.08} w={0.4} d={0.4} h={0.16} fillLeft="#78350f" fillRight="#9a3412" fillTop="#b45309" stroke="rgba(255,255,255,0.12)" highlightTop />
      {/* Backrest and side wings */}
      <IsoBox x={x} y={y + 0.32} z={z + 0.08} w={0.4} d={0.08} h={0.34} fillLeft="#78350f" fillRight="#9a3412" fillTop="#b45309" stroke="rgba(255,255,255,0.12)" />
      <IsoBox x={x} y={y} z={z + 0.08} w={0.08} d={0.4} h={0.24} fillLeft="#78350f" fillRight="#9a3412" fillTop="#b45309" stroke="rgba(255,255,255,0.12)" />
      <IsoBox x={x + 0.32} y={y} z={z + 0.08} w={0.08} d={0.4} h={0.24} fillLeft="#78350f" fillRight="#9a3412" fillTop="#b45309" stroke="rgba(255,255,255,0.12)" />
    </g>
  );
}

// TEMPERED SMOKED GLASS COFFEE TABLE WITH CHROME LEGS & TECH MAGAZINES
export function GlassCoffeeTable({ x, y, z = 0 }: PropPosition) {
  const top = project(x + 0.25, y + 0.2, z + 0.18);
  return (
    <g>
      {/* Chrome steel legs */}
      <IsoBox x={x} y={y} z={z} w={0.04} d={0.04} h={0.18} fillTop="url(#chromeMetal)" color="#64748b" />
      <IsoBox x={x + 0.46} y={y} z={z} w={0.04} d={0.04} h={0.18} fillTop="url(#chromeMetal)" color="#64748b" />
      <IsoBox x={x} y={y + 0.36} z={z} w={0.04} d={0.04} h={0.18} fillTop="url(#chromeMetal)" color="#64748b" />
      <IsoBox x={x + 0.46} y={y + 0.36} z={z} w={0.04} d={0.04} h={0.18} fillTop="url(#chromeMetal)" color="#64748b" />
      {/* Beveled glass tabletop */}
      <IsoBox x={x} y={y} z={z + 0.18} w={0.5} d={0.4} h={0.02} color="#bae6fd" opacity={0.55} stroke="rgba(56,189,248,0.5)" strokeWidth={0.5} highlightTop />
      {/* Tech journals / magazines */}
      <rect x={top.x - 7} y={top.y - 2} width={10} height={7} rx={0.6} fill="#ec4899" opacity={0.92} transform={`rotate(-12 ${top.x} ${top.y})`} />
      <rect x={top.x - 1} y={top.y - 1} width={10} height={7} rx={0.6} fill="#00f0ff" opacity={0.92} transform={`rotate(8 ${top.x} ${top.y})`} />
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
