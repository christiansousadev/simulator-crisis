import { useEffect, useRef } from "react";
import { useGameStore } from "../store/useGameStore";
import {
  playCriticalHeartbeat,
  playChaChing,
  playIncidentChirp,
  playMitigationMismatch,
  playRedAlertSiren,
  playRestoredChime,
  stopCriticalHeartbeat,
  stopRedAlertSiren,
} from "../utils/sound";
import { isGameplayActive } from "../utils/audioMode";

const RED_ALERT_SIREN_INTERVAL_MS = 1050;
const CRITICAL_HEARTBEAT_INTERVAL_MS = 1400;
const LOW_RUNWAY_THRESHOLD = 15000;

// watches the incident stream and chirps an alarm on spawn, a chime when a node recovers
export function useGameAudio() {
  const incidents = useGameStore((s) => s.telemetry.active_incidents);
  const budget = useGameStore((s) => s.telemetry.budget);
  const status = useGameStore((s) => s.telemetry.status);
  const recentAudits = useGameStore((s) => s.telemetry.recent_audits);
  const isRunning = useGameStore((s) => s.telemetry.is_running);
  const titleScreenVisible = useGameStore((s) => s.titleScreenVisible);
  const pauseMenuOpen = useGameStore((s) => s.pauseMenuOpen);
  const settingsOpen = useGameStore((s) => s.settingsOpen);
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
      } else if (audit.event_type === "RUNBOOK_EXECUTED" && audit.details.fully_resolved === false) {
        // a mismatched runbook -- distinct dull tone from the restored chime a genuine full fix gets
        playMitigationMismatch();
      }
    }
  }, [recentAudits]);

  // the alarm loops belong to live gameplay only: silent on the title, in menus, while paused and
  // once the run has ended (the stable boolean also keeps the effects from restarting every tick)
  const gameplayActive = isGameplayActive({ titleScreenVisible, pauseMenuOpen, settingsOpen, isRunning, status });

  // rotary emergency siren, looping for as long as a P1 is actively burning or sla is breached.
  // gated on a stable boolean (not the raw incidents array, which gets a new reference every
  // single tick from the backend) so the interval isn't torn down and restarted every tick.
  const hasP1Alert = incidents.some((i) => i.severity === "P1_CRITICAL") || status === "breached";
  const sirenOn = hasP1Alert && gameplayActive;
  useEffect(() => {
    if (!sirenOn) return;
    playRedAlertSiren();
    const interval = setInterval(playRedAlertSiren, RED_ALERT_SIREN_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      stopRedAlertSiren();
    };
  }, [sirenOn]);

  // tense cardiac-monitor beep while the runway is nearly exhausted, same stable-boolean guard
  const heartbeatOn = budget < LOW_RUNWAY_THRESHOLD && status !== "bankrupted" && gameplayActive;
  useEffect(() => {
    if (!heartbeatOn) return;
    playCriticalHeartbeat();
    const interval = setInterval(playCriticalHeartbeat, CRITICAL_HEARTBEAT_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      stopCriticalHeartbeat();
    };
  }, [heartbeatOn]);
}
