// tick-to-clock conversion shared between the topbar readout and the day/night lighting system
// convention: 1 tick = 1 game hour, 24 ticks = 1 calendar day

export function getHourOfDay(tick: number): number {
  return tick % 24;
}

export function getDayNumber(tick: number): number {
  return Math.floor(tick / 24) + 1;
}

export type DayPhase = "dawn" | "morning" | "noon" | "afternoon" | "dusk" | "night";

// phase boundaries: dawn (06:00), noon (12:00), dusk (18:00), night shift (22:00-05:00)
export function getDayPhase(hour: number): DayPhase {
  if (hour >= 22 || hour < 5) return "night";
  if (hour >= 5 && hour < 7) return "dawn";
  if (hour >= 7 && hour < 11) return "morning";
  if (hour >= 11 && hour < 13) return "noon";
  if (hour >= 13 && hour < 18) return "afternoon";
  return "dusk";
}
