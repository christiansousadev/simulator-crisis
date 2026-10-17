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
// RENDER THE ROLE-SPECIFIC TORSO GARMENT: DETAILED 16-BIT RETRO PIXEL HOODIE, TAILORED SUIT OR CASUAL TEE
function Torso({ role, shirtColor }: { role: WorkerRole; shirtColor: string }) {
  if (role === "executive") {
    return (
      <g shapeRendering="crispEdges">
        {/* blazer jacket block with crisp dark border */}
        <rect x={-6.5} y={-24} width={13} height={15} fill="#182232" stroke="#0a0f1d" strokeWidth={0.8} />
        {/* lapel shadows */}
        <line x1={-5.5} y1={-24} x2={-2} y2={-15} stroke="#0a0f1d" strokeWidth={0.8} />
        <line x1={5.5} y1={-24} x2={2} y2={-15} stroke="#0a0f1d" strokeWidth={0.8} />
        {/* crisp white dress shirt V-insert */}
        <polygon points="-2.5,-24 2.5,-24 0,-15" fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
        {/* silk tie with dark outline */}
        <polygon points="-1,-24 1,-24 1.2,-13 0,-10 -1.2,-13" fill={shirtColor} stroke="#0a0f1d" strokeWidth={0.6} />
        {/* pocket square */}
        <rect x={2.5} y={-19} width={2.5} height={1.5} fill="#38bdf8" stroke="#0a0f1d" strokeWidth={0.5} />
      </g>
    );
  }
  if (role === "engineer") {
    return (
      <g shapeRendering="crispEdges">
        {/* tactical hoodie block with pixel outline */}
        <rect x={-6.5} y={-24} width={13} height={15} fill={shirtColor} stroke="#0a0f1d" strokeWidth={0.8} />
        {/* bottom waistband ribbing */}
        <rect x={-6.5} y={-11} width={13} height={2} fill="rgba(0,0,0,0.24)" stroke="#0a0f1d" strokeWidth={0.6} />
        {/* center metallic zipper */}
        <line x1={0} y1={-20} x2={0} y2={-9} stroke="#f8fafc" strokeWidth={0.8} />
        {/* kangaroo front pocket block */}
        <rect x={-4} y={-15.5} width={8} height={4.5} fill="rgba(0,0,0,0.18)" stroke="#0a0f1d" strokeWidth={0.6} />
        {/* hood collar */}
        <polygon points="-4,-24 4,-24 2.5,-20.5 -2.5,-20.5" fill="rgba(0,0,0,0.22)" stroke="#0a0f1d" strokeWidth={0.6} />
        {/* white drawstrings */}
        <line x1={-1.5} y1={-21} x2={-1.5} y2={-17} stroke="#f8fafc" strokeWidth={0.7} />
        <line x1={1.5} y1={-21} x2={1.5} y2={-17} stroke="#f8fafc" strokeWidth={0.7} />
      </g>
    );
  }
  return (
    <g shapeRendering="crispEdges">
      <rect x={-6.5} y={-24} width={13} height={15} fill={shirtColor} stroke="#0a0f1d" strokeWidth={0.8} />
      {/* collar seam */}
      <rect x={-3} y={-24} width={6} height={2} fill="rgba(0,0,0,0.16)" stroke="#0a0f1d" strokeWidth={0.6} />
    </g>
  );
}

// STANDING LEGS: CARGO SLACKS WITH 16-BIT PIXEL SNEAKERS & WHITE MIDSOLES
function StandingLegs() {
  return (
    <g shapeRendering="crispEdges">
      {/* left & right pants legs */}
      <rect x={-4.5} y={-9} width={3.5} height={7.5} fill="#1e293b" stroke="#0a0f1d" strokeWidth={0.8} />
      <rect x={1} y={-9} width={3.5} height={7.5} fill="#1e293b" stroke="#0a0f1d" strokeWidth={0.8} />
      {/* sneaker uppers with pixel contours */}
      <rect x={-6} y={-2.5} width={5} height={2.5} fill="#334155" stroke="#0a0f1d" strokeWidth={0.8} />
      <rect x={1} y={-2.5} width={5} height={2.5} fill="#334155" stroke="#0a0f1d" strokeWidth={0.8} />
      {/* white rubber sole strips */}
      <rect x={-6.2} y={-0.8} width={5.4} height={1.2} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
      <rect x={0.8} y={-0.8} width={5.4} height={1.2} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
    </g>
  );
}

