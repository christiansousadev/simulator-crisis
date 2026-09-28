import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../../store/useGameStore";
import OfficeWorker, { WorkerMood } from "./OfficeWorker";

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
}

// AMBIENT NPC PATROLLING A LOOP OF WAYPOINTS: COFFEE MACHINE, SOFA, PING-PONG TABLE
export default function WanderingEmployee({ waypoints, shirtColor, hairColor, dwellMs = 4500 }: WanderingEmployeeProps) {
  const happiness = useGameStore((s) => s.telemetry.user_happiness);
  const [index, setIndex] = useState(0);

  // happiness drifts almost every tick broadcast (SimulationEngine applies a ±0.2-0.7 drift per
  // tick), so closing over the reactive value here previously tore the interval down and
  // recreated it well before dwellMs could elapse, on nearly every render -- the callback that
  // advances `index` effectively never ran, and NPCs stood frozen at their first waypoint for
  // the whole session. A ref lets the interval keep the current happiness without restarting.
  const happinessRef = useRef(happiness);
  happinessRef.current = happiness;

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => {
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
  }, [waypoints, dwellMs]);

  const current = waypoints[index];

  let mood: WorkerMood = "idle";
  if (happiness < 40) mood = "tired";
  else if (current.action === "coffee" || current.action === "pingpong") mood = "happy";

  return (
    <OfficeWorker
      x={current.x}
      y={current.y}
      shirtColor={shirtColor}
      hairColor={hairColor}
      mood={mood}
      holdsMug={current.action === "coffee"}
      transitionMs={1800}
    />
  );
}
