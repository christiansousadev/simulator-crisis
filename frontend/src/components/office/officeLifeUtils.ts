import type { ServiceStatus } from "../../types/game";
import { getDayPhase } from "../../utils/officeClock";

// small pure helpers shared by the living-office components

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A DETERMINISTIC NEGATIVE ANIMATION DELAY (MS) SO EVERY LED OF EVERY RACK BLINKS OUT OF PHASE
// with its neighbours instead of the whole room pulsing in lockstep. same inputs, same phase.
export function ledPhaseMs(serviceId: string, ledIndex: number, periodMs: number): number {
  const h = hashString(`${serviceId}#${ledIndex}`);
  return -Math.round((h % 1000) / 1000 * periodMs);
}

export type LedPattern = "breathe" | "stutter" | "solid";

// LED PATTERN BY STATUS: HEALTHY BREATHES SLOWLY, DEGRADED STUTTERS, DOWN IS SOLID
export function ledPatternFor(status: ServiceStatus): LedPattern {
  if (status === "down") return "solid";
  if (status === "degraded") return "stutter";
  return "breathe";
}

export const LED_COLOR: Record<ServiceStatus, string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  down: "#ef4444",
};

// subtle per-status cabinet tint (neutral zinc, nudged warm for degraded and red for down)
export const CABINET_COLOR: Record<ServiceStatus, string> = {
  healthy: "#3f3f46",
  degraded: "#4a4540",
  down: "#4d3b3f",
};

// HAND ANGLES (DEGREES CLOCKWISE FROM 12 O'CLOCK) FOR A GAME HOUR. one tick is one game hour, so the
// minute hand rests at 12 and the hour hand sweeps a quarter of the dial every three ticks
export function clockHandAngles(hour: number): { hour: number; minute: number } {
  const h = ((hour % 24) + 24) % 24;
  return { hour: (h % 12) * 30, minute: 0 };
}

export function isNightHour(hour: number): boolean {
  return getDayPhase(((hour % 24) + 24) % 24) === "night";
}

// MONITOR TINT FOR A DESK. null = dark screen
export function deskScreenColor(opts: {
  status: ServiceStatus;
  investigating: boolean;
  mitigating: boolean;
  engineerPresent: boolean;
}): string | null {
  if (opts.status === "down") return "#ef4444";
  if (opts.mitigating) return "#10b981";
  if (opts.investigating) return "#f59e0b";
  if (opts.status === "degraded") return "#38bdf8";
  return opts.engineerPresent ? "#38bdf8" : null;
}

// RESTING FACING: NPCS THAT STOP TO WATCH THE VAULT ON A RED ALERT TURN TOWARDS IT (WEST / NORTH-WEST
// of everything, which is screen-left in the isometric projection)
export const FACE_VAULT = "left" as const;
