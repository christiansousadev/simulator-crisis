import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useRedAlert } from "../../hooks/useRedAlert";
import { useGameStore } from "../../store/useGameStore";
import OfficeWorker, { WorkerMood } from "./OfficeWorker";
import { FACE_VAULT } from "./officeLifeUtils";

type WaypointAction = "walk" | "coffee" | "sofa" | "pingpong";

interface Waypoint {
  x: number;
  y: number;
  action: WaypointAction;
  requiresMoraleAbove?: number;
}

interface WanderingEmployeeProps {
  waypoints: Waypoint[];
  shirtColor: string;
  hairColor: string;
  dwellMs?: number;
  // reports the waypoint action this employee has actually arrived at (fired WALK_TRANSITION_MS
  // after the target changes, matching OfficeWorker's own walk-eased transition below) -- lets a
  // parent scene sync a prop's own animation (e.g. BreakRoom's ping-pong ball) to whether anyone
  // is actually standing there, instead of guessing from an unrelated global condition
  onActionChange?: (action: WaypointAction) => void;
}

const WALK_TRANSITION_MS = 1800;
// seat height of the lounge sofa
const SOFA_SEAT_Z = 0.2;

// AMBIENT NPC PATROLLING A LOOP OF WAYPOINTS: COFFEE MACHINE, SOFA, PING-PONG TABLE. it sits down for real
// on a sofa waypoint, stops and turns to watch the vault while the office is on red alert, and stays put
// under reduced motion instead of teleporting between waypoints every few seconds.
export default function WanderingEmployee({
  waypoints,
  shirtColor,
  hairColor,
  dwellMs = 4500,
  onActionChange,
}: WanderingEmployeeProps) {
  const happiness = useGameStore((s) => s.telemetry.user_happiness);
  const redAlert = useRedAlert();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  // the index whose walk has finished, so the legs stay until the sprite really arrives and sits
  const [arrivedIndex, setArrivedIndex] = useState<number | null>(null);

  // happiness drifts almost every tick broadcast (SimulationEngine applies a ±0.2-0.7 drift per
  // tick), so closing over the reactive value here previously tore the interval down and
  // recreated it well before dwellMs could elapse, on nearly every render -- the callback that
  // advances `index` effectively never ran, and NPCs stood frozen at their first waypoint for
  // the whole session. A ref lets the interval keep the current happiness without restarting.
  const happinessRef = useRef(happiness);
  happinessRef.current = happiness;
  const redAlertRef = useRef(redAlert);
  redAlertRef.current = redAlert;
  // a ref as well: a parent that rebuilds its waypoint array on render must not restart the patrol timer
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;

  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => {
      // everyone stops what they are doing and watches the vault until the alert is over
      if (redAlertRef.current) return;
      setIndex((current) => {
        const waypoints = waypointsRef.current;
        let next = (current + 1) % waypoints.length;
        // skip waypoints gated behind a morale threshold nobody feels like playing at
        let guard = 0;
        while (
          waypoints[next].requiresMoraleAbove !== undefined &&
          happinessRef.current < waypoints[next].requiresMoraleAbove! &&
          guard < waypoints.length
        ) {
          next = (next + 1) % waypoints.length;
          guard++;
        }
        return next;
      });
    }, dwellMs);
    return () => clearInterval(timer);
  }, [dwellMs, reduced]);

  const current = waypoints[index];

  // notify the parent once the walk to this waypoint has actually finished, not the instant the
  // target changes -- otherwise a prop keyed off this (e.g. the ping-pong ball) starts animating
  // while the sprite is still visibly mid-stride toward it
  const onActionChangeRef = useRef(onActionChange);
  onActionChangeRef.current = onActionChange;
  useEffect(() => {
    const timer = setTimeout(() => {
      setArrivedIndex(index);
      onActionChangeRef.current?.(current.action);
    }, WALK_TRANSITION_MS);
    return () => clearTimeout(timer);
    // keyed on `index`, not `current.action`: two consecutive waypoints could in principle share
    // an action label, and each arrival should still fire its own notification
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const seated = current.action === "sofa" && arrivedIndex === index;

  let mood: WorkerMood = "idle";
  if (happiness < 40) mood = "tired";
  else if (!redAlert && (current.action === "coffee" || current.action === "pingpong")) mood = "happy";

  return (
    <OfficeWorker
      x={current.x}
      y={current.y}
      z={seated ? SOFA_SEAT_Z : 0}
      shirtColor={shirtColor}
      hairColor={hairColor}
      mood={mood}
      holdsMug={current.action === "coffee" && !redAlert}
      seated={seated}
      facing={redAlert ? FACE_VAULT : undefined}
      transitionMs={WALK_TRANSITION_MS}
    />
  );
}
