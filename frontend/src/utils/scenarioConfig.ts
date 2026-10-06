import { CustomScenarioConfig } from "../types/game";

// bounds mirror backend CustomScenarioConfig (app/schemas/scenario.py); the sliders use narrower,
// friendlier ranges inside them
export const CONFIG_LIMITS = {
  duration: { min: 10, max: 720, step: 10, backendMax: 100_000 },
  hazard: { min: 0, max: 5, step: 0.1, backendMax: 20 },
  // the backend requires budget_floor < the standard starting budget (250,000)
  budgetFloor: { min: 0, max: 240_000, step: 5_000 },
  maxInjections: 50,
  // backendMin/backendMax are what the backend accepts; the slider uses a friendlier range inside it
  startingBudget: { min: 10_000, max: 1_000_000, step: 5_000, backendMin: 1_000, backendMax: 2_000_000 },
  startingTechDebt: { min: 0, max: 100, step: 1 },
} as const;

// what the standard difficulty starts with (the custom loader always resets with it); shown as the
// "use difficulty default" value and as the seed when a field is switched on
export const STARTING_DEFAULTS = { budget: 250_000, techDebt: 25 } as const;

export const SERVICE_IDS = ["srv-auth", "srv-payment", "srv-api-gw", "srv-search", "srv-notify"] as const;

export const DEFAULT_CUSTOM_CONFIG: CustomScenarioConfig = {
  duration_ticks: 60,
  hazard_multiplier: 1.5,
  budget_floor: 20000,
  chaos_injections: [],
};

export type ConfigError =
  | { field: "duration" }
  | { field: "hazard" }
  | { field: "budgetFloor" }
  | { field: "startingBudgetRange" }
  | { field: "startingBudgetFloor" }
  | { field: "startingTechDebt" }
  | { field: "tooManyInjections" }
  | { field: "injectionTick"; index: number }
  | { field: "injectionService"; index: number };

// EVERYTHING THE BACKEND WOULD REJECT, FOUND CLIENT-SIDE SO IT CAN BE SHOWN NEXT TO THE FIELD
export function validateConfig(config: CustomScenarioConfig): ConfigError[] {
  const errors: ConfigError[] = [];
  if (!Number.isFinite(config.duration_ticks) || config.duration_ticks < CONFIG_LIMITS.duration.min || config.duration_ticks > CONFIG_LIMITS.duration.backendMax) {
    errors.push({ field: "duration" });
  }
  if (!Number.isFinite(config.hazard_multiplier) || config.hazard_multiplier < 0 || config.hazard_multiplier > CONFIG_LIMITS.hazard.backendMax) {
    errors.push({ field: "hazard" });
  }
  if (!Number.isFinite(config.budget_floor) || config.budget_floor < 0 || config.budget_floor >= 250_000) {
    errors.push({ field: "budgetFloor" });
  }
  const startingBudget = config.starting_budget;
  if (startingBudget !== undefined) {
    const { backendMin, backendMax } = CONFIG_LIMITS.startingBudget;
    if (!Number.isFinite(startingBudget) || startingBudget < backendMin || startingBudget > backendMax) {
      errors.push({ field: "startingBudgetRange" });
    } else if (Number.isFinite(config.budget_floor) && startingBudget <= config.budget_floor) {
      // the backend rejects a start at or below the floor: it would be an instant defeat
      errors.push({ field: "startingBudgetFloor" });
    }
  }
  const startingDebt = config.starting_tech_debt;
  if (startingDebt !== undefined && (!Number.isInteger(startingDebt) || startingDebt < 0 || startingDebt > 100)) {
    errors.push({ field: "startingTechDebt" });
  }
  if (config.chaos_injections.length > CONFIG_LIMITS.maxInjections) errors.push({ field: "tooManyInjections" });
  config.chaos_injections.forEach((inj, index) => {
    // an injection at or after the end of the window would never fire
    if (!Number.isInteger(inj.at_tick) || inj.at_tick < 0 || inj.at_tick >= config.duration_ticks) {
      errors.push({ field: "injectionTick", index });
    }
    if (!(SERVICE_IDS as readonly string[]).includes(inj.service_id)) errors.push({ field: "injectionService", index });
  });
  return errors;
}

// ENCODE A CONFIG AS A SHAREABLE BASE64 CHALLENGE CODE. The optional starting conditions are only
// written when set, so a code without them stays byte-identical to the ones issued before they existed.
export function encodeChallengeCode(config: CustomScenarioConfig): string {
  const payload: CustomScenarioConfig = {
    duration_ticks: config.duration_ticks,
    hazard_multiplier: config.hazard_multiplier,
    budget_floor: config.budget_floor,
    chaos_injections: config.chaos_injections,
  };
  if (config.starting_budget !== undefined) payload.starting_budget = config.starting_budget;
  if (config.starting_tech_debt !== undefined) payload.starting_tech_debt = config.starting_tech_debt;
  return btoa(JSON.stringify(payload));
}

// an optional numeric field: absent/null = "use the default", a number = set, anything else = malformed
function optionalNumber(value: unknown): number | undefined | "invalid" {
  if (value === undefined || value === null) return undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : "invalid";
}

// DECODE A SHARED CHALLENGE CODE; NULL WHEN IT IS NOT A WELL-FORMED CONFIG (OLD CODES WITHOUT THE
// STARTING CONDITIONS STILL DECODE, THOSE FIELDS JUST STAY UNSET)
export function decodeChallengeCode(code: string): CustomScenarioConfig | null {
  try {
    const raw = JSON.parse(atob(code.trim())) as (Partial<CustomScenarioConfig> & Record<string, unknown>) | null;
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.duration_ticks !== "number" || typeof raw.hazard_multiplier !== "number" || typeof raw.budget_floor !== "number") return null;
    const startingBudget = optionalNumber(raw.starting_budget);
    const startingDebt = optionalNumber(raw.starting_tech_debt);
    if (startingBudget === "invalid" || startingDebt === "invalid") return null;
    const injections = Array.isArray(raw.chaos_injections) ? raw.chaos_injections : [];
    const config: CustomScenarioConfig = {
      duration_ticks: raw.duration_ticks,
      hazard_multiplier: raw.hazard_multiplier,
      budget_floor: raw.budget_floor,
      chaos_injections: injections
        .filter((inj) => inj && typeof inj.at_tick === "number" && typeof inj.service_id === "string")
        .map((inj) => ({ at_tick: inj.at_tick, service_id: inj.service_id })),
    };
    if (startingBudget !== undefined) config.starting_budget = startingBudget;
    if (startingDebt !== undefined) config.starting_tech_debt = startingDebt;
    return config;
  } catch {
    return null;
  }
}
