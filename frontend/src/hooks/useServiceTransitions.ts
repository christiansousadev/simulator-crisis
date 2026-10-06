import { useEffect, useRef } from "react";
import { TRANSITION_TTL_MS, diffServiceStatuses } from "../components/office/serviceTransitions";
import type { StatusSnapshot } from "../components/office/serviceTransitions";
import { useGameStore } from "../store/useGameStore";
import type { Service } from "../types/game";

// WATCH THE SERVICE FLEET FOR STATUS CHANGES AND EMIT `degrade` / `fail` / `recover` RUN-ANIMATIONS.
// mount it exactly once (ServerRoom does): the office fx -- rack shake, cascade ripple, restore
// sequence -- all read those run-animations, and this hook alone owns dismissing them after their ttl.
// nothing is emitted for the first frame of a session, so loading mid-incident never replays a failure.
export function useServiceTransitions(services: readonly Service[]): void {
  const sessionId = useGameStore((s) => s.telemetry.session_id);
  const trigger = useGameStore((s) => s.triggerRunAnimation);
  const dismiss = useGameStore((s) => s.dismissRunAnimation);
  const previous = useRef<StatusSnapshot | null>(null);
  const previousSession = useRef(sessionId);

  useEffect(() => {
    // a new session (reset) starts a fresh baseline instead of diffing against the old fleet
    if (previousSession.current !== sessionId) {
      previousSession.current = sessionId;
      previous.current = null;
    }
    // an empty fleet is the pre-connection placeholder, not a baseline worth diffing against
    if (services.length === 0) return;
    const { transitions, next } = diffServiceStatuses(previous.current, services);
    previous.current = next;
    for (const t of transitions) {
      const id = trigger(t.serviceId, t.kind);
      // not cleared on unmount: dismissing an already-gone id is a no-op, and a lingering entry is not
      setTimeout(() => dismiss(id), TRANSITION_TTL_MS[t.kind]);
    }
  }, [services, sessionId, trigger, dismiss]);
}
