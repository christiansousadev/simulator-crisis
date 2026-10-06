import { useCallback } from "react";
import { useTranslation } from "../i18n/useTranslation";
import { api } from "../services/api";
import { useGameStore } from "../store/useGameStore";
import { Incident } from "../types/game";
import { playAcknowledgeBeep, playErrorSound } from "../utils/sound";
import { runExclusive, usePendingActions } from "./useAsyncAction";

export const ackKey = (incidentId: string) => `ack:${incidentId}`;

// ONE ACKNOWLEDGE FLOW FOR EVERY BUTTON (DOCK CARD, ALERT STACK, INCIDENT MODAL): same beep, same
// success toast, same error toast with the backend's own message, and no double submit -- the
// button stays pending until the next telemetry frame shows the incident is no longer "active".
export function useAcknowledgeIncident() {
  const t = useTranslation();
  const pending = usePendingActions();

  const acknowledge = useCallback(
    (incident: Pick<Incident, "id" | "service_id">) => {
      const store = useGameStore.getState();
      return runExclusive(ackKey(incident.id), () => api.acknowledgeIncident(incident.id), {
        onStart: () => playAcknowledgeBeep(),
        confirmed: (s) => {
          const live = s.telemetry.active_incidents.find((i) => i.id === incident.id);
          return !live || live.status !== "active";
        },
        onSuccess: () => {
          const name = useGameStore.getState().telemetry.services.find((s) => s.id === incident.service_id)?.name ?? incident.service_id;
          store.triggerRunAnimation(incident.service_id, "acknowledge");
          store.pushFloatingText(t.hud.incidents.acknowledgedToast(name.toUpperCase()), "success");
          // a paused simulation broadcasts no tick, so pull the snapshot to show the new status
          if (!useGameStore.getState().telemetry.is_running) {
            api.getState().then((frame) => useGameStore.getState().setTelemetry(frame)).catch(() => {});
          }
        },
        onError: (err) => {
          playErrorSound();
          store.pushFloatingText(err instanceof Error && err.message ? err.message : t.floatingTexts.actionFailed, "danger");
        },
      });
    },
    [t]
  );

  return { acknowledge, isAcknowledging: (incidentId: string) => pending.has(ackKey(incidentId)) };
}