// WALKING LEGS: SCISSOR STRIDE WITH STEPPED 16-BIT LIMBS
function WalkingLegs() {
  return (
    <g shapeRendering="crispEdges">
      <g className="animate-walk-cycle-left" style={{ transformOrigin: "-2.8px -8px" }}>
        <rect x={-4.5} y={-9} width={3.5} height={7.5} fill="#1e293b" stroke="#0a0f1d" strokeWidth={0.8} />
        <rect x={-6} y={-2.5} width={5} height={2.5} fill="#334155" stroke="#0a0f1d" strokeWidth={0.8} />
        <rect x={-6.2} y={-0.8} width={5.4} height={1.2} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
      </g>
      <g className="animate-walk-cycle-right" style={{ transformOrigin: "2.8px -8px" }}>
        <rect x={1} y={-9} width={3.5} height={7.5} fill="#1e293b" stroke="#0a0f1d" strokeWidth={0.8} />
        <rect x={1} y={-2.5} width={5} height={2.5} fill="#334155" stroke="#0a0f1d" strokeWidth={0.8} />
        <rect x={0.8} y={-0.8} width={5.4} height={1.2} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
      </g>
    </g>
  );
}

// 16-BIT RETRO PIXEL ART CHIBI HUMANOID SPRITE
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
      className={`cursor-pointer group pixel-art${fadeIn ? " ol-sprite-in" : ""}`}
      shapeRendering="crispEdges"
    >
      <title>{name ? `${name} [${workerStatusText || t.officeLife.moods[mood]}]` : `${t.officeLife.workerLabel} [${t.officeLife.moods[mood]}]`}</title>
      <g className="ol-pose" style={{ transform: poseTransform, transformOrigin: "0px 0px" }}>
      <g className={BODY_ANIMATION[mood]}>
        {/* contact ground shadow */}
        <ellipse cx={0} cy={0} rx={6.5} ry={3.2} fill="rgba(10,15,29,0.35)" />

        {/* legs and shoes, hidden when seated behind a desk or chair */}
        {!seated && (isWalking ? <WalkingLegs /> : <StandingLegs />)}

        {/* sleeves & arms */}
        <line x1={SHOULDER[0]} y1={SHOULDER[1]} x2={hands.left[0]} y2={hands.left[1]} stroke="#0a0f1d" strokeWidth={4.8} strokeLinecap="square" />
        <line x1={SHOULDER[0]} y1={SHOULDER[1]} x2={hands.left[0]} y2={hands.left[1]} stroke={shirtColor} strokeWidth={3.4} strokeLinecap="square" />
        <line x1={SHOULDER_R[0]} y1={SHOULDER_R[1]} x2={hands.right[0]} y2={hands.right[1]} stroke="#0a0f1d" strokeWidth={4.8} strokeLinecap="square" />
        <line x1={SHOULDER_R[0]} y1={SHOULDER_R[1]} x2={hands.right[0]} y2={hands.right[1]} stroke={shirtColor} strokeWidth={3.4} strokeLinecap="square" />

        {/* hands / wrists */}
        <rect x={hands.left[0] - 1.5} y={hands.left[1] - 1.5} width={3} height={3} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.6} />
        <rect x={hands.right[0] - 1.5} y={hands.right[1] - 1.5} width={3} height={3} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.6} />

        {/* smartwatch on left wrist with glowing cyan pip */}
        <rect x={hands.left[0] - 2} y={hands.left[1] - 2} width={2} height={2} fill="#0284c7" stroke="#0a0f1d" strokeWidth={0.4} />
        <rect x={hands.left[0] - 1.5} y={hands.left[1] - 1.5} width={1} height={1} fill="#00f0ff" />

        <Torso role={role} shirtColor={shirtColor} />

        {/* ULTRABOOK LAPTOP (PRESERVES TEST CONTRACT data-testid="worker-laptop") */}
        {carriesLaptop && (
          <g data-testid="worker-laptop" transform={`translate(${hands.right[0] + 1} ${hands.right[1] - 3})`} shapeRendering="crispEdges">
            {/* laptop base body */}
            <rect x={-2} y={5} width={13} height={2} fill="#0f172a" stroke="#0a0f1d" strokeWidth={0.6} />
            {/* screen lid */}
            <rect x={-1} y={-2} width={11} height={7.5} fill="#1e293b" stroke="#0a0f1d" strokeWidth={0.6} />
            {/* glowing cyan terminal screen */}
            <rect x={0.2} y={-0.8} width={8.6} height={5.2} fill="#00f0ff" opacity={0.92} />
            {/* terminal code scanlines */}
            <line x1={1} y1={0.5} x2={6} y2={0.5} stroke="#0f172a" strokeWidth={0.6} />
            <line x1={1} y1={1.8} x2={4.5} y2={1.8} stroke="#0f172a" strokeWidth={0.6} />
            <line x1={1} y1={3.0} x2={7} y2={3.0} stroke="#0f172a" strokeWidth={0.6} />
          </g>
        )}

        {/* ID CARD LANYARD */}
        {badge && (
          <g shapeRendering="crispEdges">
            <path d="M -3.5,-23.5 L 0,-16 L 3.5,-23.5" stroke="#475569" strokeWidth={0.8} fill="none" />
            <rect x={-2.2} y={-16} width={4.4} height={5.2} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
            <rect x={-1.4} y={-15} width={2.8} height={2.2} fill="#3b82f6" />
            <line x1={-1.4} y1={-12} x2={1.4} y2={-12} stroke="#64748b" strokeWidth={0.6} />
          </g>
        )}

        {/* neck */}
        <rect x={-2} y={-26.5} width={4} height={3} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.6} />

        {/* 16-BIT CHIBI PIXEL HEAD & FACE */}
        {/* face silhouette block */}
        <rect x={-6.5} y={-36} width={13} height={11} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.8} />

        {/* hair volume and pixel bangs */}
        <rect x={-7} y={-38.5} width={14} height={4.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.8} />
        {/* stepped fringe / bangs */}
        <rect x={-6.5} y={-35.5} width={4} height={2.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
        <rect x={-1.5} y={-35.5} width={3} height={3.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
        <rect x={2.5} y={-35.5} width={4.5} height={2} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
        {/* sideburns */}
        <rect x={-7} y={-34.5} width={2} height={4.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
        <rect x={5} y={-34.5} width={2} height={4.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
        {/* top sheen highlight */}
        <rect x={-3.5} y={-37.5} width={7} height={1} fill="rgba(255,255,255,0.3)" />

        {/* OVER-EAR SRE HEADSET (for engineers) */}
        {role === "engineer" && (
          <g shapeRendering="crispEdges">
            {/* headband */}
            <path d="M -7,-35 L -7,-38.5 L 7,-38.5 L 7,-35" fill="none" stroke="#0a0f1d" strokeWidth={1.4} />
            <path d="M -4,-38.5 L 4,-38.5" stroke="#38bdf8" strokeWidth={1} fill="none" />
            {/* ear cups with cyan ring */}
            <rect x={-8} y={-33.5} width={3} height={4} fill="#1e293b" stroke="#00f0ff" strokeWidth={0.8} />
            <rect x={5} y={-33.5} width={3} height={4} fill="#1e293b" stroke="#00f0ff" strokeWidth={0.8} />
            {/* mic boom */}
            <path d="M -6.5,-30 L -3,-28 L -0.5,-28" stroke="#0a0f1d" strokeWidth={0.8} fill="none" />
            <rect x={-0.5} y={-28.5} width={1.2} height={1.2} fill="#10b981" />
          </g>
        )}

        {/* eyes with blink animation and eye-shine highlight */}
        <g shapeRendering="crispEdges">
          <rect
            x={-3.8}
            y={-31.5}
            width={2.2}
            height={2.2}
            fill="#0a0f1d"
            className="animate-eye-blink"
            style={{ transformOrigin: "-2.7px -30.4px", animationDelay: blinkDelay }}
          />
          <rect x={-3.8} y={-31.5} width={1} height={1} fill="#ffffff" />
          <rect
            x={1.6}
            y={-31.5}
            width={2.2}
            height={2.2}
            fill="#0a0f1d"
            className="animate-eye-blink"
            style={{ transformOrigin: "2.7px -30.4px", animationDelay: blinkDelay }}
          />
          <rect x={1.6} y={-31.5} width={1} height={1} fill="#ffffff" />
        </g>

        {/* blush cheeks */}
        <rect x={-4.5} y={-28.5} width={2} height={1} fill="#f43f5e" opacity={0.35} />
        <rect x={2.5} y={-28.5} width={2} height={1} fill="#f43f5e" opacity={0.35} />

        {/* glasses */}
        {glasses && (
          <g shapeRendering="crispEdges">
            <rect x={-4.5} y={-32.5} width={3.5} height={3.5} fill="rgba(56,189,248,0.2)" stroke="#0a0f1d" strokeWidth={0.8} />
            <rect x={1} y={-32.5} width={3.5} height={3.5} fill="rgba(56,189,248,0.2)" stroke="#0a0f1d" strokeWidth={0.8} />
            <line x1={-1} y1={-31} x2={1} y2={-31} stroke="#0a0f1d" strokeWidth={0.8} />
          </g>
        )}

        {glowColor && (
          <rect x={-5.5} y={-34} width={11} height={9} fill={glowColor} opacity={0.25} className="animate-screen-glow-pulse" />
        )}

        {/* typing hands jitter subtly for seated engineer */}
        {typing && (
          <g shapeRendering="crispEdges">
            <rect x={hands.left[0] - 1.5} y={hands.left[1] - 1.5} width={3} height={3} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.6} className="animate-pixel-type-left" />
            <rect x={hands.right[0] - 1.5} y={hands.right[1] - 1.5} width={3} height={3} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.6} className="animate-pixel-type-right" />
          </g>
        )}

        {/* coffee mug with pixel handle and steam */}
        {holdsMug && (
          <g transform={`translate(${hands.right[0] - 1.5} ${hands.right[1] - 3.5})`} shapeRendering="crispEdges">
            <rect x={0} y={0} width={4} height={4.5} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
            <path d="M 4,1 L 5.5,1 L 5.5,3.5 L 4,3.5" fill="none" stroke="#0a0f1d" strokeWidth={0.6} />
          </g>
        )}
      </g>
      </g>

      {mood === "panic" && (
        <g shapeRendering="crispEdges">
          <g className="animate-pop-in">
            <rect x={-5} y={-49} width={10} height={10} fill="#ef4444" stroke="#0a0f1d" strokeWidth={0.8} />
            <text x={0} y={-41.5} textAnchor="middle" fill="white" style={{ fontSize: 7, fontWeight: 900, fontFamily: "monospace" }}>
              !
            </text>
          </g>
          {[-7, 7].map((dx, i) => (
            <rect
              key={i}
              x={dx - 1}
              y={-40}
              width={2}
              height={3}
              fill="#38bdf8"
              stroke="#0a0f1d"
              strokeWidth={0.4}
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
              style={{ fontSize: 6 + i, fontWeight: 700, fontFamily: "monospace", animationDelay: `${i * 0.5}s` }}
              fill="#94a3b8"
              className="animate-steam-rise"
            >
              {glyph}
            </text>
          ))}
        </g>
      )}

      {mood === "happy" && (
        <g className="animate-pop-in" shapeRendering="crispEdges">
          <rect x={3} y={-46} width={8} height={8} fill="#10b981" stroke="#0a0f1d" strokeWidth={0.8} />
          <text x={7} y={-40} textAnchor="middle" fill="white" style={{ fontSize: 6, fontWeight: 900 }}>
            ★
          </text>
        </g>
      )}

      {mood === "recovering" && (
        <g className="animate-pop-in" shapeRendering="crispEdges">
          <rect x={-9} y={-44} width={8} height={8} fill="#0ea5e9" stroke="#0a0f1d" strokeWidth={0.8} />
          <text x={-5} y={-38} textAnchor="middle" fill="white" style={{ fontSize: 5.5, fontWeight: 900 }}>
            ⚡
          </text>
        </g>
      )}

      {holdsMug && (
        <g className="ol-pixel-steam" shapeRendering="crispEdges">
          <rect x={hands.right[0] - 0.5} y={hands.right[1] - 5} width={1.5} height={1.5} fill="#cbd5e1" opacity={0.8} />
          <rect x={hands.right[0] + 0.5} y={hands.right[1] - 7} width={1.5} height={1.5} fill="#cbd5e1" opacity={0.6} />
        </g>
      )}

      {/* 16-bit retro comic speech bubble with clipped corners */}
      {quip && (
        <foreignObject x={-72} y={-96} width={144} height={54} className="overflow-visible pointer-events-none">
          <div className="flex justify-center">
            <div className="relative px-2.5 py-1.5 border-2 border-slate-900 bg-white text-slate-950 text-[9px] font-extrabold tracking-tight leading-tight text-center shadow-[2px_2px_0px_#0a0f1d] animate-pop-in max-w-[136px] font-mono">
              {quip}
              {/* pixel tail */}
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-r-2 border-b-2 border-slate-900 rotate-45" />
            </div>
          </div>
        </foreignObject>
      )}
    </g>
  );
}

export default memo(OfficeWorker);
