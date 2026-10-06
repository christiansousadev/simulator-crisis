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

// solid-fill alert badge tones per severity (distinct from severity.ts's translucent pill tones,
// which are tuned for text badges rather than this small circular "!" marker)
const ALERT_BADGE_TONE: Record<IncidentSeverity, string> = {
  P1_CRITICAL: "bg-rose-500 border-rose-600 text-white",
  P2_HIGH: "bg-amber-400 border-amber-500 text-amber-950",
  P3_MEDIUM: "bg-yellow-300 border-yellow-400 text-yellow-900",
  P4_LOW: "bg-slate-300 border-slate-400 text-slate-800",
};

// how long the mitigating wrench shows while the server-side action lands, before the recover
// sequence (or this timeout, if the fix did not clear the service) takes over
const MITIGATE_SHOWN_MS = 2600;
// the spawn flash is a 500 ms keyframe; the element is unmounted when it ends
const RAISED_FLASH_MS = 500;
// smoke, sparks and the alert badge fade over this long when a rack calms down
const FX_FADE_MS = 600;

// footprint and height tuned to roughly 1.8-2x a standing office worker sprite (~38px tall)
const RACK_WIDTH = 0.55;
const RACK_DEPTH = 0.55;
const RACK_HEIGHT_STANDARD = 1.2;
const RACK_HEIGHT_CRITICAL = 1.4;

const LED_COUNT = 3;
const LED_PERIOD_MS: Record<"breathe" | "stutter", number> = { breathe: 3200, stutter: 1700 };

type BadStatus = "degraded" | "down";

