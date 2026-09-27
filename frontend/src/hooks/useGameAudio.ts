import { useEffect, useRef } from "react";
import { useGameStore } from "../store/useGameStore";
import {
  playCriticalHeartbeat,
  playChaChing,
  playIncidentChirp,
  playRedAlertSiren,
  playRestoredChime,
} from "../utils/sound";

const RED_ALERT_SIREN_INTERVAL_MS = 1050;
const CRITICAL_HEARTBEAT_INTERVAL_MS = 1400;
const LOW_RUNWAY_THRESHOLD = 15000;

// watches the incident stream and chirps an alarm on spawn, a chime when a node recovers
export function useGameAudio() {
  const incidents = useGameStore((s) => s.telemetry.active_incidents);
  const budget = useGameStore((s) => s.telemetry.budget);
  const status = useGameStore((s) => s.telemetry.status);
  const recentAudits = useGameStore((s) => s.telemetry.recent_audits);
  const knownIds = useRef<Set<string>>(new Set());
  const knownAuditIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const nextIds = new Set(incidents.map((i) => i.id));

    for (const inc of incidents) {
      if (!knownIds.current.has(inc.id)) {
        playIncidentChirp(inc.severity === "P1_CRITICAL");
      }
    }
    for (const id of knownIds.current) {
      if (!nextIds.has(id)) {
        playRestoredChime();
      }
    }

    knownIds.current = nextIds;
  }, [incidents]);

  // retro cash-register jingle the instant a monthly audit cycle is survived
  useEffect(() => {
    if (knownAuditIds.current === null) {
      knownAuditIds.current = new Set(recentAudits.map((a) => a.id));
      return;
    }
    for (const audit of recentAudits) {
      if (knownAuditIds.current.has(audit.id)) continue;
      knownAuditIds.current.add(audit.id);
      if (audit.event_type === "MONTHLY_AUDIT_CYCLE_SURVIVED") {
        playChaChing();
      }
    }
  }, [recentAudits]);

  // rotary emergency siren, looping for as long as a P1 is actively burning or sla is breached.
  // gated on a stable boolean (not the raw incidents array, which gets a new reference every
  // single tick from the backend) so the interval isn't torn down and restarted every tick.
  const hasP1Alert = incidents.some((i) => i.severity === "P1_CRITICAL") || status === "breached";
  useEffect(() => {
    if (!hasP1Alert) return;
    playRedAlertSiren();
    const interval = setInterval(playRedAlertSiren, RED_ALERT_SIREN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasP1Alert]);

  // tense cardiac-monitor beep while the runway is nearly exhausted, same stable-boolean guard
  const lowRunway = budget < LOW_RUNWAY_THRESHOLD && status !== "bankrupted";
  useEffect(() => {
    if (!lowRunway) return;
    playCriticalHeartbeat();
    const interval = setInterval(playCriticalHeartbeat, CRITICAL_HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [lowRunway]);
}
