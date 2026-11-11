import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useTranslation } from "../../i18n/useTranslation";
import { project } from "./isoMath";
import { useIdleGesture } from "./useIdleGesture";
import { Heading, isBackHeading } from "./waypointGraph";
import {
  breathCycle,
  breathPhase,
  CUE_CLASSES,
  Gait,
  gaitFor,
  GaitTiming,
  headingFromDelta,
  IdleGesture,
  panicVariantFor,
  replayClass,
  seedOf,
  startleWaveMs,
} from "./workerRig";

export type WorkerMood = "idle" | "panic" | "running" | "tired" | "happy" | "recovering";

const QUIP_DISPLAY_MS = 3200;
const EXCLAIM_MS = 900;

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
  /** one of the four isometric directions; n* shows the sprite's back. Omitted = derived from movement */
  heading?: Heading;
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
  /** stable per-sprite key for variation (panic style, breathing phase); defaults to name + colours */
  seedKey?: string;
  /** rising edge = the incident just hit: startle hop and a "!" balloon, swept across the floor */
  alarmed?: boolean;
  /** arms up and a little hop, e.g. the engineer whose service was just restored */
  cheering?: boolean;
  /** reaching for the espresso machine */
  brewing?: boolean;
  /** leaning back on the sofa, one arm on the backrest */
  lounging?: boolean;
  /** which sporadic idle gestures this sprite may play (default by mood) */
  gestures?: readonly IdleGesture[];
  onGestureChange?: (gesture: IdleGesture | null) => void;
  /** a held standing action that replaces the panic style: point at a screen, or tap a foot */
  action?: WorkerAction;
  /** a bystander on alert: head craned one pixel toward what is facing, no idle gestures */
  wary?: boolean;
}

export type WorkerAction = "point" | "stomp";

interface HandPose {
  left: [number, number];
  right: [number, number];
}

// hand coordinates are local to the sprite, feet/seat at (0,0), head near (0,-30). Resting hands
// hang just outside the torso so the arm swing is actually visible.
const HAND_POSE: Record<WorkerMood | "typing" | "lounge" | "flail" | WorkerAction, HandPose> = {
  idle: { left: [-8, -14], right: [8, -14] },
  typing: { left: [-4, -14], right: [4, -14] },
  panic: { left: [-8, -32], right: [8, -32] },
  flail: { left: [-8, -14], right: [8, -14] },
  running: { left: [-9, -12], right: [8, -20] },
  tired: { left: [-7, -7], right: [7, -7] },
  happy: { left: [-8, -16], right: [8, -18] },
  recovering: { left: [-8, -30], right: [8, -14] },
  lounge: { left: [-10, -24], right: [8, -14] },
  // arm out straight at shoulder height toward whatever the sprite faces; the other hand on the hip
  point: { left: [-8, -15], right: [16, -24] },
  // both hands on the hips while one foot taps
  stomp: { left: [-9, -16], right: [9, -16] },
};

const SHOULDER_L: [number, number] = [-6, -22];
const SHOULDER_R: [number, number] = [6, -22];

const DEFAULT_GESTURES: IdleGesture[] = ["look", "watch"];
const TIRED_GESTURES: IdleGesture[] = ["stretch", "look"];
const LOUNGE_GESTURES: IdleGesture[] = ["look"];

