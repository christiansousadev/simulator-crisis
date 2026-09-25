import { useEffect, useRef } from "react";
import { useGameStore } from "../store/useGameStore";
import { playIncidentChirp, playRestoredChime } from "../utils/sound";

// watches the incident stream and chirps an alarm on spawn, a chime when a node recovers
export function useGameAudio() {
  const incidents = useGameStore((s) => s.telemetry.active_incidents);
  const knownIds = useRef<Set<string>>(new Set());

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
}
