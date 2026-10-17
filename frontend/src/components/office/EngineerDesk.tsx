import type { MouseEvent } from "react";
import { memo, useEffect } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { Service } from "../../types/game";
import { getHourOfDay } from "../../utils/officeClock";
import { DeskLamp, GroundShadow, PcTower, StickyNote } from "./OfficeProps";
import IsoBox from "./IsoBox";
import { deskScreenColor, isNightHour } from "./officeLifeUtils";
import { useRosterStage } from "./rosterStage";
import { seatNodeId } from "./waypointGraph";
import { project } from "./isoMath";
import "./officeLife.css";

interface EngineerDeskProps {
  service: Service;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (serviceId: string) => void;
  onHover: (serviceId: string, evt: MouseEvent) => void;
  onLeave: () => void;
}

const ACK_ANIMATION_MS = 900;

// lighter shade of the screen colour for the scrolling "text" bars
const BAR_COLOR: Record<string, string> = {
  "#ef4444": "#fee2e2",
  "#10b981": "#d1fae5",
  "#f59e0b": "#fef3c7",
  "#38bdf8": "#e0f2fe",
};

// lit monitor face: three bars that scale in and out at different speeds, skewed to sit on the
// isometric face (the local x axis runs along the face's slope)
function MonitorBars({ x, y, z, seed, color }: { x: number; y: number; z: number; seed: number; color: string }) {
  const base = project(x, y + 0.06, z);
  const bars = [
    { top: -3.4, width: 6.2, dur: 1.7 },
    { top: -6.6, width: 5.0, dur: 2.3 },
    { top: -9.8, width: 6.8, dur: 1.4 },
  ];
  return (
    <g transform={`translate(${base.x} ${base.y}) matrix(1 0.5 0 1 0 0)`} opacity={0.9}>
      {bars.map((bar, i) => (
        <rect
          key={i}
          x={1}
          y={bar.top}
          width={bar.width}
          height={1.3}
          rx={0.4}
          fill={BAR_COLOR[color] ?? "#e0f2fe"}
          className="ol-bar"
          style={{ animationDuration: `${bar.dur}s`, animationDelay: `-${((seed * 0.37 + i * 0.61) % bar.dur).toFixed(2)}s` }}
        />
      ))}
    </g>
  );
}

