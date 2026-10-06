import type { OfficeLifeCopy } from "../../officeLife";

export const officeLifePt = {
  workerLabel: "Funcionário",
  moods: { idle: "tranquilo", panic: "em pânico", running: "na missão", tired: "cansado", happy: "feliz", recovering: "recuperando" },
  places: { desk: "NA MESA", reserve: "MESA RESERVA", server: "NO COFRE", lounge: "NA PAUSA", entering: "NOVO NA EQUIPE" },
  vacantDesk: "VAGA",
  restored: "RESTAURADO",
  predictiveAnomaly: "Anomalia prevista: latência ou taxa de erro em deriva",
  receptionist: "Recepcionista",
  radial: {
    ariaLabel: (service) => `Ações do rack ${service}`,
    focus: "FOCAR",
    triage: "TRIAR LOGS",
    noFault: "SEM FALHA",
    detail: "INCIDENTE",
    close: "FECHAR",
    noOpenIncident: "Nenhum incidente aberto neste serviço",
  },
  buildGhost: { nextSlot: "PRÓXIMA VAGA" },
} satisfies OfficeLifeCopy;
