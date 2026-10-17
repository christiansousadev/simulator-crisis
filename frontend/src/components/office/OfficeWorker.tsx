import type { MouseEvent as ReactMouseEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../i18n/useTranslation";
import { project } from "./isoMath";

export type WorkerMood = "idle" | "panic" | "running" | "tired" | "happy" | "recovering";

const QUIP_DISPLAY_MS = 3200;

// maps every sprite mood onto one of the four flavored quip pools (running/recovering read
// closest to a determined "idle" bark rather than getting their own dedicated lines)
function quipPoolKey(mood: WorkerMood): "idle" | "panic" | "tired" | "happy" {
  if (mood === "panic") return "panic";
  if (mood === "tired") return "tired";
  if (mood === "happy") return "happy";
  return "idle";
}
export type WorkerRole = "engineer" | "executive" | "casual";

interface OfficeWorkerProps {
  x: number;
  y: number;
  z?: number;
  shirtColor?: string;
  hairColor?: string;
  skinTone?: string;
  mood?: WorkerMood;
  holdsMug?: boolean;
  transitionMs?: number;
  role?: WorkerRole;
  seated?: boolean;
  glasses?: boolean;
  badge?: boolean;
  glowColor?: string;
  facing?: "left" | "right";
  name?: string;
  workerStatusText?: string;
  /** only seated engineers at a lit desk type; everyone else keeps their hands still */
  typing?: boolean;
  /** stand and lean forward, e.g. reacting to an acknowledged alert at their desk */
  leaning?: boolean;
  /** easing of the walk transition; walkers use "linear" so a constant pace reads as walking */
  transitionEasing?: string;
  /** a laptop clutched in the front hand: an engineer rushing to a failing rack */
  carriesLaptop?: boolean;
  /** fade the sprite in when it first mounts (a new hire arriving) */
  fadeIn?: boolean;
  /** when set, a click runs this (after the banter bubble) and stops there instead of bubbling to the canvas */
  onActivate?: () => void;
}

interface HandPose {
  left: [number, number];
  right: [number, number];
}

// hand coordinates are local to the sprite, feet/seat at (0,0), head near (0,-30)
const HAND_POSE: Record<WorkerMood, HandPose> = {
  idle: { left: [-5, -15], right: [5, -15] },
  panic: { left: [-5, -31], right: [5, -31] },
  running: { left: [-9, -12], right: [8, -20] },
  tired: { left: [-7, -7], right: [7, -7] },
  happy: { left: [-5, -16], right: [5, -18] },
  recovering: { left: [-5, -30], right: [5, -15] },
};

const SHOULDER: [number, number] = [-5, -22];
const SHOULDER_R: [number, number] = [5, -22];

const BODY_ANIMATION: Record<WorkerMood, string> = {
  idle: "animate-worker-bob",
  panic: "animate-bounce-panic",
  running: "animate-sprint-bounce",
  tired: "",
  happy: "animate-worker-bob",
  recovering: "",
};

// RENDER THE ROLE-SPECIFIC TORSO GARMENT: DETAILED TACTICAL HOODIE, TAILORED SUIT OR CASUAL TEE
function Torso({ role, shirtColor }: { role: WorkerRole; shirtColor: string }) {
  if (role === "executive") {
    return (
      <g>
        {/* blazer jacket with side contour */}
        <rect x={-6.2} y={-24} width={12.4} height={14} rx={4.5} fill="#182232" />
        {/* lapel flaps */}
        <path d="M -5.5,-24 L -1.5,-16 L -5,-14 Z" fill="#0f172a" />
        <path d="M 5.5,-24 L 1.5,-16 L 5,-14 Z" fill="#0f172a" />
        {/* crisp white dress shirt */}
        <polygon points="-2.2,-24 2.2,-24 1.5,-15 -1.5,-15" fill="#f8fafc" />
        {/* silk tie */}
        <polygon points="-1.2,-24 1.2,-24 1.6,-13 0,-10 -1.6,-13" fill={shirtColor} />
        {/* pocket square */}
        <rect x={2.4} y={-19.5} width={2.4} height={1.2} rx={0.4} fill="#e2e8f0" />
      </g>
    );
  }
  if (role === "engineer") {
    return (
      <g>
        {/* tactical hoodie body with side shading */}
        <rect x={-6.2} y={-24} width={12.4} height={14} rx={4.5} fill={shirtColor} />
        <path d="M -6.2,-24 L -3,-24 L -3,-10 L -6.2,-10 Z" fill="rgba(0,0,0,0.14)" />
        {/* center metallic zipper */}
        <line x1={0} y1={-20} x2={0} y2={-10} stroke="rgba(255,255,255,0.4)" strokeWidth={0.8} />
        {/* kangaroo front pocket */}
        <path d="M -4,-15 Q 0,-16.5 4,-15 L 3.5,-11 Q 0,-11.5 -3.5,-11 Z" fill="rgba(0,0,0,0.18)" />
        {/* hood collar with drawstrings */}
        <path d="M -4,-24 Q 0,-20.5 4,-24 Q 0,-22 -4,-24 Z" fill="rgba(0,0,0,0.25)" />
        <line x1={-1.5} y1={-21} x2={-1.5} y2={-17} stroke="#f8fafc" strokeWidth={0.6} strokeLinecap="round" />
        <line x1={1.5} y1={-21} x2={1.5} y2={-17} stroke="#f8fafc" strokeWidth={0.6} strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g>
      <rect x={-6} y={-24} width={12} height={14} rx={4.5} fill={shirtColor} />
      <path d="M -3.5,-24 Q 0,-21.5 3.5,-24" stroke="rgba(0,0,0,0.25)" strokeWidth={1} fill="none" />
    </g>
  );
}

// STANDING LEGS: CARGO/SLACKS WITH SHADED SIDES AND DETAILED SNEAKERS WITH WHITE MIDSOLES
function StandingLegs() {
  return (
    <g>
      {/* left & right pants legs */}
      <line x1={-3.2} y1={-1} x2={-3.2} y2={-9} stroke="#1e293b" strokeWidth={3.8} strokeLinecap="round" />
      <line x1={3.2} y1={-1} x2={3.2} y2={-9} stroke="#1e293b" strokeWidth={3.8} strokeLinecap="round" />
      {/* sneaker uppers */}
      <rect x={-6.2} y={-2.4} width={4.4} height={2.2} rx={1} fill="#334155" />
      <rect x={1.8} y={-2.4} width={4.4} height={2.2} rx={1} fill="#334155" />
      {/* white midsoles */}
      <rect x={-6.4} y={-0.8} width={4.8} height={1.2} rx={0.6} fill="#f8fafc" />
      <rect x={1.6} y={-0.8} width={4.8} height={1.2} rx={0.6} fill="#f8fafc" />
    </g>
  );
}

// WALKING LEGS: SCISSOR STRIDE WITH PIVOTED ARTICULATED LIMBS AND SNEAKERS
function WalkingLegs() {
  return (
    <g>
      <g className="animate-walk-cycle-left" style={{ transformOrigin: "-3.2px -8px" }}>
        <line x1={-3.2} y1={-1} x2={-3.2} y2={-9} stroke="#1e293b" strokeWidth={3.8} strokeLinecap="round" />
        <rect x={-6.2} y={-2.4} width={4.4} height={2.2} rx={1} fill="#334155" />
        <rect x={-6.4} y={-0.8} width={4.8} height={1.2} rx={0.6} fill="#f8fafc" />
      </g>
      <g className="animate-walk-cycle-right" style={{ transformOrigin: "3.2px -8px" }}>
        <line x1={3.2} y1={-1} x2={3.2} y2={-9} stroke="#1e293b" strokeWidth={3.8} strokeLinecap="round" />
        <rect x={1.8} y={-2.4} width={4.4} height={2.2} rx={1} fill="#334155" />
        <rect x={1.6} y={-0.8} width={4.8} height={1.2} rx={0.6} fill="#f8fafc" />
      </g>
    </g>
  );
}

// STYLIZED 2.5D ISOMETRIC HUMANOID SPRITE, SCREEN-SPACE DRAWN AT A PROJECTED WORLD ANCHOR
function OfficeWorker({
  x,
  y,
  z = 0,
  shirtColor = "#3b82f6",
  hairColor = "#3f2e25",
  skinTone = "#f2c9a0",
  mood = "idle",
  holdsMug = false,
  transitionMs,
  role = "casual",
  seated = false,
  glasses = false,
  badge = false,
  glowColor,
  facing,
  name,
  workerStatusText,
  typing = false,
  leaning = false,
  transitionEasing = "ease-in-out",
  fadeIn = false,
  carriesLaptop = false,
  onActivate,
}: OfficeWorkerProps) {
  const t = useTranslation();
  const anchor = project(x, y, z);
  const hands = HAND_POSE[mood];
  const slumped = mood === "tired";

  const [isWalking, setIsWalking] = useState(false);
  const [autoFacing, setAutoFacing] = useState<"left" | "right">("right");
  const prevPos = useRef({ x, y });

  const walkingRef = useRef(false);
  useEffect(() => {
    if (prevPos.current.x === x && prevPos.current.y === y) {
      if (!walkingRef.current || !transitionMs) return;
      const timer = setTimeout(() => {
        walkingRef.current = false;
        setIsWalking(false);
      }, transitionMs);
      return () => clearTimeout(timer);
    }
    const dx = x - prevPos.current.x;
    const dy = y - prevPos.current.y;
    if (dx - dy < 0) {
      setAutoFacing("left");
    } else if (dx - dy > 0) {
      setAutoFacing("right");
    }
    prevPos.current = { x, y };
    setIsWalking(true);
    walkingRef.current = true;
    if (!transitionMs) return;
    const timer = setTimeout(() => {
      walkingRef.current = false;
      setIsWalking(false);
    }, transitionMs);
    return () => clearTimeout(timer);
  }, [x, y, transitionMs]);

  const effectiveFacing = facing ?? autoFacing;
  const blinkDelay = useMemo(() => `${(Math.random() * 4).toFixed(2)}s`, []);

  const [quip, setQuip] = useState<string | null>(null);
  useEffect(() => {
    if (!quip) return;
    const timer = setTimeout(() => setQuip(null), QUIP_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [quip]);
  const handleBanter = (evt: ReactMouseEvent<SVGGElement>) => {
    const pool = t.workerQuips[quipPoolKey(mood)];
    setQuip(pool[Math.floor(Math.random() * pool.length)]);
    if (onActivate) {
      evt.stopPropagation();
      onActivate();
    }
  };

  const poseTransform =
    [
      slumped ? "translateY(2px) scaleY(0.94)" : "",
      leaning ? "translateX(2px) rotate(7deg)" : "",
      effectiveFacing === "left" ? "scaleX(-1)" : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <g
      style={{
        transform: `translate(${anchor.x}px, ${anchor.y}px)`,
        transition: transitionMs ? `transform ${transitionMs}ms ${transitionEasing}` : undefined,
      }}
      onClick={handleBanter}
      className={`cursor-pointer group${fadeIn ? " ol-sprite-in" : ""}`}
    >
      <title>{name ? `${name} [${workerStatusText || t.officeLife.moods[mood]}]` : `${t.officeLife.workerLabel} [${t.officeLife.moods[mood]}]`}</title>
      <g className="ol-pose" style={{ transform: poseTransform, transformOrigin: "0px 0px" }}>
      <g className={BODY_ANIMATION[mood]}>
        {/* legs and shoes, hidden when seated behind a desk or chair */}
        {!seated && (isWalking ? <WalkingLegs /> : <StandingLegs />)}

        {/* sleeves & arms */}
        <line x1={SHOULDER[0]} y1={SHOULDER[1]} x2={hands.left[0]} y2={hands.left[1]} stroke={shirtColor} strokeWidth={3.8} strokeLinecap="round" />
        <line x1={SHOULDER_R[0]} y1={SHOULDER_R[1]} x2={hands.right[0]} y2={hands.right[1]} stroke={shirtColor} strokeWidth={3.8} strokeLinecap="round" />
        {/* exposed wrists */}
        <circle cx={hands.left[0]} cy={hands.left[1]} r={1.6} fill={skinTone} />
        <circle cx={hands.right[0]} cy={hands.right[1]} r={1.6} fill={skinTone} />

        {/* smartwatch on left wrist with glowing cyan pip */}
        <circle cx={hands.left[0] - 0.5} cy={hands.left[1] - 0.5} r={1.1} fill="#0284c7" />
        <circle cx={hands.left[0] - 0.5} cy={hands.left[1] - 0.5} r={0.5} fill="#00f0ff" />

        <Torso role={role} shirtColor={shirtColor} />

        {/* ULTRABOOK LAPTOP (PRESERVES TEST CONTRACT data-testid="worker-laptop") */}
        {carriesLaptop && (
          <g data-testid="worker-laptop" transform={`translate(${hands.right[0] + 1} ${hands.right[1] - 3})`}>
            {/* laptop base body */}
            <rect x={-2} y={5} width={12} height={1.8} rx={0.6} fill="#0f172a" stroke="#334155" strokeWidth={0.4} />
            {/* screen lid */}
            <rect x={-1} y={-2} width={10} height={7} rx={0.8} fill="#1e293b" stroke="#475569" strokeWidth={0.5} />
            {/* glowing cyan terminal screen */}
            <rect x={0.2} y={-0.8} width={7.6} height={4.8} rx={0.4} fill="#00f0ff" opacity={0.9} style={{ filter: "drop-shadow(0 0 3px rgba(0,240,255,0.7))" }} />
            {/* terminal code lines */}
            <line x1={1} y1={0.5} x2={5.5} y2={0.5} stroke="#0f172a" strokeWidth={0.5} />
            <line x1={1} y1={1.8} x2={4.2} y2={1.8} stroke="#0f172a" strokeWidth={0.5} />
            <line x1={1} y1={3.0} x2={6.2} y2={3.0} stroke="#0f172a" strokeWidth={0.5} />
          </g>
        )}

        {/* ID CARD LANYARD */}
        {badge && (
          <g>
            <path d="M -3.5,-23.5 L 0,-15.5 L 3.5,-23.5" stroke="#475569" strokeWidth={0.7} fill="none" />
            <rect x={-2.6} y={-15} width={3.2} height={4.2} rx={0.6} fill="#f8fafc" stroke="#64748b" strokeWidth={0.4} />
            <rect x={-1.8} y={-14.2} width={1.6} height={1.6} rx={0.2} fill="#3b82f6" />
            <line x1={-1.8} y1={-11.8} x2={1.8} y2={-11.8} stroke="#94a3b8" strokeWidth={0.4} />
          </g>
        )}

        {/* neck */}
        <rect x={-1.8} y={-27.5} width={3.6} height={4} rx={1} fill={skinTone} />

        {/* HEAD & FACE */}
        <circle cx={0} cy={-30.5} r={6.4} fill={skinTone} />

        {/* hair volume and shape */}
        <ellipse cx={0} cy={-34.6} rx={6.6} ry={4.2} fill={hairColor} />
        <ellipse cx={-5.8} cy={-31} rx={1.8} ry={3} fill={hairColor} />
        <ellipse cx={5.8} cy={-31} rx={1.8} ry={3} fill={hairColor} />
        {/* hair specular sheen */}
        <path d="M -3,-36.5 Q 0,-38 3,-36.5" stroke="rgba(255,255,255,0.25)" strokeWidth={0.8} fill="none" strokeLinecap="round" />

        {/* OVER-EAR SRE HEADSET (for engineers) */}
        {role === "engineer" && (
          <g>
            {/* headband */}
            <path d="M -6.2,-31 Q 0,-38.5 6.2,-31" stroke="#0f172a" strokeWidth={1.8} fill="none" strokeLinecap="round" />
            <path d="M -3.5,-35.8 Q 0,-37.2 3.5,-35.8" stroke="#38bdf8" strokeWidth={0.8} fill="none" />
            {/* ear cups with cyan ring */}
            <circle cx={-5.8} cy={-30} r={2} fill="#1e293b" stroke="#00f0ff" strokeWidth={0.7} />
            <circle cx={5.8} cy={-30} r={2} fill="#1e293b" stroke="#00f0ff" strokeWidth={0.7} />
            {/* mic boom */}
            <path d="M -5.8,-29 Q -3,-27.5 -0.5,-27.5" stroke="#334155" strokeWidth={0.7} fill="none" />
            <circle cx={-0.5} cy={-27.5} r={0.65} fill="#10b981" />
          </g>
        )}

        {/* eyes with blink animation and eye-shine highlight */}
        <g>
          <ellipse
            cx={-2.3}
            cy={-30.2}
            rx={1.0}
            ry={1.4}
            fill="#1e293b"
            className="animate-eye-blink"
            style={{ transformOrigin: "-2.3px -30.2px", animationDelay: blinkDelay }}
          />
          <circle cx={-2.5} cy={-30.6} r={0.35} fill="#ffffff" />
          <ellipse
            cx={2.3}
            cy={-30.2}
            rx={1.0}
            ry={1.4}
            fill="#1e293b"
            className="animate-eye-blink"
            style={{ transformOrigin: "2.3px -30.2px", animationDelay: blinkDelay }}
          />
          <circle cx={2.1} cy={-30.6} r={0.35} fill="#ffffff" />
        </g>

        {/* glasses */}
        {glasses && (
          <g stroke="#0f172a" strokeWidth={0.7} fill="none">
            <rect x={-4.4} y={-31.5} width={3.6} height={2.6} rx={0.6} stroke="#0f172a" fill="rgba(56,189,248,0.15)" />
            <rect x={0.8} y={-31.5} width={3.6} height={2.6} rx={0.6} stroke="#0f172a" fill="rgba(56,189,248,0.15)" />
            <line x1={-0.8} y1={-30.2} x2={0.8} y2={-30.2} />
          </g>
        )}

        {glowColor && (
          <ellipse cx={0} cy={-29} rx={6} ry={5} fill={glowColor} opacity={0.3} className="animate-screen-glow-pulse" />
        )}

        {/* typing hands jitter subtly for seated engineer */}
        <g className={typing && mood === "idle" ? "animate-type-jitter" : undefined}>
          <circle cx={hands.left[0]} cy={hands.left[1]} r={1.6} fill={skinTone} />
          <circle cx={hands.right[0]} cy={hands.right[1]} r={1.6} fill={skinTone} />
        </g>

        {/* coffee mug with handle */}
        {holdsMug && (
          <g transform={`translate(${hands.right[0] - 1.5} ${hands.right[1] - 3.5})`}>
            <rect x={0} y={0} width={3.4} height={4} rx={0.8} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.4} />
            <path d="M 3.4,1 Q 4.8,2 3.4,3" fill="none" stroke="#cbd5e1" strokeWidth={0.6} />
          </g>
        )}
      </g>
      </g>

      {mood === "panic" && (
        <g>
          <g className="animate-pop-in">
            <circle cx={0} cy={-46} r={5} fill="#ef4444" stroke="#fecaca" strokeWidth={1} />
            <text x={0} y={-43} textAnchor="middle" fill="white" style={{ fontSize: 7, fontWeight: 800 }}>
              !
            </text>
          </g>
          {[-7, 7].map((dx, i) => (
            <path
              key={i}
              d={`M ${dx},-40 q 1.4,2 0,4 q -1.4,-2 0,-4`}
              fill="#38bdf8"
              className="animate-sweat-drop"
              style={{ animationDelay: `${i * 0.3}s` }}
            />
          ))}
        </g>
      )}

      {mood === "tired" && (
        <g>
          {["z", "Z", "z"].map((glyph, i) => (
            <text
              key={i}
              x={6 + i * 2.5}
              y={-38 - i * 3}
              style={{ fontSize: 6 + i, fontWeight: 700, animationDelay: `${i * 0.5}s` }}
              fill="#94a3b8"
              className="animate-steam-rise"
            >
              {glyph}
            </text>
          ))}
        </g>
      )}

      {mood === "happy" && (
        <g className="animate-pop-in">
          <circle cx={7} cy={-42} r={4.5} fill="#10b981" stroke="#a7f3d0" strokeWidth={0.8} />
          <text x={7} y={-39.5} textAnchor="middle" fill="white" style={{ fontSize: 6, fontWeight: 900 }}>
            ★
          </text>
        </g>
      )}

      {mood === "recovering" && (
        <g className="animate-pop-in">
          <circle cx={-6} cy={-40} r={4} fill="#0ea5e9" stroke="#bae6fd" strokeWidth={0.8} />
          <text x={-6} y={-37.5} textAnchor="middle" fill="white" style={{ fontSize: 5.5, fontWeight: 900 }}>
            ⚡
          </text>
        </g>
      )}

      {holdsMug && (
        <g>
          {[0, 0.5].map((delay, i) => (
            <ellipse
              key={i}
              cx={hands.right[0]}
              cy={hands.right[1] - 4}
              rx={1.2}
              ry={2}
              fill="#cbd5e1"
              className="animate-steam-rise"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
        </g>
      )}

      {/* comic banter bubble, popped by clicking this worker; auto-dismisses on its own timer */}
      {quip && (
        <foreignObject x={-72} y={-96} width={144} height={54} className="overflow-visible pointer-events-none">
          <div className="flex justify-center">
            <div className="speech-bubble relative px-2 py-1.5 rounded-lg border-2 border-slate-800 bg-white text-slate-900 text-[9px] font-bold leading-tight text-center shadow-lg animate-pop-in max-w-[132px]">
              {quip}
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export default memo(OfficeWorker);
