// tick-to-clock conversion shared between the topbar readout and the day/night lighting system
// convention: 1 tick = 1 game hour, 24 ticks = 1 calendar day
// the clock starts at 08:00 (tick 0) so a fresh session opens on a bright office instead of the
// small hours; this is purely presentational, the backend never sees the offset

export const START_HOUR = 8;

export function getHourOfDay(tick: number): number {
  return (((tick + START_HOUR) % 24) + 24) % 24;
}

export function getDayNumber(tick: number): number {
  return Math.floor((tick + START_HOUR) / 24) + 1;
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

// daylight keyframes over a 24h loop (hour, 0..1); smoothstepped between neighbours so the curve
// is continuous and has no kinks at the keys, unlike the six discrete phases above
const DAYLIGHT_KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [4.5, 0],
  [6.5, 0.45],
  [8, 0.96],
  [10, 1],
  [15.5, 1],
  [17.5, 0.82],
  [19, 0.4],
  [20.5, 0.08],
  [22, 0],
  [24, 0],
];

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

// CONTINUOUS SUNLIGHT AMOUNT FOR A (FRACTIONAL) HOUR OF DAY: 0 = DEEP NIGHT, 1 = FULL DAYLIGHT
export function getDaylight(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 1; i < DAYLIGHT_KEYS.length; i++) {
    const [h1, v1] = DAYLIGHT_KEYS[i];
    if (h <= h1) {
      const [h0, v0] = DAYLIGHT_KEYS[i - 1];
      return v0 + (v1 - v0) * smoothstep((h - h0) / (h1 - h0));
    }
  }
  return 0;
}

export function getNightIntensity(hour: number): number {
  return 1 - getDaylight(hour);
}

// WARM DAWN/DUSK GLOW: PEAKS HALFWAY BETWEEN NIGHT AND DAY, ZERO AT BOTH EXTREMES
export function getTwilight(hour: number): number {
  const d = getDaylight(hour);
  return Math.max(0, 1 - Math.abs(2 * d - 1)) ** 1.5;
}
