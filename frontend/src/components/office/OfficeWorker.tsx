import { project } from "./isoMath";

export type WorkerMood = "idle" | "panic" | "running" | "tired" | "happy" | "recovering";
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
function Torso({ role, shirtColor }: { role: WorkerRole; shirtColor: string }) {
  if (role === "executive") {
    return (
      <>
        <rect x={-6} y={-24} width={12} height={14} rx={3} fill="#1f2937" />
        <rect x={-2.4} y={-24} width={4.8} height={14} fill="#f8fafc" />
        <line x1={0} y1={-24} x2={0} y2={-15} stroke={shirtColor} strokeWidth={2} />
      </>
    );
  }
  if (role === "engineer") {
    return (
      <>
        <rect x={-6} y={-24} width={12} height={14} rx={4} fill={shirtColor} />
        {/* hoodie collar */}
        <path d="M -3.5,-24 Q 0,-20 3.5,-24 Z" fill="rgba(0,0,0,0.18)" />
      </>
    );
  }
  return <rect x={-6} y={-24} width={12} height={14} rx={4} fill={shirtColor} />;
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
}: OfficeWorkerProps) {
  const anchor = project(x, y, z);
  const hands = HAND_POSE[mood];
  const slumped = mood === "tired";

  return (
    <g
      style={{
        transform: `translate(${anchor.x}px, ${anchor.y}px)`,
        transition: transitionMs ? `transform ${transitionMs}ms ease-in-out` : undefined,
      }}
    >
      <g
        className={BODY_ANIMATION[mood]}
        style={slumped ? { transform: "translateY(2px) scaleY(0.94)", transformOrigin: "0px 0px" } : undefined}
      >
        {/* legs and shoes, hidden when seated behind a desk or chair */}
        {!seated && (
          <>
            <line x1={-3} y1={0} x2={-4} y2={-9} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
            <line x1={3} y1={0} x2={4} y2={-9} stroke="#334155" strokeWidth={4} strokeLinecap="round" />
            <rect x={-6} y={-1.5} width={4} height={2.4} rx={0.8} fill="#1c1917" />
            <rect x={2} y={-1.5} width={4} height={2.4} rx={0.8} fill="#1c1917" />
          </>
        )}

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
        <text x={7} y={-40} style={{ fontSize: 7, fontWeight: 700 }} fill="#94a3b8">
          z z z
        </text>
      )}

      {mood === "recovering" && (
        <rect x={-8} y={-33} width={5} height={4} rx={1} fill="#7dd3fc" stroke="#0284c7" strokeWidth={0.4} />
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
    </g>
  );
}