// ISOMETRIC 42U ENTERPRISE SERVER CABINET REPRESENTING ONE MICROSERVICE, WITH LED HEALTH AND INCIDENT FX.
// state changes are staged rather than snapped: a failing rack shakes once, a recovering rack fades its
// smoke, runs an emerald scan up its face, brings its LEDs back green in sequence and spins its fan up.
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

  // the wrench hands off to the recover sequence the moment the service comes back healthy
  const handedOff = Boolean(recoverAnim);
  useEffect(() => {
    if (!mitigateAnim) return;
    const timer = setTimeout(() => dismissRunAnimation(mitigateAnim.id), handedOff ? 0 : MITIGATE_SHOWN_MS);
    return () => clearTimeout(timer);
  }, [mitigateAnim, handedOff, dismissRunAnimation]);

  // hold the previous status' fx while they fade out. derived during render (not in an effect) so the
  // frame the status flips never shows a rack with its smoke already gone
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

  // remembered across renders for the led recolour and the fan spin-up
  const lastBad = useRef<BadStatus>("down");
  if (status !== "healthy") lastBad.current = status;
  const spunUp = useRef(false);
  if (status !== "healthy") spunUp.current = false;
  else if (recoverAnim) spunUp.current = true;

  // anomaly: elevated latency or error rate even while status is still classified as healthy
  const isAnomalous = hasPredictiveDetection && status === "healthy" && (service.latency_ms > 110 || service.error_rate > 0.012);

  const height = service.tier === "critical" ? RACK_HEIGHT_CRITICAL : RACK_HEIGHT_STANDARD;
  const pattern = ledPatternFor(status);
  const booting = status === "healthy" && Boolean(recoverAnim);

  const ledPoints = useMemo(
    () => Array.from({ length: LED_COUNT }).map((_, i) => project(x + RACK_WIDTH * 0.72, y + RACK_DEPTH, height * 0.3 + i * 0.2 + 0.1)),
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
  const baseAnchor = project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, 0);

  // scan bar: a chevron across the two visible faces, climbing the cabinet
  const scanPoints = useMemo(() => {
    const z = 0.04;
    return [project(x, y + RACK_DEPTH, z), project(x + RACK_WIDTH, y + RACK_DEPTH, z), project(x + RACK_WIDTH, y, z)]
      .map((p) => `${p.x},${p.y}`)
      .join(" ");
  }, [x, y]);

  const unhealthy = status !== "healthy";
  const showBadge = unhealthy || held !== null;
  const showDegradedFx = status === "degraded" || held === "degraded";
  const showDownFx = status === "down" || held === "down";
  // an fx layer that is only here because it is fading out
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
      className="cursor-pointer transition-opacity duration-300"
      style={{ opacity: dimmed ? 0.35 : 1 }}
    >
      {/* the ground shadow stays put when the cabinet shakes */}
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
        status === "down" && (
          <ellipse cx={floorReflectionAnchor.x} cy={floorReflectionAnchor.y} rx={19} ry={9} fill="#ef4444" opacity={0.4} className="animate-glow-pulse" />
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

      {/* everything that belongs to the cabinet itself; a failure shakes this group once */}
      <g className={failAnim ? "ol-rack-shake" : undefined}>
        <IsoBox x={x} y={y} z={0.03} w={RACK_WIDTH} d={RACK_DEPTH} h={height} color={CABINET_COLOR[status]} className="ol-tint" />

        {/* perforated mesh front door texture */}
        {meshPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={0.8} fill="rgba(0,0,0,0.35)" />
        ))}

        {/* recessed patch panel with sequenced ports */}
        {patchPorts.map((p, i) => (
          <rect key={i} x={p.x - 1} y={p.y - 0.7} width={2} height={1.4} fill="#0f172a" stroke="#525252" strokeWidth={0.3} />
        ))}

        {/* led status column: healthy breathes slowly, degraded stutters amber, down is solid red;
            each led has its own phase, and on recovery they turn green one after another */}
        {ledPoints.map((p, i) => {
          const period = pattern === "solid" ? 0 : LED_PERIOD_MS[pattern];
          const patternClass = pattern === "breathe" ? "ol-led-healthy" : pattern === "stutter" ? "ol-led-stutter" : "";
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={2}
              fill={LED_COLOR[status]}
              className={`ol-led ${booting ? "ol-led-boot" : patternClass}`}
              style={
                {
                  filter: `drop-shadow(0 0 3px ${LED_COLOR[status]}cc)`,
                  "--ol-led-from": LED_COLOR[lastBad.current],
                  animationDelay: booting ? `${150 + i * 200}ms` : period ? `${ledPhaseMs(service.id, i, period)}ms` : undefined,
                } as CSSProperties
              }
            />
          );
        })}

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

        {/* rooftop cooling fan: spins while healthy, spins back up after a recovery, stops otherwise */}
        <g
          className={status !== "healthy" ? "" : spunUp.current ? "ol-fan-spinup" : "ol-fan"}
          style={{ transformOrigin: `${fanAnchor.x}px ${fanAnchor.y}px` }}
        >
          <circle cx={fanAnchor.x} cy={fanAnchor.y} r={4} fill="none" stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="2.4 2.4" />
        </g>

        {/* thin dark smoke wisping from the vent grille: a mid-tier warning before the rack fully dies */}
        {showDegradedFx && (
          <g className={degradedFading ? "ol-fx-fade motion-only" : undefined}>
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
        {showDownFx && (
          <g className={downFading ? "ol-fx-fade motion-only" : undefined}>
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
              cx={baseAnchor.x}
              cy={baseAnchor.y}
              rx={20}
              ry={12}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              className="animate-pulse"
              opacity={0.75}
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

        {/* bouncy cartoon alert badge for any active incident, colored by its severity so a P1
            reads as more urgent than a P2/P3 at a glance rather than just by status. the pop-in
            lives on the outer element and a calmer bob on the inner one, so neither overrides the
            other's transform; on recovery it fades out with the rest of the fx */}
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

        {/* recovery: an emerald scan bar climbs the cabinet and a RESTORED chip rises above it */}
        {recoverAnim && (
          <>
            <polyline
              points={scanPoints}
              fill="none"
              stroke="#34d399"
              strokeWidth={2.2}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="ol-scan motion-only"
              style={{ "--ol-rise": `${-(height - 0.1) * Z_SCALE}px`, filter: "drop-shadow(0 0 3px rgba(52,211,153,0.9))" } as CSSProperties}
            />
            <g transform={`translate(${bubbleAnchor.x}, ${bubbleAnchor.y - 14})`}>
              <g className="ol-chip motion-only">
                <rect x={-23} y={-8} width={46} height={11} rx={5.5} fill="#064e3b" stroke="#34d399" strokeWidth={0.8} />
                <text
                  x={0}
                  y={0}
                  textAnchor="middle"
                  fill="#a7f3d0"
                  style={{ fontSize: 6.2, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.12em" }}
                >
                  {t.officeLife.restored}
                </text>
              </g>
            </g>
          </>
        )}
      </g>

      {/* one-shot entrance flash the instant this service's incident is raised: invisible at rest,
          it blooms for 500 ms and is unmounted by the timer above. decorative, so it disappears
          entirely under reduced motion instead of freezing as a solid blob */}
      {raisedAnim && (
        <ellipse
          cx={bubbleAnchor.x}
          cy={project(x + RACK_WIDTH / 2, y + RACK_DEPTH / 2, height * 0.5).y}
          rx={26}
          ry={30}
          fill={sevTone?.glow ?? "rgba(248,113,113,0.9)"}
          className="ol-spawn-flash motion-only"
          style={{ opacity: 0 }}
        />
      )}

      {/* wrench overlay while a mitigation is being applied, until the recover sequence takes over */}
      {mitigateAnim && !recoverAnim && (
        <foreignObject x={wrenchAnchor.x - 9} y={wrenchAnchor.y - 9} width={18} height={18} className="overflow-visible">
          <div className="w-[18px] h-[18px] flex items-center justify-center text-amber-400 animate-wrench-turn">
            <Wrench className="w-3.5 h-3.5" fill="currentColor" />
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export default memo(ServerRack);
