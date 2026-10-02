import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

// RENDER THE ROLE-SPECIFIC TORSO GARMENT: HOODIE, SUIT JACKET OR CASUAL TEE
// (rx bumped from the original 3-4 to 5 -- softer, less "cardboard box" silhouette at a glance)
function Torso({ role, shirtColor }: { role: WorkerRole; shirtColor: string }) {
  if (role === "executive") {
    return (
      <>
        <rect x={-6} y={-24} width={12} height={14} rx={5} fill="#1f2937" />
        <rect x={-2.4} y={-24} width={4.8} height={14} fill="#f8fafc" />
        <line x1={0} y1={-24} x2={0} y2={-15} stroke={shirtColor} strokeWidth={2} />
      </>
    );
  }
  if (role === "engineer") {
    return (
      <>
        <rect x={-6} y={-24} width={12} height={14} rx={5} fill={shirtColor} />
        {/* hoodie collar */}
        <path d="M -3.5,-24 Q 0,-20 3.5,-24 Z" fill="rgba(0,0,0,0.18)" />
      </>
    );
  }
  return <rect x={-6} y={-24} width={12} height={14} rx={5} fill={shirtColor} />;
}

// STANDING LEGS: A STILL, STRAIGHT STANCE -- USED WHENEVER THE SPRITE ISN'T ACTUALLY TRANSLATING
function StandingLegs() {
  return (
    <>
      <line x1={-3} y1={0} x2={-3} y2={-9} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
      <line x1={3} y1={0} x2={3} y2={-9} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
      <rect x={-6} y={-1.5} width={4} height={2.4} rx={1.2} fill="#1c1917" />
      <rect x={2} y={-1.5} width={4} height={2.4} rx={1.2} fill="#1c1917" />
    </>
  );
}

// WALKING LEGS: EACH LEG IS ITS OWN <g>, PIVOTED AT ITS OWN HIP, SWINGING IN OPPOSITE PHASE --
// A REAL SCISSOR STRIDE RATHER THAN THE SPRITE JUST SLIDING ACROSS THE FLOOR ON FIXED LEGS
function WalkingLegs() {
  return (
    <>
      <g className="animate-walk-cycle-left" style={{ transformOrigin: "-3px 0px" }}>
        <line x1={-3} y1={0} x2={-3} y2={-9} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
        <rect x={-6} y={-1.5} width={4} height={2.4} rx={1.2} fill="#1c1917" />
      </g>
      <g className="animate-walk-cycle-right" style={{ transformOrigin: "3px 0px" }}>
        <line x1={3} y1={0} x2={3} y2={-9} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
        <rect x={2} y={-1.5} width={4} height={2.4} rx={1.2} fill="#1c1917" />
      </g>
    </>
  );
}

