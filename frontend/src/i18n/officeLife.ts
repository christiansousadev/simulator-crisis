// COPY FOR THE LIVING OFFICE SCENE: sprite labels, the vacancy marker, the restore chip, the rack
// radial menu and the build-mode ghost. Kept in its own module so translations.ts only needs one
// field per locale.

export interface OfficeLifeCopy {
  workerLabel: string;
  moods: { idle: string; panic: string; running: string; tired: string; happy: string; recovering: string };
  places: { desk: string; reserve: string; server: string; lounge: string; entering: string };
  vacantDesk: string;
  restored: string;
  predictiveAnomaly: string;
  receptionist: string;
  radial: {
    ariaLabel: (service: string) => string;
    focus: string;
    triage: string;
    noFault: string;
    detail: string;
    close: string;
    noOpenIncident: string;
  };
  buildGhost: { nextSlot: string };
}

export const officeLifeEn: OfficeLifeCopy = {
  workerLabel: "Worker",
  moods: { idle: "idle", panic: "panicking", running: "on it", tired: "tired", happy: "happy", recovering: "recovering" },
  places: { desk: "AT DESK", reserve: "RESERVE DESK", server: "AT THE VAULT", lounge: "ON BREAK", entering: "NEW HIRE" },
  vacantDesk: "VACANT",
  restored: "RESTORED",
  predictiveAnomaly: "Predictive anomaly detected: latency or error rate is drifting",
  receptionist: "Receptionist",
  radial: {
    ariaLabel: (service) => `Rack actions for ${service}`,
    focus: "FOCUS",
    triage: "TRIAGE LOGS",
    noFault: "NO FAULT",
    detail: "INCIDENT",
    close: "CLOSE",
    noOpenIncident: "No open incident on this service",
  },
  buildGhost: { nextSlot: "NEXT SLOT" },
};
