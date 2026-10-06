import { useEffect } from "react";
import { useGameStore } from "../../store/useGameStore";
import { computeDefconLevel } from "../../utils/defcon";
import { getHourOfDay } from "../../utils/officeClock";
import { isReducedMotionNow } from "../../hooks/useReducedMotion";
import {
  computeLightTargets,
  isLightingSettled,
  lightVars,
  snapLightState,
  stepLighting,
  type LightRuntime,
  type LightTargets,
} from "./lighting";
import { publishLightVars } from "./lightingBus";

function readTargets(): LightTargets {
  const { telemetry } = useGameStore.getState();
  return computeLightTargets(getHourOfDay(telemetry.tick), computeDefconLevel(telemetry));
}

// RENDERS NOTHING: EASES THE LIGHTING STATE TOWARD THE TICK-HOUR / DEFCON TARGETS ON rAF AND
// PUBLISHES IT AS CSS VARIABLES. No React state, so a lighting change never re-renders the scene;
// the loop sleeps as soon as everything has settled and the tab being hidden snaps to the target.
export default function LightingDriver() {
  useEffect(() => {
    let targets = readTargets();
    let runtime: LightRuntime = snapLightState(targets);
    publishLightVars(lightVars(runtime.state));

    let raf = 0;
    let last = 0;

    const frame = (now: number) => {
      raf = 0;
      const dt = Math.min(100, last ? now - last : 16);
      last = now;
      runtime = stepLighting(runtime, targets, dt);
      publishLightVars(lightVars(runtime.state));
      if (!isLightingSettled(runtime, targets)) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const settleNow = () => {
      runtime = snapLightState(targets);
      publishLightVars(lightVars(runtime.state));
    };

    const retarget = () => {
      targets = readTargets();
      if (isReducedMotionNow() || document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        settleNow();
        return;
      }
      if (!raf && !isLightingSettled(runtime, targets)) raf = requestAnimationFrame(frame);
    };

    // only the inputs that matter: tick (hour) and the derived defcon level
    let lastKey = "";
    const unsubscribe = useGameStore.subscribe((state) => {
      const key = `${state.telemetry.tick}|${computeDefconLevel(state.telemetry)}`;
      if (key === lastKey) return;
      lastKey = key;
      retarget();
    });
    const onVisibility = () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        targets = readTargets();
        settleNow();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