// STYLIZED 2.5D ISOMETRIC HUMANOID SPRITE, SCREEN-SPACE DRAWN AT A PROJECTED WORLD ANCHOR
export default function OfficeWorker({
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
}: OfficeWorkerProps) {
  const t = useTranslation();
  const anchor = project(x, y, z);
  const hands = HAND_POSE[mood];
  const slumped = mood === "tired";

  // real walk-cycle legs only while the sprite is actually mid-translation between two world
  // positions -- previously the legs were a single fixed mid-stride pose regardless of whether
  // the sprite was moving or standing still, so nothing ever visibly "walked"
  const [isWalking, setIsWalking] = useState(false);
  const [autoFacing, setAutoFacing] = useState<"left" | "right">("right");
  const prevPos = useRef({ x, y });

  useEffect(() => {
    if (prevPos.current.x === x && prevPos.current.y === y) return;
    const dx = x - prevPos.current.x;
    const dy = y - prevPos.current.y;
    // in isometric projection, x-increase moves bottom-right, y-increase moves bottom-left
    if (dx - dy < 0) {
      setAutoFacing("left");
    } else if (dx - dy > 0) {
      setAutoFacing("right");
    }
    prevPos.current = { x, y };
    setIsWalking(true);
    if (!transitionMs) return;
    const timer = setTimeout(() => setIsWalking(false), transitionMs);
    return () => clearTimeout(timer);
  }, [x, y, transitionMs]);

  const effectiveFacing = facing ?? autoFacing;

  // a stable per-instance blink delay so a whole room of sprites doesn't blink in lockstep
  const blinkDelay = useMemo(() => `${(Math.random() * 4).toFixed(2)}s`, []);

  // click-to-banter: a comic speech bubble with a mood-flavored one-liner, auto-dismissing
  const [quip, setQuip] = useState<string | null>(null);
  useEffect(() => {
    if (!quip) return;
    const timer = setTimeout(() => setQuip(null), QUIP_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [quip]);
  const handleBanter = (evt: ReactMouseEvent<SVGGElement>) => {
    void evt;
    const pool = t.workerQuips[quipPoolKey(mood)];
    setQuip(pool[Math.floor(Math.random() * pool.length)]);
  };

  return (
    <g
      style={{
        transform: `translate(${anchor.x}px, ${anchor.y}px)`,
        transition: transitionMs ? `transform ${transitionMs}ms ease-in-out` : undefined,
      }}
      onClick={handleBanter}
      className="cursor-pointer group"
    >
      <title>{name ? `${name} [${workerStatusText || mood}]` : `Worker [${mood}]`}</title>
      <g
        className={BODY_ANIMATION[mood]}
        style={{
          transform: `${slumped ? "translateY(2px) scaleY(0.94)" : ""} ${effectiveFacing === "left" ? "scaleX(-1)" : ""}`.trim() || undefined,
          transformOrigin: "0px 0px",
        }}
      >
        {/* legs and shoes, hidden when seated behind a desk or chair */}
        {!seated && (isWalking ? <WalkingLegs /> : <StandingLegs />)}

        {/* arms, drawn behind the torso so the shoulder joint reads cleanly */}
        <line x1={SHOULDER[0]} y1={SHOULDER[1]} x2={hands.left[0]} y2={hands.left[1]} stroke={skinTone} strokeWidth={3.4} strokeLinecap="round" />
        <line x1={SHOULDER_R[0]} y1={SHOULDER_R[1]} x2={hands.right[0]} y2={hands.right[1]} stroke={skinTone} strokeWidth={3.4} strokeLinecap="round" />

        <Torso role={role} shirtColor={shirtColor} />

        {badge && (
          <>
            <line x1={-1} y1={-24} x2={-1.5} y2={-16} stroke="#94a3b8" strokeWidth={0.8} />
            <rect x={-2.6} y={-16} width={3.2} height={4} rx={0.6} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.4} />
          </>
        )}

        {/* neck */}
        <rect x={-1.8} y={-27} width={3.6} height={3.5} fill={skinTone} />

        {/* head */}
        <circle cx={0} cy={-30} r={6.2} fill={skinTone} />
        {/* hair cap with side volume */}
        <ellipse cx={0} cy={-34.2} rx={6.4} ry={4} fill={hairColor} />
        <ellipse cx={-5.6} cy={-30.5} rx={1.6} ry={2.6} fill={hairColor} />
        <ellipse cx={5.6} cy={-30.5} rx={1.6} ry={2.6} fill={hairColor} />

        {/* eyes: a simple blink (rather than a static face) is enough to read as "alive" at this
            sprite scale -- each eye's own transformOrigin keeps the blink's squash centered on
            itself, and the randomized per-instance delay keeps a room of sprites from blinking
            in unison */}
        <ellipse
          cx={-2.3}
          cy={-29.6}
          rx={0.9}
          ry={1.3}
          fill="#292524"
          className="animate-eye-blink"
          style={{ transformOrigin: "-2.3px -29.6px", animationDelay: blinkDelay }}
        />
        <ellipse
          cx={2.3}
          cy={-29.6}
          rx={0.9}
          ry={1.3}
          fill="#292524"
          className="animate-eye-blink"
          style={{ transformOrigin: "2.3px -29.6px", animationDelay: blinkDelay }}
        />

        {glasses && (
          <g stroke="#1e293b" strokeWidth={0.7} fill="none">
            <circle cx={-2.6} cy={-30} r={2} />
            <circle cx={2.6} cy={-30} r={2} />
            <line x1={-0.6} y1={-30} x2={0.6} y2={-30} />
          </g>
        )}

        {glowColor && (
          <ellipse cx={0} cy={-29} rx={5.5} ry={5} fill={glowColor} opacity={0.25} className="animate-screen-glow-pulse" />
        )}

        {/* typing hands jitter subtly while idle to sell the keyboard interaction */}
        <g className={mood === "idle" ? "animate-type-jitter" : undefined}>
          <circle cx={hands.left[0]} cy={hands.left[1]} r={1.6} fill={skinTone} />
          <circle cx={hands.right[0]} cy={hands.right[1]} r={1.6} fill={skinTone} />
        </g>

        {holdsMug && <rect x={hands.right[0] - 1.5} y={hands.right[1] - 3} width={3} height={3.4} rx={0.8} fill="#e2e8f0" />}
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
