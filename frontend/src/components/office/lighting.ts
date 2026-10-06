import { defconLightingTier, type DefconLevel } from "../../utils/defcon";
import { getNightIntensity, getTwilight } from "../../utils/officeClock";

// PURE LIGHTING MODEL FOR THE OFFICE. The tick hour and the DEFCON level produce a set of TARGETS;
// a rAF driver eases a smoothed STATE toward them (so 5x speed never strobes) and publishes it as
// css custom properties that the overlay layers read. Nothing here touches React or the DOM.

export interface LightTargets {
  night: number;
  twilight: number;
  // defcon 4 and worse: faint amber pool over the vault
  pool: number;
  // defcon 3: slow amber beacons
  amber: number;
  // defcon 2 and worse: red alert, `depth` is how heavy the darkening gets (1 at defcon 1)
  alert: boolean;
  alertDepth: number;
}

export interface LightState {
  night: number;
  twilight: number;
  pool: number;
  amber: number;
  // darkening of the red alert wash
  alertDark: number;
  // beacon scale-in, then the rotating sweep fading in after it
  beacons: number;
  sweep: number;
  // how much of the normal lighting is on (drops under emergency power, restores on exit)
  lights: number;
}

export interface LightRuntime {
  state: LightState;
  alertOn: boolean;
  // ms since the alert flag last flipped
  alertElapsed: number;
}

export const NIGHT_TAU_MS = 3000;
const AMBER_TAU_MS = 1200;
export const ALERT_FLICKER_MS = 150;
const BEACON_IN_MS = 250;
const SWEEP_DELAY_MS = 400;
const SWEEP_IN_MS = 300;
const ALERT_FADE_OUT_MS = 500;
const LIGHTS_RESTORE_DELAY_MS = 500;
const LIGHTS_RESTORE_MS = 1200;
const EMERGENCY_LIGHTS = 0.35;

export function computeLightTargets(hour: number, level: DefconLevel): LightTargets {
  const tier = defconLightingTier(level);
  return {
    night: getNightIntensity(hour),
    twilight: getTwilight(hour),
    pool: tier === "nominal" ? 0 : 1,
    amber: tier === "warning" ? 1 : 0,
    alert: tier === "alert",
    alertDepth: level === 1 ? 1 : 0.85,
  };
}

export function initialLightState(): LightState {
  return { night: 0, twilight: 0, pool: 0, amber: 0, alertDark: 0, beacons: 0, sweep: 0, lights: 1 };
}

// FRAME-RATE INDEPENDENT EXPONENTIAL EASE TOWARD A TARGET
export function smoothToward(current: number, target: number, dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return target;
  return target + (current - target) * Math.exp(-Math.max(0, dtMs) / tauMs);
}

function approachLinear(current: number, target: number, dtMs: number, durationMs: number): number {
  const step = durationMs <= 0 ? Infinity : dtMs / durationMs;
  if (current < target) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

// the first 150ms of a red alert: a few hard on/off flickers, like emergency power kicking in
export function alertFlicker(elapsedMs: number): number {
  if (elapsedMs < 30) return 0.9;
  if (elapsedMs < 60) return 0.2;
  if (elapsedMs < 90) return 0.85;
  if (elapsedMs < 120) return 0.35;
  return 1;
}

// THE FULL STATE FOR A GIVEN TARGET SET, WITH NO EASING (REDUCED MOTION, HIDDEN TAB, FIRST PAINT)
export function snapLightState(targets: LightTargets): LightRuntime {
  const on = targets.alert;
  return {
    alertOn: on,
    alertElapsed: 1e6,
    state: {
      night: targets.night,
      twilight: targets.twilight,
      pool: targets.pool,
      amber: targets.amber,
      alertDark: on ? targets.alertDepth : 0,
      beacons: on ? 1 : 0,
      sweep: on ? 1 : 0,
      lights: on ? EMERGENCY_LIGHTS : 1,
    },
  };
}

// ADVANCE THE SMOOTHED LIGHTING STATE BY dtMs. The red alert is staged: flicker (150ms), beacons
// scale in, the sweep starts; on exit the alert wash fades over 500ms and only then do the normal
// lights restore, over about 1.2s.
export function stepLighting(rt: LightRuntime, targets: LightTargets, dtMs: number): LightRuntime {
  const s = rt.state;
  const flipped = targets.alert !== rt.alertOn;
  const alertOn = targets.alert;
  const elapsed = flipped ? 0 : rt.alertElapsed + dtMs;

  let alertDark: number;
  let beacons = s.beacons;
  let sweep = s.sweep;
  let lights = s.lights;

  if (alertOn) {
    if (elapsed < ALERT_FLICKER_MS) {
      alertDark = Math.max(s.alertDark, alertFlicker(elapsed) * targets.alertDepth);
    } else {
      alertDark = approachLinear(s.alertDark, targets.alertDepth, dtMs, 150);
      beacons = approachLinear(beacons, 1, dtMs, BEACON_IN_MS);
    }
    if (elapsed >= SWEEP_DELAY_MS) sweep = approachLinear(sweep, 1, dtMs, SWEEP_IN_MS);
    lights = approachLinear(lights, EMERGENCY_LIGHTS, dtMs, 400);
  } else {
    alertDark = approachLinear(s.alertDark, 0, dtMs, ALERT_FADE_OUT_MS);
    beacons = approachLinear(beacons, 0, dtMs, ALERT_FADE_OUT_MS);
    sweep = approachLinear(sweep, 0, dtMs, ALERT_FADE_OUT_MS);
    if (elapsed >= LIGHTS_RESTORE_DELAY_MS) lights = approachLinear(lights, 1, dtMs, LIGHTS_RESTORE_MS);
  }

  return {
    alertOn,
    alertElapsed: elapsed,
    state: {
      night: smoothToward(s.night, targets.night, dtMs, NIGHT_TAU_MS),
      twilight: smoothToward(s.twilight, targets.twilight, dtMs, NIGHT_TAU_MS),
      pool: smoothToward(s.pool, targets.pool, dtMs, AMBER_TAU_MS),
      amber: smoothToward(s.amber, targets.amber, dtMs, AMBER_TAU_MS),
      alertDark,
      beacons,
      sweep,
      lights,
    },
  };
}

const EPS = 0.004;

export function isLightingSettled(rt: LightRuntime, targets: LightTargets): boolean {
  const goal = snapLightState(targets).state;
  const s = rt.state;
  return (
    rt.alertOn === targets.alert &&
    (Object.keys(goal) as Array<keyof LightState>).every((k) => Math.abs(goal[k] - s[k]) < EPS)
  );
}

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();

// the css custom properties the overlay layers read; `emit` is how bright emissive things
// (monitors, LEDs, lamp pools) read: faint by day, strong at night and under emergency power
export function lightVars(s: LightState): Record<string, string> {
  const emit = Math.min(1, Math.max(0, (0.1 + 0.9 * s.night) * s.lights + 0.6 * s.alertDark));
  return {
    "--night": fmt(s.night),
    "--twilight": fmt(s.twilight),
    "--pool": fmt(s.pool),
    "--amber": fmt(s.amber),
    "--alert-dark": fmt(s.alertDark),
    "--beacons": fmt(s.beacons),
    "--sweep": fmt(s.sweep),
    "--lights": fmt(s.lights),
    "--emit": fmt(emit),
  };
}
