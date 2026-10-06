import type { OfficeLifeCopy } from "../../officeLife";

export const officeLifeEs = {
  workerLabel: "Empleado",
  moods: { idle: "tranquilo", panic: "en pánico", running: "en ello", tired: "cansado", happy: "contento", recovering: "recuperándose" },
  places: { desk: "EN SU PUESTO", reserve: "PUESTO DE RESERVA", server: "EN LA BÓVEDA", lounge: "DESCANSANDO", entering: "NUEVA CONTRATACIÓN" },
  vacantDesk: "VACANTE",
  restored: "RESTAURADO",
  predictiveAnomaly: "Anomalía prevista: la latencia o la tasa de error se desvía",
  receptionist: "Recepcionista",
  radial: {
    ariaLabel: (service) => `Acciones del rack ${service}`,
    focus: "ENFOCAR",
    triage: "TRIAR LOGS",
    noFault: "SIN FALLO",
    detail: "INCIDENTE",
    close: "CERRAR",
    noOpenIncident: "No hay incidente abierto en este servicio",
  },
  buildGhost: { nextSlot: "SIGUIENTE HUECO" },
} satisfies OfficeLifeCopy;
