import { useEffect, useState } from "react";
import { useRedAlert } from "../../hooks/useRedAlert";
import BoardroomMetricsDisplay from "./BoardroomMetricsDisplay";
import { GroundShadow } from "./OfficeProps";
import IsoBox from "./IsoBox";
import IsoFaceDecal from "./IsoFaceDecal";
import OfficeWorker from "./OfficeWorker";

interface BoardRoomProps {
  originX: number;
  originY: number;
}

// how long the executives take to cross the room; they sit back down only once they have arrived
const EXEC_WALK_MS = 1400;

// rolling whiteboard geometry: the board box is 0.52 wide, 0.04 deep and 0.46 tall from z=0.04,
// so its viewer-facing plane sits at y + 0.04 and spans ~16.6 x 25.8 screen px
const WB_FRONT_Y = 1.55 + 0.04;
const WB_TOP_Z = 0.04 + 0.46;
const INK = "#1e3a5f";

// pixel C4 sketch in whiteboard-local px (u across, v down), every coordinate on a whole or half
// pixel so crispEdges lands it on the grid; sized to stay inside the 16px-wide board face
function C4Sketch({ x, y, z, redAlert }: { x: number; y: number; z: number; redAlert: boolean }) {
  const svcB = redAlert ? { fill: "#dc2626", stroke: "#f87171" } : { fill: "#059669", stroke: "#34d399" };
  return (
    <IsoFaceDecal x={x} y={y} z={z} axis="x" opacity={0.9}>
      {/* title scribble */}
      <rect x={1.5} y={1.5} width={6} height={0.75} fill={INK} opacity={0.6} />
      {/* api gateway */}
      <rect x={5} y={3.5} width={6} height={3} fill="#0284c7" stroke="#38bdf8" strokeWidth={0.5} />
      {/* fan-out connectors */}
      <rect x={7.75} y={6.5} width={0.5} height={2} fill={INK} />
      <rect x={3.5} y={8.5} width={9.5} height={0.5} fill={INK} />
      <rect x={3.5} y={8.5} width={0.5} height={1.5} fill={INK} />
      <rect x={12.5} y={8.5} width={0.5} height={1.5} fill={INK} />
      {/* two services */}
      <rect x={1.5} y={10} width={4.5} height={3} fill="#059669" stroke="#34d399" strokeWidth={0.5} />
      <rect x={10.5} y={10} width={4.5} height={3} fill={svcB.fill} stroke={svcB.stroke} strokeWidth={0.5} />
      {/* fan-in to the datastore */}
      <rect x={3.5} y={13} width={0.5} height={2} fill={INK} />
      <rect x={12.5} y={13} width={0.5} height={2} fill={INK} />
      <rect x={3.5} y={14.5} width={9.5} height={0.5} fill={INK} />
      <rect x={7.75} y={15} width={0.5} height={1} fill={INK} />
      {/* datastore cylinder: body plus a lighter lid band */}
      <rect x={5.5} y={16} width={5} height={4} fill="#d97706" stroke="#fbbf24" strokeWidth={0.5} />
      <rect x={5.5} y={16} width={5} height={1} fill="#fbbf24" />
      {/* incident marker over the failing service */}
      {redAlert && <rect className="animate-blink" x={14} y={8.5} width={1.5} height={1.5} fill="#ef4444" />}
    </IsoFaceDecal>
  );
}

