import { describe, expect, it } from "vitest";
import {
  ALERT_FLICKER_MS,
  alertFlicker,
  computeLightTargets,
  isLightingSettled,
  lightVars,
  smoothToward,
  snapLightState,
  stepLighting,
  type LightRuntime,
} from "./lighting";

function run(rt: LightRuntime, targets: ReturnType<typeof computeLightTargets>, ms: number, dt = 16): LightRuntime {
  let cur = rt;
  for (let t = 0; t < ms; t += dt) cur = stepLighting(cur, targets, dt);
  return cur;
}

describe("lighting targets", () => {
  it("derives night and the defcon tier flags", () => {
    expect(computeLightTargets(13, 5)).toMatchObject({ pool: 0, amber: 0, alert: false });
    expect(computeLightTargets(13, 4)).toMatchObject({ pool: 1, amber: 0, alert: false });
    expect(computeLightTargets(13, 3)).toMatchObject({ pool: 1, amber: 1, alert: false });
    expect(computeLightTargets(13, 2)).toMatchObject({ alert: true, amber: 0 });
    expect(computeLightTargets(2, 5).night).toBe(1);
  });
});

describe("smoothToward", () => {
  it("approaches the target with the given time constant, independent of frame size", () => {
    const one = smoothToward(0, 1, 3000, 3000);
    expect(one).toBeCloseTo(1 - Math.exp(-1), 5);
    let stepped = 0;
    for (let i = 0; i < 300; i++) stepped = smoothToward(stepped, 1, 10, 3000);
    expect(stepped).toBeCloseTo(one, 5);
  });
});

describe("stepLighting", () => {
  it("never strobes when the hour flips quickly at 5x speed", () => {
    const night = computeLightTargets(2, 5);
    const day = computeLightTargets(13, 5);
    let rt = snapLightState(day);
    let maxJump = 0;
    for (let i = 0; i < 40; i++) {
      const target = i % 2 === 0 ? night : day; // flips every 400ms
      for (let f = 0; f < 25; f++) {
        const next = stepLighting(rt, target, 16);
        maxJump = Math.max(maxJump, Math.abs(next.state.night - rt.state.night));
        rt = next;
      }
    }
    expect(maxJump).toBeLessThan(0.01);
    expect(rt.state.night).toBeGreaterThan(0.2);
    expect(rt.state.night).toBeLessThan(0.8);
  });

  it("stages the red alert: flicker, then beacons, then the sweep", () => {
    const alert = computeLightTargets(13, 2);
    let rt = snapLightState(computeLightTargets(13, 5));
    rt = stepLighting(rt, alert, 16);
    expect(rt.state.alertDark).toBeGreaterThan(0);
    expect(rt.state.beacons).toBe(0);
    expect(rt.state.sweep).toBe(0);

    rt = run(rt, alert, ALERT_FLICKER_MS + 100);
    expect(rt.state.beacons).toBeGreaterThan(0);
    expect(rt.state.sweep).toBe(0);

    rt = run(rt, alert, 900);
    expect(rt.state.beacons).toBe(1);
    expect(rt.state.sweep).toBe(1);
    expect(rt.state.lights).toBeLessThan(0.5);
    // the slow amber/pool easing keeps the loop alive a few seconds longer, then it sleeps
    rt = run(rt, alert, 9000);
    expect(isLightingSettled(rt, alert)).toBe(true);
  });

  it("exits staged: the alert fades over 500ms, only then do the lights restore over ~1.2s", () => {
    const calm = computeLightTargets(13, 5);
    let rt = snapLightState(computeLightTargets(13, 2));
    const lightsInAlert = rt.state.lights;

    rt = run(rt, calm, 320);
    expect(rt.state.alertDark).toBeGreaterThan(0);
    expect(rt.state.lights).toBe(lightsInAlert);

    rt = run(rt, calm, 400);
    expect(rt.state.alertDark).toBe(0);
    expect(rt.state.lights).toBeGreaterThan(lightsInAlert);
    expect(rt.state.lights).toBeLessThan(1);

    rt = run(rt, calm, 1500);
    expect(rt.state.lights).toBe(1);
    rt = run(rt, calm, 9000);
    expect(isLightingSettled(rt, calm)).toBe(true);
  });

  it("flickers only during the first 150ms", () => {
    expect(alertFlicker(10)).toBeGreaterThan(0.5);
    expect(alertFlicker(45)).toBeLessThan(0.5);
    expect(alertFlicker(ALERT_FLICKER_MS)).toBe(1);
  });
});

describe("lightVars", () => {
  it("publishes every variable the overlays read, emissive stronger at night", () => {
    const day = lightVars(snapLightState(computeLightTargets(13, 5)).state);
    const night = lightVars(snapLightState(computeLightTargets(2, 5)).state);
    for (const key of ["--night", "--twilight", "--pool", "--amber", "--alert-dark", "--beacons", "--sweep", "--lights", "--emit"]) {
      expect(day[key]).toBeDefined();
    }
    expect(Number(night["--emit"])).toBeGreaterThan(Number(day["--emit"]));
  });
});
