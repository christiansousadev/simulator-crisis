import type { MouseEvent } from "react";
import { useEffect, useMemo } from "react";
import { Wrench } from "lucide-react";
import { useGameStore } from "../../store/useGameStore";
import { IncidentSeverity, Service } from "../../types/game";
import { severityTone } from "../../utils/severity";
import { GroundShadow } from "./OfficeProps";
import IsoBox from "./IsoBox";
import { project } from "./isoMath";

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

// solid-fill alert badge tones per severity (distinct from severity.ts's translucent pill tones,
// which are tuned for text badges rather than this small circular "!" marker)
const ALERT_BADGE_TONE: Record<IncidentSeverity, string> = {
  P1_CRITICAL: "bg-rose-500 border-rose-600 text-white",
  P2_HIGH: "bg-amber-400 border-amber-500 text-amber-950",
  P3_MEDIUM: "bg-yellow-300 border-yellow-400 text-yellow-900",
  P4_LOW: "bg-slate-300 border-slate-400 text-slate-800",
};

const REPAIR_ANIMATION_MS = 1100;
const RAISED_FLASH_MS = 1500;

// footprint and height tuned to roughly 1.8-2x a standing office worker sprite (~38px tall)
const RACK_WIDTH = 0.55;
const RACK_DEPTH = 0.55;
const RACK_HEIGHT_STANDARD = 1.2;
const RACK_HEIGHT_CRITICAL = 1.4;

// STATUS-BASED CABINET COLOR AND LED TONE
function statusTone(status: Service["status"]) {
  if (status === "down") return { cabinet: "#3f3f46", led: "#ef4444", glow: "rgba(239,68,68,0.85)" };
  if (status === "degraded") return { cabinet: "#3f3f46", led: "#f59e0b", glow: "rgba(245,158,11,0.85)" };
  return { cabinet: "#3f3f46", led: "#22c55e", glow: "rgba(34,197,94,0.85)" };
}

