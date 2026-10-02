import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import { Service } from "../../types/game";
import { deriveWorkerMood } from "./engineerMood";
import { DeskLamp, GroundShadow, PcTower, StickyNote } from "./OfficeProps";
import IsoBox from "./IsoBox";
import OfficeWorker, { WorkerMood } from "./OfficeWorker";
import { project } from "./isoMath";

interface EngineerDeskProps {
  service: Service;
  x: number;
  y: number;
  shirtColor: string;
  hairColor: string;
  glasses?: boolean;
  selected: boolean;
  onSelect: (serviceId: string) => void;
  onHover: (serviceId: string, evt: MouseEvent) => void;
  onLeave: () => void;
}

const RUN_ANIMATION_MS = 900;

// ISOMETRIC L-SHAPED DESK + MONITORS + ERGONOMIC CHAIR + ASSIGNED ENGINEER FOR ONE MICROSERVICE
export default function EngineerDesk({ service, x, y, shirtColor, hairColor, glasses, selected, onSelect, onHover, onLeave }: EngineerDeskProps) {
  const runAnimations = useGameStore((s) => s.runAnimations);
  const dismissRunAnimation = useGameStore((s) => s.dismissRunAnimation);
  const happiness = useGameStore((s) => s.telemetry.user_happiness);
  const engineer = useGameStore((s) => s.telemetry.engineers.find((e) => e.assigned_service_id === service.id));
  const triageIncidentId = useGameStore((s) => s.triageIncidentId);
  const activeIncidents = useGameStore((s) => s.telemetry.active_incidents);

  const ackAnim = runAnimations.find((a) => a.serviceId === service.id && a.kind === "acknowledge");
  const isMitigating = runAnimations.some((a) => a.serviceId === service.id && a.kind === "mitigate");
  const isInvestigating = activeIncidents.some((i) => i.id === triageIncidentId && i.service_id === service.id);
  const hasServiceIncident = activeIncidents.some((i) => i.service_id === service.id);
  const [dashing, setDashing] = useState(false);

  useEffect(() => {
    if (!ackAnim) return;
    setDashing(true);
    const timer = setTimeout(() => {
      setDashing(false);
      dismissRunAnimation(ackAnim.id);
    }, RUN_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [ackAnim, dismissRunAnimation]);

  const hasActiveAlarm = service.status === "down" || service.status === "degraded" || hasServiceIncident;
  // a real assigned engineer's own stress/stamina/on-call state drives their mood; a desk with no
  // engineer on record falls back to the previous service-status/global-happiness heuristic
  let mood: WorkerMood;
  if (engineer) {
    mood = deriveWorkerMood(engineer, hasActiveAlarm, isInvestigating, isMitigating);
  } else {
    mood = "idle";
    if (hasActiveAlarm) mood = "panic";
    else if (isInvestigating || isMitigating) mood = "running";
    else if (happiness < 40) mood = "tired";
  }

  const screenLit = service.status !== "healthy" || Boolean(ackAnim) || isInvestigating || isMitigating;
  const monitorColor =
    service.status === "down"
      ? "#ef4444"
      : isMitigating
      ? "#10b981"
      : isInvestigating
      ? "#f59e0b"
      : screenLit
      ? "#38bdf8"
      : "#1e293b";
  const grommet = project(x + 0.85, y + 0.28, 0.03);

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
      className="cursor-pointer transition-transform duration-300 ease-out"
      style={{ transform: dashing ? "translate(-10px, -14px)" : "translate(0, 0)" }}
    >
      <GroundShadow x={x + 0.5} y={y + 0.45} rx={22} ry={11} />

      {/* selection highlight pad on the shared floor */}
      <IsoBox x={x - 0.08} y={y - 0.08} z={0.024} w={1.16} d={0.96} h={0.015} color="#93c5fd" opacity={selected ? 0.9 : 0} />

      {/* main desk surface plus a perpendicular return, forming an l-shaped workstation */}
      <IsoBox x={x} y={y} z={0.03} w={1.0} d={0.55} h={0.28} color="#b98a5a" />
      <IsoBox x={x + 0.82} y={y + 0.55} z={0.03} w={0.32} d={0.42} h={0.28} color="#a97c50" />

      {/* under-desk pc tower */}
      <PcTower x={x + 0.05} y={y + 0.42} />

      {/* wire grommet where cables drop through the desk */}
      <circle cx={grommet.x} cy={grommet.y} r={1.6} fill="#1e293b" opacity={0.7} />

      {/* dual monitors */}
      <IsoBox x={x + 0.12} y={y + 0.08} z={0.31} w={0.28} d={0.06} h={0.22} color={monitorColor} />
      <IsoBox x={x + 0.55} y={y + 0.08} z={0.31} w={0.28} d={0.06} h={0.22} color={monitorColor} />
      {screenLit && (
        <rect
          x={project(x + 0.12, y + 0.08, 0.31 + 0.22).x - 6}
          y={project(x + 0.12, y + 0.08, 0.31 + 0.22).y}
          width={12}
          height={4}
          rx={1}
          fill={monitorColor}
          opacity={0.25}
        />
      )}
      <StickyNote x={x + 0.58} y={y + 0.08} z={0.33} />
      <DeskLamp x={x + 0.9} y={y + 0.1} />

      {/* ergonomic chair: seat plus a curved backrest */}
      <IsoBox x={x + 0.32} y={y + 0.85} z={0} w={0.32} d={0.08} h={0.4} color="#1e293b" />
      <IsoBox x={x + 0.32} y={y + 0.85} z={0} w={0.32} d={0.32} h={0.22} color="#475569" />

      {engineer?.on_call_status === "resting" ? (
        <g>
          <text
            x={project(x + 0.5, y + 0.72, 0.35).x}
            y={project(x + 0.5, y + 0.72, 0.35).y}
            textAnchor="middle"
            fill="#38bdf8"
            className="animate-pulse"
            style={{ fontSize: 6.5, fontWeight: 800, fontFamily: "monospace" }}
          >
            ☕ ON BREAK
          </text>
        </g>
      ) : (
        <OfficeWorker
          x={x + 0.5}
          y={y + 0.72}
          z={0.24}
          shirtColor={shirtColor}
          hairColor={hairColor}
          mood={ackAnim ? "running" : mood}
          role="engineer"
          seated={!ackAnim}
          glasses={glasses}
          badge
          glowColor={screenLit ? monitorColor : undefined}
          name={engineer?.name}
          workerStatusText={engineer ? `${engineer.core_competency.toUpperCase()} · ${engineer.on_call_status}` : undefined}
        />
      )}
    </g>
  );
}
