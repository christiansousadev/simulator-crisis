import type { CSSProperties, MouseEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Wrench } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { useGameStore } from "../../store/useGameStore";
import { IncidentSeverity, Service } from "../../types/game";
import { severityTone } from "../../utils/severity";
import { GroundShadow } from "./OfficeProps";
import IsoBox from "./IsoBox";
import { Z_SCALE, project } from "./isoMath";
import { CABINET_COLOR, LED_COLOR, ledPatternFor, ledPhaseMs } from "./officeLifeUtils";
import "./officeLife.css";

interface ServerRackProps {
  service: Service;
  x: number;
  y: number;
  selected: boolean;
  /** highest-severity active incident currently open against this service, if any */
  severity?: IncidentSeverity;
  /** true while this service's incident is open in the log-triage terminal */
  investigating?: boolean;
  /** true while the incident-detail modal is focused on a different service, to reduce visual competition */
  dimmed?: boolean;
  onSelect: (serviceId: string) => void;
  onHover: (serviceId: string, evt: MouseEvent) => void;
  onLeave: () => void;
}

// solid-fill alert badge tones per severity
const ALERT_BADGE_TONE: Record<IncidentSeverity, string> = {
  P1_CRITICAL: "bg-rose-500 border-rose-600 text-white shadow-[0_0_10px_rgba(244,63,94,0.7)]",
  P2_HIGH: "bg-amber-400 border-amber-500 text-amber-950 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
  P3_MEDIUM: "bg-yellow-300 border-yellow-400 text-yellow-900 shadow-[0_0_6px_rgba(253,224,71,0.5)]",
  P4_LOW: "bg-slate-300 border-slate-400 text-slate-800",
};

const MITIGATE_SHOWN_MS = 2600;
const RAISED_FLASH_MS = 500;
const FX_FADE_MS = 600;

// footprint and height tuned to roughly 1.8-2x a standing office worker sprite (~38px tall)
const RACK_WIDTH = 0.55;
const RACK_DEPTH = 0.55;
const RACK_HEIGHT_STANDARD = 1.2;
const RACK_HEIGHT_CRITICAL = 1.4;

const LED_COUNT = 3;
const LED_PERIOD_MS: Record<"breathe" | "stutter", number> = { breathe: 3200, stutter: 1700 };

type BadStatus = "degraded" | "down";