// EXECUTIVE BOARDROOM WITH A LARGE CONFERENCE TABLE, LEATHER CHAIRS AND A LIVE METRICS TV
export default function BoardRoom({ originX, originY }: BoardRoomProps) {
  // on red alert the executives get up and stand at the metrics tv
  const redAlert = useRedAlert();
  const [seatedBack, setSeatedBack] = useState(!redAlert);
  useEffect(() => {
    if (redAlert) {
      setSeatedBack(false);
      return;
    }
    const timer = setTimeout(() => setSeatedBack(true), EXEC_WALK_MS);
    return () => clearTimeout(timer);
  }, [redAlert]);

  return (
    <g>
      {/* Architectural glass rolling whiteboard */}
      <IsoBox x={originX + 0.15} y={originY + 1.55} z={0.04} w={0.52} d={0.04} h={0.46} color="#bae6fd" opacity={0.5} stroke="rgba(56,189,248,0.4)" strokeWidth={0.5} highlightTop />
      {/* Aluminum base with castor wheels */}
      <IsoBox x={originX + 0.13} y={originY + 1.53} z={0} w={0.56} d={0.08} h={0.04} fillLeft="#1e293b" fillRight="#0f172a" fillTop="#334155" />
      {/* Aluminum frame & marker tray */}
      <IsoBox x={originX + 0.15} y={originY + 1.53} z={0.04} w={0.52} d={0.02} h={0.015} fillTop="url(#chromeMetal)" color="#64748b" />

      {/* SRE C4 container diagram sketched on the whiteboard, laid flat on its front face: gateway on
          top, two services, a datastore underneath. On red alert the failing service is marked. */}
      <C4Sketch x={originX + 0.15} y={originY + WB_FRONT_Y} z={WB_TOP_Z} redAlert={redAlert} />

      {/* wall-mounted live metrics tv: p99 latency, throughput and error-rate sparklines */}
      <BoardroomMetricsDisplay x={originX + 3.0} y={originY + 0.05} z={0.55} hasP1={redAlert} />

      <GroundShadow x={originX + 1.5} y={originY + 1.05} rx={34} ry={16} />

      {/* Large executive conference table: heavy architectural metal pedestal */}
      <IsoBox x={originX + 0.8} y={originY + 0.8} z={0.02} w={1.3} d={0.4} h={0.2} fillLeft="#1e293b" fillRight="#0f172a" fillTop="#334155" highlightTop />

      {/* Smoked tempered glass tabletop with polished beveled edge */}
      <IsoBox x={originX + 0.5} y={originY + 0.65} z={0.22} w={1.9} d={0.7} h={0.03} fillLeft="#0f172a" fillRight="#1e293b" fillTop="url(#boardroomGlassTop)" stroke="rgba(56,189,248,0.5)" strokeWidth={0.6} highlightTop />

      {/* Inlaid cyber-telemetry data runner strip */}
      <IsoBox x={originX + 0.6} y={originY + 0.95} z={0.25} w={1.7} d={0.1} h={0.005} fillTop="#00f0ff" stroke="#38bdf8" strokeWidth={0.4} />

      {/* Executive high-back ribbed leather chairs with chrome frames */}
      {[0.4, 1.1, 1.8].map((chairX, idx) => (
        <g key={idx}>
          <IsoBox x={originX + chairX + 0.1} y={originY + 1.53} z={0} w={0.04} d={0.04} h={0.16} fillTop="url(#chromeMetal)" color="#64748b" />
          <IsoBox x={originX + chairX} y={originY + 1.45} z={0.16} w={0.24} d={0.2} h={0.06} fillLeft="#18181b" fillRight="#0f172a" fillTop="#27272a" stroke="#3f3f46" strokeWidth={0.4} highlightTop />
          <IsoBox x={originX + chairX} y={originY + 1.45} z={0.22} w={0.24} d={0.06} h={0.26} fillLeft="#0f172a" fillRight="#18181b" fillTop="#27272a" stroke="#3f3f46" strokeWidth={0.4} />
        </g>
      ))}
      {/* End captain chair */}
      <IsoBox x={originX + 2.5} y={originY + 0.55} z={0.16} w={0.2} d={0.24} h={0.06} fillLeft="#18181b" fillRight="#0f172a" fillTop="#27272a" stroke="#3f3f46" strokeWidth={0.4} highlightTop />
      <IsoBox x={originX + 2.64} y={originY + 0.55} z={0.22} w={0.06} d={0.24} h={0.26} fillLeft="#0f172a" fillRight="#18181b" fillTop="#27272a" stroke="#3f3f46" strokeWidth={0.4} />

      <OfficeWorker
        x={redAlert ? originX + 2.95 : originX + 0.52}
        y={redAlert ? originY + 0.75 : originY + 1.35}
        z={redAlert || !seatedBack ? 0 : 0.24}
        shirtColor="#1f2937"
        hairColor="#1c1917"
        role="executive"
        seated={!redAlert && seatedBack}
        facing="right"
        transitionMs={EXEC_WALK_MS}
        mood={redAlert ? "panic" : "idle"}
        // at the tv: one jabs a finger at the failing graph...
        action={redAlert ? "point" : undefined}
      />
      <OfficeWorker
        x={redAlert ? originX + 3.3 : originX + 1.22}
        y={redAlert ? originY + 0.95 : originY + 1.35}
        z={redAlert || !seatedBack ? 0 : 0.24}
        shirtColor="#374151"
        hairColor="#4a2e19"
        role="executive"
        seated={!redAlert && seatedBack}
        facing="right"
        transitionMs={EXEC_WALK_MS}
        mood={redAlert ? "panic" : "idle"}
        // ...the other taps a foot, hands on hips
        action={redAlert ? "stomp" : undefined}
      />

      {/* standing visitor with a briefcase */}
      <OfficeWorker x={originX + 1.7} y={originY + 1.5} shirtColor="#111827" hairColor="#1c1917" role="executive" mood="idle" />
      <IsoBox x={originX + 1.85} y={originY + 1.55} z={0} w={0.18} d={0.1} h={0.14} color="#78350f" />
    </g>
  );
}