// RENDER THE ROLE-SPECIFIC TORSO GARMENT: 16-BIT PIXEL HOODIE, TAILORED SUIT OR CASUAL TEE, FRONT OR BACK
function Torso({ role, shirtColor, back }: { role: WorkerRole; shirtColor: string; back: boolean }) {
  if (role === "executive") {
    if (back) {
      return (
        <g shapeRendering="crispEdges">
          <rect x={-6.5} y={-24} width={13} height={15} fill="#182232" stroke="#0a0f1d" strokeWidth={0.8} />
          {/* collar and the centre back vent */}
          <rect x={-3} y={-24} width={6} height={1.5} fill="#0f172a" />
          <line x1={0} y1={-14} x2={0} y2={-9} stroke="#0a0f1d" strokeWidth={0.8} />
        </g>
      );
    }
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
    if (back) {
      return (
        <g shapeRendering="crispEdges">
          <rect x={-6.5} y={-24} width={13} height={15} fill={shirtColor} stroke="#0a0f1d" strokeWidth={0.8} />
          <rect x={-6.5} y={-11} width={13} height={2} fill="rgba(0,0,0,0.24)" stroke="#0a0f1d" strokeWidth={0.6} />
          {/* the hood hanging down the back */}
          <rect x={-4} y={-24} width={8} height={5} fill="rgba(0,0,0,0.22)" stroke="#0a0f1d" strokeWidth={0.6} />
        </g>
      );
    }
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
      {/* collar seam (front) or the plain back of the tee */}
      <rect x={-3} y={-24} width={6} height={back ? 1 : 2} fill="rgba(0,0,0,0.16)" stroke="#0a0f1d" strokeWidth={0.6} />
    </g>
  );
}

// LEGS: CARGO SLACKS WITH 16-BIT PIXEL SNEAKERS. Each leg is its own group so the gait keyframes can
// shift it whole pixels per frame; the trousers reach 1px under the torso so breathing never opens a gap.
function Legs() {
  return (
    <g shapeRendering="crispEdges">
      <g className="ol-leg-l">
        <rect x={-4.5} y={-10} width={3.5} height={8.5} fill="#1e293b" stroke="#0a0f1d" strokeWidth={0.8} />
        <rect x={-6} y={-2.5} width={5} height={2.5} fill="#334155" stroke="#0a0f1d" strokeWidth={0.8} />
        <rect x={-6.2} y={-0.8} width={5.4} height={1.2} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
      </g>
      <g className="ol-leg-r">
        <rect x={1} y={-10} width={3.5} height={8.5} fill="#1e293b" stroke="#0a0f1d" strokeWidth={0.8} />
        <rect x={1} y={-2.5} width={5} height={2.5} fill="#334155" stroke="#0a0f1d" strokeWidth={0.8} />
        <rect x={0.8} y={-0.8} width={5.4} height={1.2} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
      </g>
    </g>
  );
}

function Arm({ shoulder, hand, color, skinTone }: { shoulder: [number, number]; hand: [number, number]; color: string; skinTone: string }) {
  return (
    <>
      <line x1={shoulder[0]} y1={shoulder[1]} x2={hand[0]} y2={hand[1]} stroke="#0a0f1d" strokeWidth={4.8} strokeLinecap="square" />
      <line x1={shoulder[0]} y1={shoulder[1]} x2={hand[0]} y2={hand[1]} stroke={color} strokeWidth={3.4} strokeLinecap="square" />
      <rect x={hand[0] - 1.5} y={hand[1] - 1.5} width={3} height={3} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.6} />
    </>
  );
}

function Mug({ hand }: { hand: [number, number] }) {
  return (
    <g transform={`translate(${hand[0] - 1.5} ${hand[1] - 3.5})`} shapeRendering="crispEdges">
      <rect x={0} y={0} width={4} height={4.5} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
      <path d="M 4,1 L 5.5,1 L 5.5,3.5 L 4,3.5" fill="none" stroke="#0a0f1d" strokeWidth={0.6} />
    </g>
  );
}