// HIGH-TECH 42U ENTERPRISE SERVER CABINET REPRESENTING ONE MICROSERVICE:
// Multi-blade server trays (1U/2U), glowing fiber patch leads, smoked tempered glass door with specular sheen,
// floating holographic telemetry reticle, and staged incident/recovery VFX.
function ServerRack({ service, x, y, selected, severity, investigating, dimmed, onSelect, onHover, onLeave }: ServerRackProps) {
  const t = useTranslation();
  const dismissRunAnimation = useGameStore((s) => s.dismissRunAnimation);
  const raisedAnim = useGameStore((s) => s.runAnimations.find((a) => a.serviceId === service.id && a.kind === "raised"));
  const mitigateAnim = useGameStore((s) => s.runAnimations.find((a) => a.serviceId === service.id && a.kind === "mitigate"));
  const failAnim = useGameStore((s) => s.runAnimations.find((a) => a.serviceId === service.id && a.kind === "fail"));
  const recoverAnim = useGameStore((s) => s.runAnimations.find((a) => a.serviceId === service.id && a.kind === "recover"));
  const hasPredictiveDetection = useGameStore((s) => s.telemetry.purchased_upgrades.includes("predictive_anomaly_detection"));
  const sevTone = severity ? severityTone(severity) : null;
  const status = service.status;

  useEffect(() => {
    if (!raisedAnim) return;
    const timer = setTimeout(() => dismissRunAnimation(raisedAnim.id), RAISED_FLASH_MS);
    return () => clearTimeout(timer);
  }, [raisedAnim, dismissRunAnimation]);

  const handedOff = Boolean(recoverAnim);
  useEffect(() => {
    if (!mitigateAnim) return;
    const timer = setTimeout(() => dismissRunAnimation(mitigateAnim.id), handedOff ? 0 : MITIGATE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [mitigateAnim, handedOff, dismissRunAnimation]);

  const [prevStatus, setPrevStatus] = useState(status);
  const [held, setHeld] = useState<BadStatus | null>(null);
  if (prevStatus !== status) {
    setPrevStatus(status);
    const calmer = status === "healthy" || (prevStatus === "down" && status === "degraded");
    setHeld(prevStatus !== "healthy" && calmer ? prevStatus : null);
  }
  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => setHeld(null), FX_FADE_MS + 50);
    return () => clearTimeout(timer);
  }, [held]);

  const lastBad = useRef<BadStatus>("down");
  if (status !== "healthy") lastBad.current = status;
  const spunUp = useRef(false);
  if (status !== "healthy") spunUp.current = false;
  else if (recoverAnim) spunUp.current = true;

  const isAnomalous = hasPredictiveDetection && status === "healthy" && (service.latency_ms > 110 || service.error_rate > 0.012);

  const height = service.tier === "critical" ? RACK_HEIGHT_CRITICAL : RACK_HEIGHT_STANDARD;
  const pattern = ledPatternFor(status);
  const booting = status === "healthy" && Boolean(recoverAnim);

  // primary diagnosis LEDs
  const ledPoints = useMemo(
    () => Array.from({ length: LED_COUNT }).map((_, i) => project(x + RACK_WIDTH * 0.75, y + RACK_DEPTH, height * 0.35 + i * 0.22 + 0.1)),
    [x, y, height]
  );

  // blade server bays on the front face (y + RACK_DEPTH)
  const bladeCount = service.tier === "critical" ? 8 : 7;
  const bladeHeight = 0.11;
  const bladeGap = 0.022;
  const bladeStartY = 0.1;

  const blades = useMemo(() => {
    return Array.from({ length: bladeCount }).map((_, i) => {
      const bz = bladeStartY + i * (bladeHeight + bladeGap);
      const topLeft = project(x + 0.04, y + RACK_DEPTH, bz + bladeHeight);
      const topRight = project(x + RACK_WIDTH - 0.04, y + RACK_DEPTH, bz + bladeHeight);
      const bottomRight = project(x + RACK_WIDTH - 0.04, y + RACK_DEPTH, bz);
      const bottomLeft = project(x + 0.04, y + RACK_DEPTH, bz);
      const points = `${topLeft.x},${topLeft.y} ${topRight.x},${topRight.y} ${bottomRight.x},${bottomRight.y} ${bottomLeft.x},${bottomLeft.y}`;

      const leftHandle = project(x + 0.07, y + RACK_DEPTH, bz + bladeHeight * 0.5);
      const rightHandle = project(x + RACK_WIDTH - 0.07, y + RACK_DEPTH, bz + bladeHeight * 0.5);
      const pwrLed = project(x + RACK_WIDTH - 0.13, y + RACK_DEPTH, bz + bladeHeight * 0.5);
      const actLed = project(x + RACK_WIDTH - 0.17, y + RACK_DEPTH, bz + bladeHeight * 0.5);
      const ventA = project(x + 0.16, y + RACK_DEPTH, bz + bladeHeight * 0.5);
      const ventB = project(x + 0.23, y + RACK_DEPTH, bz + bladeHeight * 0.5);
      const ventC = project(x + 0.30, y + RACK_DEPTH, bz + bladeHeight * 0.5);

      return {
        id: i,
        points,
        leftHandle,
        rightHandle,
        pwrLed,
        actLed,
        vents: [ventA, ventB, ventC],
      };
    });
  }, [x, y, bladeCount]);

  // front tinted glass door polygon
  const glassPoints = useMemo(() => {
    const tl = project(x + 0.02, y + RACK_DEPTH + 0.005, height - 0.04);
    const tr = project(x + RACK_WIDTH - 0.02, y + RACK_DEPTH + 0.005, height - 0.04);
    const br = project(x + RACK_WIDTH - 0.02, y + RACK_DEPTH + 0.005, 0.05);
    const bl = project(x + 0.02, y + RACK_DEPTH + 0.005, 0.05);
    return `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;
  }, [x, y, height]);

  // fiber patch leads curving from top switch
  const fiberCables = useMemo(() => {
    const sw1 = project(x + 0.20, y + RACK_DEPTH, height - 0.06);
    const sw2 = project(x + 0.32, y + RACK_DEPTH, height - 0.06);
    const target1 = project(x + 0.36, y + RACK_DEPTH, bladeStartY + (bladeHeight + bladeGap) * 2);
    const target2 = project(x + 0.38, y + RACK_DEPTH, bladeStartY + (bladeHeight + bladeGap) * 4);

    return [
      `M ${sw1.x},${sw1.y} Q ${sw1.x + 8},${(sw1.y + target1.y) / 2} ${target1.x},${target1.y}`,
      `M ${sw2.x},${sw2.y} Q ${sw2.x + 10},${(sw2.y + target2.y) / 2} ${target2.x},${target2.y}`,
    ];
  }, [x, y, height]);

  const bubbleAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height + 0.45);
  const wrenchAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height * 0.6);
  const fanAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height + 0.03);
  const sparkAnchor = project(x + RACK_WIDTH * 0.3, y + RACK_DEPTH, height * 0.55);
  const topAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height + 0.02);
  const floorReflectionAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, 0.025);
  const baseAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, 0);

  // scan bar: a chevron across the two visible faces
  const scanPoints = useMemo(() => {
    const z = 0.04;
    return [project(x, y + RACK_DEPTH, z), project(x + RACK_WIDTH, y + RACK_DEPTH, z), project(x + RACK_WIDTH, y, z)]
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
  }, [x, y]);

  // tactical hexagonal selection pad coordinates on the floor
  const hexPadPoints = useMemo(() => {
    const rad = 28;
    const pts = [];
    for (let a = 0; a < 6; a++) {
      const angle = (a * 60 * Math.PI) / 180;
      pts.push(`${baseAnchor.x + rad * Math.cos(angle)},${baseAnchor.y + (rad * 0.5) * Math.sin(angle)}`);
    }
    return pts.join(" ");
  }, [baseAnchor.x, baseAnchor.y]);

  const unhealthy = status !== "healthy";
  const showBadge = unhealthy || held !== null;
  const showDegradedFx = status === "degraded" || held === "degraded";
  const showDownFx = status === "down" || held === "down";
  const degradedFading = status !== "degraded";
  const downFading = status !== "down";
  const badgeFading = status === "healthy";
  const badgeStatus: BadStatus = unhealthy ? (status as BadStatus) : (held ?? "down");

  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onSelect(service.id);
      }}
      onMouseEnter={(e) => onHover(service.id, e)}
      onMouseMove={(e) => onHover(service.id, e)}
      onMouseLeave={onLeave}
      data-rack-service-id={service.id}
      className="cursor-pointer transition-opacity duration-300 select-none group"
      style={{ opacity: dimmed ? 0.35 : 1 }}
    >
      {/* ground shadow stays put during shake */}
      <GroundShadow x={x + RACK_WIDTH / 2} y={y + RACK_DEPTH / 2} rx={18} ry={9} />

      {/* tactical hexagonal selection pad on floor */}
      {selected && (
        <g pointerEvents="none" className="ol-hex-select">
          <polygon
            points={hexPadPoints}
            fill="none"
            stroke="#00f0ff"
            strokeWidth={1.4}
            strokeDasharray="6 3"
            opacity={0.8}
            style={{ filter: "drop-shadow(0 0 6px rgba(0,240,255,0.7))" }}
          />
          <polygon
            points={hexPadPoints}
            fill="rgba(6,182,212,0.15)"
            stroke="none"
          />
          {/* crosshair ticks at base */}
          <line x1={baseAnchor.x - 34} y1={baseAnchor.y} x2={baseAnchor.x - 22} y2={baseAnchor.y} stroke="#00f0ff" strokeWidth={1} opacity={0.7} />
          <line x1={baseAnchor.x + 22} y1={baseAnchor.y} x2={baseAnchor.x + 34} y2={baseAnchor.y} stroke="#00f0ff" strokeWidth={1} opacity={0.7} />
        </g>
      )}

      {/* localized floor reflection tinted by severity */}
      {sevTone ? (
        <ellipse
          cx={floorReflectionAnchor.x}
          cy={floorReflectionAnchor.y}
          rx={sevTone.urgent ? 24 : 20}
          ry={10}
          fill={sevTone.glow}
          opacity={sevTone.urgent ? 0.55 : 0.35}
          className="animate-glow-pulse"
        />
      ) : (
        status === "down" && (
          <ellipse
            cx={floorReflectionAnchor.x}
            cy={floorReflectionAnchor.y}
            rx={22}
            ry={10}
            fill="#ef4444"
            opacity={0.45}
            className="animate-glow-pulse"
          />
        )
      )}

      {/* CABINET ASSEMBLY: shakes once on failure */}
      <g className={failAnim ? "ol-rack-shake" : undefined}>
        {/* main high-tech brushed metal chassis with bevel highlight */}
        <IsoBox
          x={x}
          y={y}
          z={0.03}
          w={RACK_WIDTH}
          d={RACK_DEPTH}
          h={height}
          color={CABINET_COLOR[status]}
          fillLeft="url(#metallicRackFace)"
          fillRight="url(#metallicRackFace)"
          fillTop="url(#metallicRackTop)"
          highlightTop
          stroke="rgba(15,23,42,0.85)"
          strokeWidth={0.8}
          className="ol-tint"
        />

        {/* corner vertical pilasters & industrial bevel frames */}
        <line
          x1={project(x, y + RACK_DEPTH, 0.03).x}
          y1={project(x, y + RACK_DEPTH, 0.03).y}
          x2={project(x, y + RACK_DEPTH, height + 0.03).x}
          y2={project(x, y + RACK_DEPTH, height + 0.03).y}
          stroke="rgba(56,189,248,0.3)"
          strokeWidth={0.7}
        />
        <line
          x1={project(x + RACK_WIDTH, y + RACK_DEPTH, 0.03).x}
          y1={project(x + RACK_WIDTH, y + RACK_DEPTH, 0.03).y}
          x2={project(x + RACK_WIDTH, y + RACK_DEPTH, height + 0.03).x}
          y2={project(x + RACK_WIDTH, y + RACK_DEPTH, height + 0.03).y}
          stroke="rgba(56,189,248,0.2)"
          strokeWidth={0.7}
        />

        {/* INDIVIDUAL BLADE SERVER TRAYS */}
        {blades.map((b) => (
          <g key={b.id} className="transition-all duration-300">
            {/* blade tray front face */}
            <polygon
              points={b.points}
              fill="url(#bladeTrayFace)"
              stroke="rgba(30,41,59,0.7)"
              strokeWidth={0.4}
            />

            {/* release latch handles (chrome/steel) */}
            <rect x={b.leftHandle.x - 1} y={b.leftHandle.y - 1.8} width={1.8} height={3.6} rx={0.6} fill="url(#bladeHandle)" stroke="#1e293b" strokeWidth={0.2} />
            <rect x={b.rightHandle.x - 1} y={b.rightHandle.y - 1.8} width={1.8} height={3.6} rx={0.6} fill="url(#bladeHandle)" stroke="#1e293b" strokeWidth={0.2} />

            {/* ventilation micro-slits */}
            {b.vents.map((v, vi) => (
              <line key={vi} x1={v.x - 1.5} y1={v.y - 1} x2={v.x + 1.5} y2={v.y + 1} stroke="rgba(0,0,0,0.6)" strokeWidth={0.5} strokeLinecap="round" />
            ))}

            {/* blade power LED */}
            <circle cx={b.pwrLed.x} cy={b.pwrLed.y} r={0.8} fill={status === "down" ? "#ef4444" : status === "degraded" ? "#f59e0b" : "#10b981"} />

            {/* blade I/O activity micro-LED (simulates active data packets) */}
            <circle
              cx={b.actLed.x}
              cy={b.actLed.y}
              r={0.75}
              fill={status === "down" ? "#7f1d1d" : status === "degraded" ? "#f59e0b" : "#00f0ff"}
              className={status !== "down" ? "ol-blade-led" : undefined}
              style={{ animationDelay: `${(b.id * 130) % 650}ms` }}
            />
          </g>
        ))}

        {/* GLOWING FIBER OPTIC PATCH CABLES (routing down from top management switch) */}
        {fiberCables.map((d, fi) => (
          <path
            key={fi}
            d={d}
            fill="none"
            stroke={status === "down" ? "#ef4444" : status === "degraded" ? "#fbbf24" : "url(#fiberGlowCyan)"}
            strokeWidth={0.85}
            strokeDasharray="4 2"
            strokeLinecap="round"
            className="ol-dash-12"
            style={{ opacity: status === "down" ? 0.4 : 0.85, filter: status === "down" ? undefined : "drop-shadow(0 0 2px rgba(0,240,255,0.8))" }}
          />
        ))}

        {/* SMOKED ACRYLIC / TEMPERED GLASS DOOR WITH SPECULAR DIAGONAL SHEEN */}
        <polygon
          points={glassPoints}
          fill="url(#rackGlassSheen)"
          stroke="rgba(56,189,248,0.25)"
          strokeWidth={0.5}
          opacity={0.65}
          pointerEvents="none"
        />

        {/* PRIMARY STATUS DIAGNOSIS LEDS */}
        {ledPoints.map((p, i) => {
          const period = pattern === "solid" ? 0 : LED_PERIOD_MS[pattern];
          const patternClass = pattern === "breathe" ? "ol-led-healthy" : pattern === "stutter" ? "ol-led-stutter" : "";
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={2.2}
              fill={LED_COLOR[status]}
              className={`ol-led ${booting ? "ol-led-boot" : patternClass}`}
              style={
                {
                  filter: `drop-shadow(0 0 4px ${LED_COLOR[status]})`,
                  "--ol-led-from": LED_COLOR[lastBad.current],
                  animationDelay: booting ? `${150 + i * 200}ms` : period ? `${ledPhaseMs(service.id, i, period)}ms` : undefined,
                } as CSSProperties
              }
            />
          );
        })}

        {/* investigation beacon */}
        {investigating && (
          <circle
            cx={bubbleAnchor.x}
            cy={bubbleAnchor.y - 6}
            r={3.4}
            fill="#38bdf8"
            style={{ filter: "drop-shadow(0 0 6px rgba(56,189,248,0.95))" }}
            className="animate-beacon-flash"
          />
        )}

        {/* ROOFTOP COOLING TURBINE FAN WITH MULTI-BLADE ROTOR */}
        <g
          className={status !== "healthy" ? "" : spunUp.current ? "ol-fan-spinup" : "ol-fan"}
          style={{ transformOrigin: `${fanAnchor.x}px ${fanAnchor.y}px` }}
        >
          {/* outer turbine intake shroud */}
          <circle cx={fanAnchor.x} cy={fanAnchor.y} r={4.6} fill="#0f172a" stroke="#475569" strokeWidth={0.8} />
          {/* turbine blades */}
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <line
              key={deg}
              x1={fanAnchor.x}
              y1={fanAnchor.y}
              x2={fanAnchor.x + 4.2 * Math.cos((deg * Math.PI) / 180)}
              y2={fanAnchor.y + 4.2 * Math.sin((deg * Math.PI) / 180)}
              stroke="#94a3b8"
              strokeWidth={0.9}
              strokeLinecap="round"
            />
          ))}
          {/* center spinner hub */}
          <circle cx={fanAnchor.x} cy={fanAnchor.y} r={1.6} fill="#cbd5e1" />
        </g>

        {/* DEGRADED FAILURE FX: thin dark smoke */}
        {showDegradedFx && (
          <g className={degradedFading ? "ol-fx-fade motion-only" : undefined}>
            {[0, 0.5].map((delay, i) => (
              <circle
                key={`degraded-smoke-${i}`}
                cx={wrenchAnchor.x + (i - 0.5) * 3}
                cy={wrenchAnchor.y - 6}
                r={2.4}
                fill="#3f3f46"
                opacity={0.5}
                className="animate-smoke-rise"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </g>
        )}

        {/* DOWN CRITICAL FAILURE FX: dense smoke, sparks, licking flame */}
        {showDownFx && (
          <g className={downFading ? "ol-fx-fade motion-only" : undefined}>
            {[0, 0.2, 0.4].map((delay, i) => (
              <circle
                key={`spark-${i}`}
                cx={sparkAnchor.x + i * 2.5}
                cy={sparkAnchor.y - i * 1.5}
                r={1.5}
                fill="#fde047"
                className="animate-spark-flicker"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
            {/* electric arc jumping between contact points */}
            <path
              d={`M ${sparkAnchor.x - 2},${sparkAnchor.y + 1} L ${sparkAnchor.x + 1.5},${sparkAnchor.y - 2} L ${sparkAnchor.x},${sparkAnchor.y + 0.5} L ${sparkAnchor.x + 3},${sparkAnchor.y - 3}`}
              stroke="#e0f2fe"
              strokeWidth={0.9}
              fill="none"
              className="animate-spark-flicker"
              style={{ animationDelay: "0.1s" }}
            />
            {/* stylized licking flame */}
            <path
              d={`M ${wrenchAnchor.x - 1},${wrenchAnchor.y - 2} q -2,-4 0,-7 q 2,3 0.5,4.5 q 2,-2 0.5,-5.5 q 2.5,3 1,7 q -0.5,2 -2,1`}
              fill="#f97316"
              className="animate-spark-flicker"
              style={{ animationDelay: "0.25s" }}
            />
            <path
              d={`M ${wrenchAnchor.x - 1},${wrenchAnchor.y - 2} q -1,-2.5 0,-4.5 q 1,2 0,3.5`}
              fill="#fde047"
              className="animate-spark-flicker"
              style={{ animationDelay: "0.35s" }}
            />
            {/* electrical top discharge lines (PRESERVES TEST CONTRACT data-testid="rack-top-spark") */}
            {[
              { dx: -9, dy: -7, delay: 0 },
              { dx: 8, dy: -9, delay: 0.17 },
              { dx: -4, dy: -12, delay: 0.33 },
              { dx: 11, dy: -4, delay: 0.5 },
            ].map((s, i) => (
              <line
                key={`top-spark-${i}`}
                x1={topAnchor.x}
                y1={topAnchor.y}
                x2={topAnchor.x + s.dx}
                y2={topAnchor.y + s.dy}
                stroke="#fef08a"
                strokeWidth={1.2}
                strokeLinecap="round"
                className="ol-spark-burst"
                data-testid="rack-top-spark"
                style={{ animationDelay: `${s.delay}s` }}
              />
            ))}
            {/* dense rising smoke column */}
            {[0, 0.6, 1.2, 1.8].map((delay, i) => (
              <circle
                key={`top-smoke-${i}`}
                cx={topAnchor.x + (i % 2 === 0 ? -2.5 : 2.5)}
                cy={topAnchor.y - 2}
                r={3.6 + i * 0.5}
                fill="#475569"
                opacity={0.65}
                className="ol-smoke-plume"
                style={{ animationDelay: `${delay}s` }}
              />
            ))}
          </g>
        )}

        {/* PREDICTIVE ANOMALY RADAR */}
        {isAnomalous && (
          <>
            <ellipse
              cx={baseAnchor.x}
              cy={baseAnchor.y}
              rx={22}
              ry={13}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.6}
              strokeDasharray="4 3"
              className="animate-pulse"
              opacity={0.8}
            />
            <foreignObject x={bubbleAnchor.x - 9} y={bubbleAnchor.y - 20} width={18} height={18} className="overflow-visible pointer-events-none">
              <div
                className="w-[18px] h-[18px] rounded-full bg-amber-950/80 border border-amber-400 text-amber-300 flex items-center justify-center text-[9px] font-mono font-bold animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                title={t.officeLife.predictiveAnomaly}
              >
                ⚠
              </div>
            </foreignObject>
          </>
        )}

        {/* FLOATING HOLOGRAPHIC TELEMETRY HUD OVER CABINET */}
        {(selected || unhealthy) && (
          <g transform={`translate(${bubbleAnchor.x}, ${bubbleAnchor.y - 26})`} pointerEvents="none">
            {/* spinning tactical reticle */}
            <circle
              cx={0}
              cy={0}
              r={15}
              fill="none"
              stroke={unhealthy ? "#ef4444" : "#00f0ff"}
              strokeWidth={0.8}
              strokeDasharray="3 4"
              className="ol-holo-spin"
              opacity={0.7}
            />
            <circle
              cx={0}
              cy={0}
              r={11}
              fill="none"
              stroke={unhealthy ? "#ef4444" : "#38bdf8"}
              strokeWidth={0.6}
              strokeDasharray="5 2"
              className="ol-holo-spin-rev"
              opacity={0.5}
            />

            {/* tactical status chip */}
            <rect
              x={-24}
              y={-7}
              width={48}
              height={14}
              rx={3}
              fill="rgba(15,23,42,0.85)"
              stroke={unhealthy ? "#ef4444" : "#00f0ff"}
              strokeWidth={0.7}
              className={unhealthy ? "ol-hazard-glitch" : undefined}
              style={{ filter: "drop-shadow(0 0 5px rgba(0,240,255,0.4))" }}
            />
            <text
              x={0}
              y={3}
              textAnchor="middle"
              fill={unhealthy ? "#fca5a5" : "#38bdf8"}
              style={{ fontSize: 6.5, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.08em" }}
            >
              {unhealthy ? (status === "down" ? "OFFLINE" : "ALERT") : `${service.tier.toUpperCase()}`}
            </text>
          </g>
        )}

        {/* ACTIVE INCIDENT ALERT BADGE */}
        {showBadge && (
          <foreignObject x={bubbleAnchor.x - 11} y={bubbleAnchor.y - 24} width={22} height={22} className="overflow-visible">
            <div className={`w-[22px] h-[22px] animate-pop-in${badgeFading ? " ol-fx-fade motion-only" : ""}`}>
              <div
                className={`alert-bubble relative w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center text-[10px] font-extrabold ol-badge-bob${
                  sevTone?.urgent ? " ol-badge-bob-urgent" : ""
                } ${
                  severity
                    ? ALERT_BADGE_TONE[severity]
                    : badgeStatus === "down"
                      ? "bg-rose-500 border-rose-600 text-white"
                      : "bg-amber-400 border-amber-500 text-amber-950"
                }`}
              >
                !
              </div>
            </div>
          </foreignObject>
        )}

        {/* RECOVERY LASER SCAN BAR & RESTORED BADGE */}
        {recoverAnim && (
          <>
            <polyline
              points={scanPoints}
              fill="none"
              stroke="#34d399"
              strokeWidth={2.6}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="ol-scan motion-only"
              style={{ "--ol-rise": `${-(height - 0.1) * Z_SCALE}px`, filter: "drop-shadow(0 0 5px rgba(52,211,153,1))" } as CSSProperties}
            />
            <g transform={`translate(${bubbleAnchor.x}, ${bubbleAnchor.y - 14})`}>
              <g className="ol-chip motion-only">
                <rect x={-26} y={-8} width={52} height={12} rx={6} fill="#064e3b" stroke="#34d399" strokeWidth={1} style={{ filter: "drop-shadow(0 0 8px rgba(52,211,153,0.7))" }} />
                <text
                  x={0}
                  y={0.5}
                  textAnchor="middle"
                  fill="#a7f3d0"
                  style={{ fontSize: 6.5, fontWeight: 900, fontFamily: "monospace", letterSpacing: "0.12em" }}
                >
                  {t.officeLife.restored}
                </text>
              </g>
            </g>
          </>
        )}
      </g>

      {/* ONE-SHOT ENTRANCE FLASH */}
      {raisedAnim && (
        <ellipse
          cx={bubbleAnchor.x}
          cy={project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height * 0.5).y}
          rx={28}
          ry={32}
          fill={sevTone?.glow ?? "rgba(248,113,113,0.9)"}
          className="ol-spawn-flash motion-only"
          style={{ opacity: 0 }}
        />
      )}

      {/* MITIGATION WRENCH OVERLAY */}
      {mitigateAnim && !recoverAnim && (
        <foreignObject x={wrenchAnchor.x - 9} y={wrenchAnchor.y - 9} width={18} height={18} className="overflow-visible">
          <div className="w-[18px] h-[18px] flex items-center justify-center text-amber-400 animate-wrench-turn filter drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]">
            <Wrench className="w-3.5 h-3.5" fill="currentColor" />
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export default memo(ServerRack);