// ISOMETRIC 42U ENTERPRISE SERVER CABINET REPRESENTING ONE MICROSERVICE, WITH LED HEALTH AND INCIDENT FX
export default function ServerRack({ service, x, y, selected, severity, investigating, dimmed, onSelect, onHover, onLeave }: ServerRackProps) {
  const runAnimations = useGameStore((s) => s.runAnimations);
  const dismissRunAnimation = useGameStore((s) => s.dismissRunAnimation);
  const sevTone = severity ? severityTone(severity) : null;

  const repairAnim = runAnimations.find((a) => a.serviceId === service.id && a.kind === "mitigate");
  const raisedAnim = runAnimations.find((a) => a.serviceId === service.id && a.kind === "raised");

  useEffect(() => {
    if (!repairAnim) return;
    const timer = setTimeout(() => dismissRunAnimation(repairAnim.id), REPAIR_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [repairAnim, dismissRunAnimation]);

  useEffect(() => {
    if (!raisedAnim) return;
    const timer = setTimeout(() => dismissRunAnimation(raisedAnim.id), RAISED_FLASH_MS);
    return () => clearTimeout(timer);
  }, [raisedAnim, dismissRunAnimation]);

  const purchasedUpgrades = useGameStore((s) => s.telemetry.purchased_upgrades);
  const hasPredictiveDetection = purchasedUpgrades.includes("predictive_anomaly_detection");
  // anomaly: elevated latency or error rate even while status is still classified as healthy
  const isAnomalous = hasPredictiveDetection && service.status === "healthy" && (service.latency_ms > 110 || service.error_rate > 0.012);

  const tone = statusTone(service.status);
  const height = service.tier === "critical" ? RACK_HEIGHT_CRITICAL : RACK_HEIGHT_STANDARD;

  const ledSlots = 3;
  const ledPoints = useMemo(
    () =>
      Array.from({ length: ledSlots }).map((_, i) =>
        project(x + RACK_WIDTH * 0.72, y + RACK_DEPTH, height * 0.3 + i * 0.2 + 0.1)
      ),
    [x, y, height]
  );

  // perforated mesh door texture: a faint dot grid across the front-right face
  const meshPoints = useMemo(() => {
    const dots = [];
    const rows = Math.round(height / 0.12);
    for (let r = 1; r < rows; r++) {
      dots.push(project(x + RACK_WIDTH * 0.28, y + RACK_DEPTH, r * 0.12));
    }
    return dots;
  }, [x, y, height]);

  // recessed patch panel strip near the base with a row of tiny port outlines
  const patchPorts = useMemo(
    () => Array.from({ length: 4 }).map((_, i) => project(x + RACK_WIDTH * (0.2 + i * 0.18), y + RACK_DEPTH, 0.08)),
    [x, y]
  );

  const bubbleAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height + 0.45);
  const wrenchAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height * 0.6);
  const fanAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height + 0.03);
  const sparkAnchor = project(x + RACK_WIDTH * 0.3, y + RACK_DEPTH, height * 0.55);
  const floorReflectionAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, 0.025);

  const unhealthy = service.status !== "healthy";

  return (
    <g
      onClick={(e) => {
        e.stopPropagation();
        onSelect(service.id);
      }}
      onMouseEnter={(e) => onHover(service.id, e)}
      onMouseMove={(e) => onHover(service.id, e)}
      onMouseLeave={onLeave}
      className={`cursor-pointer transition-opacity duration-300 ${service.status === "down" ? "animate-shake" : ""}`}
      style={{ opacity: dimmed ? 0.35 : 1 }}
    >
      <GroundShadow x={x + RACK_WIDTH / 2} y={y + RACK_DEPTH / 2} rx={16} ry={8} />

      {/* localized floor reflection, tinted by the worst active incident's severity so a P1 reads
          hotter/more saturated than a P2/P3 on the same rack -- confined to this cabinet's tile so
          several simultaneous incidents never bleed into each other */}
      {sevTone ? (
        <ellipse
          cx={floorReflectionAnchor.x}
          cy={floorReflectionAnchor.y}
          rx={sevTone.urgent ? 21 : 18}
          ry={9}
          fill={sevTone.glow}
          opacity={sevTone.urgent ? 0.45 : 0.28}
          className="animate-glow-pulse"
        />
      ) : (
        service.status === "down" && (
          <ellipse
            cx={floorReflectionAnchor.x}
            cy={floorReflectionAnchor.y}
            rx={19}
            ry={9}
            fill="#ef4444"
            opacity={0.4}
            className="animate-glow-pulse"
          />
        )
      )}

      {/* selection highlight pad on the shared floor */}
      <IsoBox
        x={x - 0.06}
        y={y - 0.06}
        z={0.024}
        w={RACK_WIDTH + 0.12}
        d={RACK_DEPTH + 0.12}
        h={0.015}
        color={selected ? "#93c5fd" : "#e7e0d2"}
        opacity={selected ? 0.9 : 0}
      />

      <IsoBox x={x} y={y} z={0.03} w={RACK_WIDTH} d={RACK_DEPTH} h={height} color={tone.cabinet} />

      {/* perforated mesh front door texture */}
      {meshPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={0.8} fill="rgba(0,0,0,0.35)" />
      ))}

      {/* recessed patch panel with sequenced ports */}
      {patchPorts.map((p, i) => (
        <rect key={i} x={p.x - 1} y={p.y - 0.7} width={2} height={1.4} fill="#0f172a" stroke="#525252" strokeWidth={0.3} />
      ))}

      {/* led status column on the front-right face */}
      {ledPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={2}
          fill={tone.led}
          style={{ filter: `drop-shadow(0 0 3px ${tone.glow})` }}
          className="animate-blink"
        />
      ))}

      {/* sky-blue investigation pulse: the one extra signal for "under investigation", shown only
          while this exact incident is open in the log-triage terminal -- never stacked with any
          other extra effect on the same rack */}
      {investigating && (
        <circle
          cx={bubbleAnchor.x}
          cy={bubbleAnchor.y - 6}
          r={3.2}
          fill="#38bdf8"
          style={{ filter: "drop-shadow(0 0 4px rgba(56,189,248,0.9))" }}
          className="animate-beacon-flash"
        />
      )}

      {/* rooftop cooling fan, spins while the node is healthy */}
      <g className={service.status === "healthy" ? "animate-fan-spin" : ""} style={{ transformOrigin: `${fanAnchor.x}px ${fanAnchor.y}px` }}>
        <circle cx={fanAnchor.x} cy={fanAnchor.y} r={4} fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="2.4 2.4" />
      </g>

      {/* thin dark smoke wisping from the vent grille: a mid-tier warning before the rack fully dies */}
      {service.status === "degraded" && (
        <g>
          {[0, 0.5].map((delay, i) => (
            <circle
              key={`degraded-smoke-${i}`}
              cx={wrenchAnchor.x + (i - 0.5) * 3}
              cy={wrenchAnchor.y - 6}
              r={2}
              fill="#3f3f46"
              opacity={0.45}
              className="animate-smoke-rise"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </g>
      )}

      {/* flames, arcing sparks and a dense smoke column from a fully downed node */}
      {service.status === "down" && (
        <g>
          {[0, 0.2, 0.4].map((delay, i) => (
            <circle
              key={`spark-${i}`}
              cx={sparkAnchor.x + i * 2.5}
              cy={sparkAnchor.y - i * 1.5}
              r={1.3}
              fill="#fde047"
              className="animate-spark-flicker"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
          {/* electric arc jumping between two contact points, flickering on/off like a short circuit */}
          <path
            d={`M ${sparkAnchor.x - 2},${sparkAnchor.y + 1} L ${sparkAnchor.x + 1.5},${sparkAnchor.y - 2} L ${sparkAnchor.x},${sparkAnchor.y + 0.5} L ${sparkAnchor.x + 3},${sparkAnchor.y - 3}`}
            stroke="#e0f2fe"
            strokeWidth={0.8}
            fill="none"
            className="animate-spark-flicker"
            style={{ animationDelay: "0.1s" }}
          />
          {/* small stylized flame licking up from the vent */}
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
          {[0, 0.4, 0.8].map((delay, i) => (
            <circle
              key={`smoke-${i}`}
              cx={wrenchAnchor.x + (i - 1) * 3.4}
              cy={wrenchAnchor.y - 6}
              r={2.8}
              fill="#64748b"
              opacity={0.6}
              className="animate-smoke-rise"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </g>
      )}

      {/* predictive anomaly pulse: aura around base and warning radar badge above rack */}
      {isAnomalous && (
        <>
          <ellipse
            cx={project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, 0).x}
            cy={project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, 0).y}
            rx={20}
            ry={12}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            className="animate-pulse"
            opacity={0.75}
          />
          {!unhealthy && (
            <foreignObject x={bubbleAnchor.x - 9} y={bubbleAnchor.y - 20} width={18} height={18} className="overflow-visible pointer-events-none">
              <div
                className="w-[18px] h-[18px] rounded-full bg-amber-950/80 border border-amber-400 text-amber-300 flex items-center justify-center text-[9px] font-mono font-bold animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]"
                title="Predictive Anomaly Detected: Latency/Error rate anomaly"
              >
                ⚠
              </div>
            </foreignObject>
          )}
        </>
      )}

      {/* bouncy cartoon alert badge for any active incident, colored by its severity so a P1
          reads as more urgent than a P2/P3 at a glance rather than just by status */}
      {unhealthy && (
        <foreignObject x={bubbleAnchor.x - 11} y={bubbleAnchor.y - 24} width={22} height={22} className="overflow-visible">
          <div
            className={`alert-bubble relative w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center text-[10px] font-extrabold animate-pop-in animate-bounce-panic ${
              severity
                ? ALERT_BADGE_TONE[severity]
                : service.status === "down"
                  ? "bg-rose-500 border-rose-600 text-white"
                  : "bg-amber-400 border-amber-500 text-amber-950"
            }`}
            style={sevTone?.urgent ? { animationDuration: "0.35s" } : undefined}
          >
            !
          </div>
        </foreignObject>
      )}

      {/* one-shot entrance flash the instant this service's incident is raised -- a quick bloom
          over the rack, distinct from the severity glow's continuous pulse, reusing the same
          impact-flash keyframe ImpactFlash.tsx already uses for the screen-wide version */}
      {raisedAnim && (
        <ellipse
          cx={bubbleAnchor.x}
          cy={project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height * 0.5).y}
          rx={26}
          ry={30}
          fill={sevTone?.glow ?? "rgba(248,113,113,0.9)"}
          className="animate-impact-flash-fx"
        />
      )}

      {/* wrench repair overlay while a mitigation is being applied */}
      {repairAnim && (
        <foreignObject x={wrenchAnchor.x - 9} y={wrenchAnchor.y - 9} width={18} height={18} className="overflow-visible">
          <div className="w-[18px] h-[18px] flex items-center justify-center text-amber-400 animate-wrench-turn">
            <Wrench className="w-3.5 h-3.5" fill="currentColor" />
          </div>
        </foreignObject>
      )}
    </g>
  );
}
