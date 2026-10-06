import { useEffect } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { useGameStore } from "../../store/useGameStore";
import { planTargets, workedServiceIds } from "./rosterPlan";
import { rosterChoreographer } from "./rosterStage";

// a hire this young (in ticks) walks in through reception; anyone older was already on the books
export const FRESH_HIRE_TICKS = 2;

// FEEDS THE ROSTER FROM TELEMETRY INTO THE WALKING STAGE. Renders nothing. It re-plans only when
// who-is-where could change (roster membership, duty status, which services have a picked-up
// incident), never on a plain tick, and the walking itself runs on JS timers so it keeps going while
// the simulation is paused. Reduced motion places everyone straight at their destination.
export default function RosterDirector() {
  const rosterKey = useGameStore((s) =>
    s.telemetry.engineers.map((e) => `${e.id}:${e.assigned_service_id ?? "-"}:${e.on_call_status}:${e.hired_at_tick}`).join("|")
  );
  const workedKey = useGameStore((s) => workedServiceIds(s.telemetry.active_incidents).join(","));
  const reduced = useReducedMotion();

  useEffect(() => {
    const { telemetry } = useGameStore.getState();
    const worked = new Set(workedKey ? workedKey.split(",") : []);
    const hiredAt = new Map(telemetry.engineers.map((e) => [e.id, e.hired_at_tick]));
    const targets = planTargets(telemetry.engineers, worked).map((p) => ({
      id: p.id,
      nodeId: p.nodeId,
      place: p.place,
      mug: p.mug,
      fresh: telemetry.tick - (hiredAt.get(p.id) ?? Number.NEGATIVE_INFINITY) <= FRESH_HIRE_TICKS,
    }));
    rosterChoreographer.sync(targets, { instant: reduced });
  }, [rosterKey, workedKey, reduced]);

  useEffect(() => () => rosterChoreographer.dispose(), []);

  return null;
}
