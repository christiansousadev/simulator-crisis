import { useGameStore } from "../store/useGameStore";

// TRUE WHILE THE OFFICE IS ON RED ALERT: A CRITICAL-TIER SERVICE IS DOWN (A P1) OR THE SLA IS BREACHED.
// a boolean selector, so subscribers only re-render when the alert actually starts or ends.
export function useRedAlert(): boolean {
  return useGameStore(
    (s) => s.telemetry.status === "breached" || s.telemetry.services.some((svc) => svc.tier === "critical" && svc.status === "down")
  );
}