// ISOMETRIC L-SHAPED DESK, MONITORS AND CHAIR FOR ONE MICROSERVICE. the desk is furniture only: the
// engineer who works here is a walking sprite (rosterStage) that sits down once they arrive, and a
// desk nobody is assigned to shows a quiet vacancy marker instead of a made-up occupant.
function EngineerDesk({ service, x, y, selected, onSelect, onHover, onLeave }: EngineerDeskProps) {
  const t = useTranslation();
  const dismissRunAnimation = useGameStore((s) => s.dismissRunAnimation);
  const assigned = useGameStore((s) => s.telemetry.engineers.some((e) => e.assigned_service_id === service.id));
  const night = useGameStore((s) => isNightHour(getHourOfDay(s.telemetry.tick)));
  const ackAnim = useGameStore((s) => s.runAnimations.find((a) => a.serviceId === service.id && a.kind === "acknowledge"));
  const mitigating = useGameStore((s) => s.runAnimations.some((a) => a.serviceId === service.id && a.kind === "mitigate"));
  const investigating = useGameStore((s) =>
    s.telemetry.active_incidents.some((i) => i.id === s.triageIncidentId && i.service_id === service.id)
  );
  const seated = useRosterStage((s) => s.walkers.some((w) => w.seated && w.nodeId === seatNodeId(service.id)));

  // the acknowledge pulse is consumed by the engineer sprite; the desk (always mounted) retires it
  useEffect(() => {
    if (!ackAnim) return;
    const timer = setTimeout(() => dismissRunAnimation(ackAnim.id), ACK_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [ackAnim, dismissRunAnimation]);

  const monitorColor = assigned
    ? deskScreenColor({ status: service.status, investigating, mitigating, engineerPresent: seated })
    : null;
  const grommet = project(x + 0.85, y + 0.28, 0.03);
  const monitorGlow = project(x + 0.4, y + 0.14, 0.42);
  const chair = project(x + 0.48, y + 0.98, 0.02);
  const vacantLabel = project(x + 0.48, y + 0.98, 0.5);

  return (
    <g
      data-service-id={service.id}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(service.id);
      }}
      onMouseEnter={(e) => onHover(service.id, e)}
      onMouseMove={(e) => onHover(service.id, e)}
      onMouseLeave={onLeave}
      className="cursor-pointer"
    >
      <GroundShadow x={x + 0.5} y={y + 0.45} rx={22} ry={11} />

      {/* selection highlight pad on the shared floor */}
      <IsoBox x={x - 0.08} y={y - 0.08} z={0.024} w={1.16} d={0.96} h={0.015} color="#93c5fd" opacity={selected ? 0.9 : 0} />

      {/* Modern dark carbon / graphite workstation desk with chamfered edge */}
      <IsoBox x={x} y={y} z={0.03} w={1.0} d={0.55} h={0.28} fillLeft="url(#carbonDeskFace)" fillRight="url(#carbonDeskFace)" fillTop="url(#carbonDeskTop)" stroke="rgba(255,255,255,0.08)" highlightTop />
      <IsoBox x={x + 0.82} y={y + 0.55} z={0.03} w={0.32} d={0.42} h={0.28} fillLeft="url(#carbonDeskFace)" fillRight="url(#carbonDeskFace)" fillTop="url(#carbonDeskTop)" stroke="rgba(255,255,255,0.08)" highlightTop />

      {/* Under-desk high-performance PC tower with RGB fan */}
      <PcTower x={x + 0.05} y={y + 0.42} />

      {/* Wire grommet where braided cables drop through the desk */}
      <circle cx={grommet.x} cy={grommet.y} r={1.6} fill="#0f172a" stroke="#334155" strokeWidth={0.5} opacity={0.8} />

      {/* Neon-edge RGB deskpad */}
      <IsoBox
        x={x + 0.08}
        y={y + 0.12}
        z={0.311}
        w={0.76}
        d={0.34}
        h={0.005}
        fillLeft="#090d16"
        fillRight="#090d16"
        fillTop="#0f172a"
        stroke={monitorColor ? monitorColor : "rgba(56,189,248,0.4)"}
        strokeWidth={0.5}
      />

      {/* Articulated dual monitor stand behind screens */}
      <IsoBox x={x + 0.46} y={y + 0.05} z={0.31} w={0.04} d={0.04} h={0.24} color="#334155" />

      {/* Dual high-tech ultra-thin monitors: primary widescreen + secondary wing display */}
      <IsoBox x={x + 0.1} y={y + 0.07} z={0.31} w={0.32} d={0.05} h={0.24} color={monitorColor ?? "#0f172a"} stroke="#1e293b" highlightTop />
      <IsoBox x={x + 0.52} y={y + 0.07} z={0.31} w={0.32} d={0.05} h={0.24} color={monitorColor ?? "#0f172a"} stroke="#1e293b" highlightTop />
      {monitorColor && (
        <>
          <MonitorBars x={x + 0.1} y={y + 0.07} z={0.31} seed={x * 3 + y} color={monitorColor} />
          <MonitorBars x={x + 0.52} y={y + 0.07} z={0.31} seed={x * 3 + y + 2} color={monitorColor} />
          <ellipse
            cx={monitorGlow.x + 9}
            cy={monitorGlow.y + 4}
            rx={night ? 22 : 15}
            ry={night ? 11 : 7}
            fill={monitorColor}
            opacity={night ? 0.3 : 0.12}
          />
        </>
      )}
      <StickyNote x={x + 0.58} y={y + 0.08} z={0.34} />
      <DeskLamp x={x + 0.9} y={y + 0.1} />

      {/* Ergonomic mesh chair: 5-star wheeled base, chrome cylinder, contoured seat & breathable backrest */}
      <circle cx={chair.x} cy={chair.y} r={4.5} fill="#0f172a" stroke="#334155" strokeWidth={0.6} />
      <IsoBox x={x + 0.46} y={y + 0.96} z={0.01} w={0.04} d={0.04} h={0.16} fillTop="url(#chromeMetal)" color="#64748b" />
      <IsoBox x={x + 0.32} y={y + 0.85} z={0.17} w={0.32} d={0.26} h={0.07} fillLeft="#1e293b" fillRight="#0f172a" fillTop="#334155" stroke="rgba(255,255,255,0.08)" highlightTop />
      <IsoBox x={x + 0.32} y={y + 0.85} z={0.24} w={0.32} d={0.07} h={0.32} fillLeft="#0f172a" fillRight="#1e293b" fillTop="#334155" stroke="rgba(255,255,255,0.08)" />
      {/* Headrest */}
      <IsoBox x={x + 0.38} y={y + 0.85} z={0.56} w={0.2} d={0.05} h={0.08} color="#1e293b" stroke="#334155" />

      {/* vacancy marker: a dashed outline on the empty chair and a muted tag */}
      {!assigned && (
        <g opacity={0.6} pointerEvents="none">
          <ellipse cx={chair.x} cy={chair.y - 6} rx={9} ry={4.5} fill="none" stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="2 2" />
          <text
            x={vacantLabel.x}
            y={vacantLabel.y - 6}
            textAnchor="middle"
            fill="#94a3b8"
            style={{ fontSize: 5, fontWeight: 700, fontFamily: "monospace", letterSpacing: "0.12em" }}
          >
            {t.officeLife.vacantDesk}
          </text>
        </g>
      )}
    </g>
  );
}

export default memo(EngineerDesk);
