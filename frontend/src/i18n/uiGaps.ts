// COPY FOR THE FOUR UI GAPS CLOSED IN ONE PASS: the hire flow's service assignment, removing placed
// infrastructure, the read-only /live-ops observer and the scenario builder's starting conditions.
// Kept in its own module so translations.ts only needs one field per locale.

export interface UiGapsCopy {
  hire: {
    specialty: string;
    service: string;
    recommended: string;
    vacant: string;
    matchLine: string;
    mismatchLine: (quality: string) => string;
    confirm: (cost: string) => string;
    needCash: (cost: string, short: string) => string;
    covers: (service: string) => string;
    reserve: string;
    vacancies: (services: string) => string;
  };
  nodes: {
    heading: string;
    paid: (amount: string) => string;
    asProducer: string;
    remove: string;
    removeAria: (name: string) => string;
    confirmPrompt: string;
    confirm: string;
    cancel: string;
    removing: string;
    removed: (name: string) => string;
    removeFailed: string;
  };
  observer: { badge: string; hint: string };
  builder: {
    startingBudget: string;
    startingTechDebt: string;
    useDefault: string;
    defaultBudget: (amount: string) => string;
    defaultTechDebt: (value: number) => string;
    errBudgetRange: string;
    errBudgetAboveFloor: (floor: string) => string;
    errTechDebt: string;
    hintTechDebt: string;
  };
}

export const uiGapsEn: UiGapsCopy = {
  hire: {
    specialty: "Specialty",
    service: "Covers service",
    recommended: "recommended",
    vacant: "no coverage",
    matchLine: "Specialist: full effect",
    mismatchLine: (quality) => `Off-specialty: ${quality} quality`,
    confirm: (cost) => `Hire (${cost})`,
    needCash: (cost, short) => `Not enough cash: hiring costs ${cost}, you are ${short} short.`,
    covers: (service) => `Covers ${service}`,
    reserve: "Reserve desk (no service)",
    vacancies: (services) => `No engineer covers: ${services}`,
  },
  nodes: {
    heading: "Installed hardware",
    paid: (amount) => `${amount} paid`,
    asProducer: "as producer",
    remove: "Remove",
    removeAria: (name) => `Remove ${name}`,
    confirmPrompt: "No refund. Remove?",
    confirm: "Confirm",
    cancel: "Cancel",
    removing: "Removing…",
    removed: (name) => `${name} removed`,
    removeFailed: "Could not remove the hardware module",
  },
  observer: {
    badge: "Observer mode — read only",
    hint: "Commands are disabled on this screen.",
  },
  builder: {
    startingBudget: "Starting Budget ($)",
    startingTechDebt: "Starting Tech Debt (TDI)",
    useDefault: "Use difficulty default",
    defaultBudget: (amount) => `Default: ${amount}`,
    defaultTechDebt: (value) => `Default: ${value}`,
    errBudgetRange: "Starting budget must be between $1,000 and $2,000,000.",
    errBudgetAboveFloor: (floor) => `Starting budget must be above the budget floor (${floor}).`,
    errTechDebt: "Starting tech debt must be a whole number from 0 to 100.",
    hintTechDebt: "Higher debt makes incidents more likely from the first tick.",
  },
};