// 16-BIT RETRO PIXEL ART CHIBI HUMANOID SPRITE ON A LAYERED RIG (see the WORKER RIG notes in officeLife.css)
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
  heading,
  name,
  workerStatusText,
  typing = false,
  leaning = false,
  transitionEasing = "ease-in-out",
  fadeIn = false,
  carriesLaptop = false,
  onActivate,
  seedKey,
  alarmed = false,
  cheering = false,
  brewing = false,
  lounging = false,
  gestures,
  onGestureChange,
  action,
  wary = false,
}: OfficeWorkerProps) {
  const t = useTranslation();
  const reduced = useReducedMotion();
  const anchor = project(x, y, z);
  const slumped = mood === "tired";
  const seed = useMemo(() => seedOf(seedKey ?? `${name ?? ""}|${shirtColor}|${hairColor}`), [seedKey, name, shirtColor, hairColor]);
  const panicVariant = panicVariantFor(seed);

  // ---- locomotion: gait timing and heading from each move ----
  const [walk, setWalk] = useState<GaitTiming | null>(null);
  const [autoFacing, setAutoFacing] = useState<"left" | "right">("right");
  const [autoHeading, setAutoHeading] = useState<Heading>("se");
  const prevPos = useRef({ x, y });
  const walkingRef = useRef(false);
  useEffect(() => {
    if (prevPos.current.x === x && prevPos.current.y === y) {
      if (!walkingRef.current || !transitionMs) return;
      const timer = setTimeout(() => {
        walkingRef.current = false;
        setWalk(null);
      }, transitionMs);
      return () => clearTimeout(timer);
    }
    const dx = x - prevPos.current.x;
    const dy = y - prevPos.current.y;
    if (dx - dy < 0) setAutoFacing("left");
    else if (dx - dy > 0) setAutoFacing("right");
    setAutoHeading((prev) => headingFromDelta(dx, dy, prev));
    prevPos.current = { x, y };
    // a move without a transition is a teleport (reduced motion, first placement): no legs
    if (!transitionMs) return;
    setWalk(gaitFor(Math.hypot(dx, dy), transitionMs));
    walkingRef.current = true;
    const timer = setTimeout(() => {
      walkingRef.current = false;
      setWalk(null);
    }, transitionMs);
    return () => clearTimeout(timer);
  }, [x, y, transitionMs]);

  const walking = walk !== null && !seated;
  const gait: Gait = walking ? walk.gait : "still";
  const effectiveFacing = facing ?? autoFacing;
  const effectiveHeading = heading ?? autoHeading;
  // a roster sprite's heading is authoritative; a free sprite only shows its back mid-walk
  const back = isBackHeading(effectiveHeading) && (heading !== undefined || walking);
  const blinkDelay = useMemo(() => `${(Math.random() * 4).toFixed(2)}s`, []);

  // ---- idle life ----
  const calmMood = mood === "idle" || mood === "happy" || mood === "tired" || mood === "recovering";
  const gesturePool = gestures ?? (lounging ? LOUNGE_GESTURES : mood === "tired" ? TIRED_GESTURES : DEFAULT_GESTURES);
  const idleGesture = useIdleGesture(
    !reduced && gait === "still" && calmMood && !cheering && !brewing && !leaning && !back && !wary && !action,
    gesturePool,
    onGestureChange
  );
  const gesture: IdleGesture | null = gait !== "still" ? null : cheering ? "cheer" : brewing ? "brew" : idleGesture;
  const sipping = gesture === "sip";
  const typingNow = typing && !back && gesture !== "sip" && gesture !== "watch";

  // ---- one-shot cues (anticipation, settle, sit / stand, startle, press) ----
  const cueRef = useRef<SVGGElement>(null);
  const prevWalking = useRef(walking);
  const prevSeated = useRef(seated);
  const prevAlarmed = useRef(alarmed);
  const [exclaim, setExclaim] = useState(false);
  useEffect(() => {
    const wasWalking = prevWalking.current;
    const wasSeated = prevSeated.current;
    const wasAlarmed = prevAlarmed.current;
    prevWalking.current = walking;
    prevSeated.current = seated;
    prevAlarmed.current = alarmed;
    if (reduced) return;
    const el = cueRef.current;
    if (alarmed && !wasAlarmed) {
      replayClass(el, "ol-cue-startle", CUE_CLASSES);
      setExclaim(true);
      return;
    }
    if (seated !== wasSeated) replayClass(el, seated ? "ol-cue-sit" : "ol-cue-stand", CUE_CLASSES);
    else if (walking && !wasWalking) replayClass(el, "ol-cue-start", CUE_CLASSES);
    else if (!walking && wasWalking) replayClass(el, "ol-cue-settle", CUE_CLASSES);
  }, [walking, seated, alarmed, reduced]);

  const waveMs = startleWaveMs(x, y);
  useEffect(() => {
    if (!exclaim) return;
    const timer = setTimeout(() => setExclaim(false), EXCLAIM_MS + waveMs);
    return () => clearTimeout(timer);
    // the wave delay is fixed at the moment the balloon appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exclaim]);

  // ---- banter + squash on click ----
  const [quip, setQuip] = useState<string | null>(null);
  useEffect(() => {
    if (!quip) return;
    const timer = setTimeout(() => setQuip(null), QUIP_DISPLAY_MS);
    return () => clearTimeout(timer);
  }, [quip]);
  const handleBanter = (evt: ReactMouseEvent<SVGGElement>) => {
    const pool = t.workerQuips[quipPoolKey(mood)];
    setQuip(pool[Math.floor(Math.random() * pool.length)]);
    if (!reduced) replayClass(cueRef.current, "ol-press", CUE_CLASSES);
    if (onActivate) {
      evt.stopPropagation();
      onActivate();
    }
  };

  // ---- pose ----
  const poseKey =
    action && !seated && !walking
      ? action
      : typingNow && !seated
        ? "idle"
        : typingNow
          ? "typing"
          : lounging
            ? "lounge"
            : mood === "panic" && panicVariant === "flail"
              ? "flail"
              : mood;
  const acting = poseKey === action;
  const hands = HAND_POSE[poseKey];
  const rightLocked = carriesLaptop || holdsMug;
  const showHeldMug = holdsMug || sipping;

  const poseTransform =
    [
      slumped ? "translateY(2px) scaleY(0.94)" : "",
      leaning ? "translateX(2px) rotate(7deg)" : "",
      effectiveFacing === "left" ? "scaleX(-1)" : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  const rigStyle = {
    "--step": `${walk?.stepS ?? 0.33}s`,
    "--phase": breathPhase(seed),
    "--breathe": breathCycle(mood),
    "--wave": `${waveMs}ms`,
  } as CSSProperties;

  const heldItems = (
    <g className="ol-arm-r" data-locked={rightLocked ? "" : undefined}>
      {/* ULTRABOOK LAPTOP (PRESERVES TEST CONTRACT data-testid="worker-laptop") */}
      {carriesLaptop && (
        <g data-testid="worker-laptop" transform={`translate(${hands.right[0] + 1} ${hands.right[1] - 3})`} shapeRendering="crispEdges">
          <rect x={-2} y={5} width={13} height={2} fill="#0f172a" stroke="#0a0f1d" strokeWidth={0.6} />
          <rect x={-1} y={-2} width={11} height={7.5} fill="#1e293b" stroke="#0a0f1d" strokeWidth={0.6} />
          <rect x={0.2} y={-0.8} width={8.6} height={5.2} fill="#00f0ff" opacity={0.92} />
          <line x1={1} y1={0.5} x2={6} y2={0.5} stroke="#0f172a" strokeWidth={0.6} />
          <line x1={1} y1={1.8} x2={4.5} y2={1.8} stroke="#0f172a" strokeWidth={0.6} />
          <line x1={1} y1={3.0} x2={7} y2={3.0} stroke="#0f172a" strokeWidth={0.6} />
        </g>
      )}
      {showHeldMug && (
        <g data-testid={sipping ? "worker-sip-mug" : undefined}>
          <Mug hand={hands.right} />
        </g>
      )}
    </g>
  );

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
        <g
          className="ol-rig"
          data-gait={gait}
          data-mood={mood}
          data-panic={mood === "panic" && !acting ? panicVariant : undefined}
          data-action={acting ? action : undefined}
          data-wary={wary ? "" : undefined}
          data-gesture={gesture ?? undefined}
          data-pose={lounging ? "lounge" : undefined}
          data-heading={effectiveHeading}
          data-view={back ? "back" : "front"}
          style={rigStyle}
        >
          {/* contact shadow: on the floor, outside every bob, shrinking as the body rises */}
          <ellipse className="ol-shadow" cx={0} cy={0} rx={6.5} ry={3.2} fill="rgba(10,15,29,0.35)" />

          {/* run dust: two recycled motes kicked up behind the heels, one per footfall (--step) */}
          {gait === "run" && (
            <g data-testid="worker-dust" shapeRendering="crispEdges" pointerEvents="none">
              <rect className="ol-dust" x={-6} y={-1} width={2} height={1} fill="#94a3b8" />
              <rect className="ol-dust" x={-4} y={-2} width={1} height={1} fill="#cbd5e1" />
            </g>
          )}

          <g ref={cueRef} className="ol-cue">
            <g className="ol-bob">
              {/* legs and shoes, hidden when seated behind a desk or chair */}
              {!seated && <Legs />}

              <g className="ol-lean">
                <g className="ol-upper">
                  {/* arms hang just outside the torso and are drawn behind it */}
                  <g className="ol-arm-l">
                    <Arm shoulder={SHOULDER_L} hand={hands.left} color={shirtColor} skinTone={skinTone} />
                    {/* smartwatch on the left wrist with its glowing cyan pip */}
                    <rect x={hands.left[0] - 2} y={hands.left[1] - 2} width={2} height={2} fill="#0284c7" stroke="#0a0f1d" strokeWidth={0.4} />
                    <rect className="ol-watch-pip" x={hands.left[0] - 1.5} y={hands.left[1] - 1.5} width={1} height={1} fill="#00f0ff" />
                  </g>
                  <g className="ol-arm-r" data-locked={rightLocked ? "" : undefined}>
                    <Arm shoulder={SHOULDER_R} hand={hands.right} color={shirtColor} skinTone={skinTone} />
                  </g>

                  {back && heldItems}

                  <Torso role={role} shirtColor={shirtColor} back={back} />

                  {/* ID CARD LANYARD (front only) */}
                  {badge && !back && (
                    <g shapeRendering="crispEdges">
                      <path d="M -3.5,-23.5 L 0,-16 L 3.5,-23.5" stroke="#475569" strokeWidth={0.8} fill="none" />
                      <rect x={-2.2} y={-16} width={4.4} height={5.2} fill="#f8fafc" stroke="#0a0f1d" strokeWidth={0.6} />
                      <rect x={-1.4} y={-15} width={2.8} height={2.2} fill="#3b82f6" />
                      <line x1={-1.4} y1={-12} x2={1.4} y2={-12} stroke="#64748b" strokeWidth={0.6} />
                    </g>
                  )}

                  {/* neck */}
                  <rect x={-2} y={-26.5} width={4} height={3} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.6} />

                  <g className="ol-head">
                    {back ? (
                      <g data-testid="worker-back-head">
                        {/* the back of the head is all hair, with the nape showing above the collar */}
                        <rect x={-6.5} y={-36} width={13} height={11} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.8} />
                        <rect x={-7} y={-38.5} width={14} height={4.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.8} />
                        <rect x={-4} y={-27} width={8} height={1.5} fill={skinTone} />
                        <rect x={-3.5} y={-37.5} width={7} height={1} fill="rgba(255,255,255,0.18)" />
                        {role === "engineer" && (
                          <g shapeRendering="crispEdges">
                            <path d="M -7,-35 L -7,-38.5 L 7,-38.5 L 7,-35" fill="none" stroke="#0a0f1d" strokeWidth={1.4} />
                            <rect x={-8} y={-33.5} width={3} height={4} fill="#1e293b" stroke="#00f0ff" strokeWidth={0.8} />
                            <rect x={5} y={-33.5} width={3} height={4} fill="#1e293b" stroke="#00f0ff" strokeWidth={0.8} />
                          </g>
                        )}
                      </g>
                    ) : (
                      <g data-testid="worker-face">
                        {/* face silhouette block */}
                        <rect x={-6.5} y={-36} width={13} height={11} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.8} />
                        {/* hair volume and pixel bangs */}
                        <rect x={-7} y={-38.5} width={14} height={4.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.8} />
                        <rect x={-6.5} y={-35.5} width={4} height={2.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
                        <rect x={-1.5} y={-35.5} width={3} height={3.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
                        <rect x={2.5} y={-35.5} width={4.5} height={2} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
                        <rect x={-7} y={-34.5} width={2} height={4.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
                        <rect x={5} y={-34.5} width={2} height={4.5} fill={hairColor} stroke="#0a0f1d" strokeWidth={0.6} />
                        <rect x={-3.5} y={-37.5} width={7} height={1} fill="rgba(255,255,255,0.3)" />

                        {/* OVER-EAR SRE HEADSET (for engineers) */}
                        {role === "engineer" && (
                          <g shapeRendering="crispEdges">
                            <path d="M -7,-35 L -7,-38.5 L 7,-38.5 L 7,-35" fill="none" stroke="#0a0f1d" strokeWidth={1.4} />
                            <path d="M -4,-38.5 L 4,-38.5" stroke="#38bdf8" strokeWidth={1} fill="none" />
                            <rect x={-8} y={-33.5} width={3} height={4} fill="#1e293b" stroke="#00f0ff" strokeWidth={0.8} />
                            <rect x={5} y={-33.5} width={3} height={4} fill="#1e293b" stroke="#00f0ff" strokeWidth={0.8} />
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
                      </g>
                    )}
                  </g>

                  {/* typing hands on the keyboard, in bursts with reading pauses */}
                  {typingNow && (
                    <g shapeRendering="crispEdges" data-testid="worker-typing">
                      <rect x={-5.5} y={-15.5} width={3} height={3} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.6} className="ol-type-l" />
                      <rect x={2.5} y={-15.5} width={3} height={3} fill={skinTone} stroke="#0a0f1d" strokeWidth={0.6} className="ol-type-r" />
                    </g>
                  )}

                  {!back && heldItems}
                </g>
              </g>
            </g>
          </g>
        </g>
      </g>

      {mood === "panic" && (
        <g shapeRendering="crispEdges">
          <g className="ol-pop">
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

      {/* startle balloon: a 7x9 pixel "!" with a tail, sprouting in the same wave as the hop */}
      {exclaim && mood !== "panic" && !reduced && (
        <g className="ol-exclaim" data-testid="worker-exclaim" shapeRendering="crispEdges" style={{ "--wave": `${waveMs}ms` } as CSSProperties}>
          <rect x={-3.5} y={-52} width={7} height={9} fill="#fef2f2" stroke="#0a0f1d" strokeWidth={0.8} />
          <rect x={-0.5} y={-50} width={1.5} height={4} fill="#dc2626" />
          <rect x={-0.5} y={-45} width={1.5} height={1} fill="#dc2626" />
          <rect x={-1} y={-43} width={2} height={1.5} fill="#fef2f2" stroke="#0a0f1d" strokeWidth={0.5} />
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
        <g className="ol-pop" shapeRendering="crispEdges">
          <rect x={3} y={-46} width={8} height={8} fill="#10b981" stroke="#0a0f1d" strokeWidth={0.8} />
          <text x={7} y={-40} textAnchor="middle" fill="white" style={{ fontSize: 6, fontWeight: 900 }}>
            ★
          </text>
        </g>
      )}

      {mood === "recovering" && (
        <g className="ol-pop" shapeRendering="crispEdges">
          <rect x={-9} y={-44} width={8} height={8} fill="#0ea5e9" stroke="#0a0f1d" strokeWidth={0.8} />
          <text x={-5} y={-38} textAnchor="middle" fill="white" style={{ fontSize: 5.5, fontWeight: 900 }}>
            ⚡
          </text>
        </g>
      )}

      {holdsMug && !back && (
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
