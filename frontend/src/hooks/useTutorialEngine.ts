import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSnapshot,
  nextStepIndex,
  pickNaturalIncident,
  prevStepIndex,
  TUTORIAL_STEPS,
  TUTORIAL_STEP_COUNT,
  TutorialEnv,
  TutorialSnapshot,
  TutorialStepDef,
} from "../components/tutorial/tutorialSteps";
import { api } from "../services/api";
import { useGameStore } from "../store/useGameStore";
import { registerModal } from "../utils/modalStack";
import { playSuccessSound } from "../utils/sound";
import { useReducedMotion } from "./useReducedMotion";

export const TUTORIAL_MODAL_ID = "tutorial";
// how long the green "done" state shows before the tour moves on by itself
const SUCCESS_HOLD_MS = 700;
// a step whose precondition already held is shown at least this long before it completes
const MIN_SHOWN_MS = 900;
const POLL_MS = 1500;
const LEAVE_FADE_MS = 160;

export interface TutorialEngine {
  step: TutorialStepDef;
  index: number;
  total: number;
  snapshot: TutorialSnapshot;
  stepDone: boolean;
  success: boolean;
  alreadyHeld: boolean;
  waiting: boolean;
  preparing: boolean;
  canBack: boolean;
  isLast: boolean;
  leaving: boolean;
  mismatchActionId: string | null;
  next: () => void;
  back: () => void;
  leave: () => void;
}

function readSnapshot(): TutorialSnapshot {
  const s = useGameStore.getState();
  return buildSnapshot({
    activeIncidents: s.telemetry.active_incidents,
    progress: s.tutorial,
    triageIncidentId: s.triageIncidentId,
    cooldowns: s.telemetry.mitigation_cooldowns,
  });
}

function adoptIncident(incident: { id: string; service_id: string }, source: "tutorial" | "natural") {
  const s = useGameStore.getState();
  s.patchTutorial({
    incidentId: incident.id,
    serviceId: incident.service_id,
    incidentSource: source,
    incidentPhase: "ready",
    startBudget: s.telemetry.budget,
  });
}

// the practice incident: reuse a real open one if there is one, else ask the backend for one
function ensureIncident() {
  const s = useGameStore.getState();
  if (s.tutorial.incidentPhase !== "idle") return;
  const natural = pickNaturalIncident(s.telemetry.active_incidents);
  if (natural) {
    adoptIncident(natural, "natural");
    return;
  }
  s.patchTutorial({ incidentPhase: "creating" });
  api
    .createTutorialIncident()
    .then(async (res) => {
      if (!useGameStore.getState().onboardingOpen) return;
      adoptIncident(res.incident, "tutorial");
      // show it right away instead of waiting for the next frame (the clock is paused)
      const state = await api.getState().catch(() => null);
      if (state && useGameStore.getState().onboardingOpen) useGameStore.getState().setTelemetry(state);
    })
    .catch(() => {
      // fall back to the first real incident (adopted below) or to skipping the action steps
      if (useGameStore.getState().onboardingOpen) useGameStore.getState().patchTutorial({ incidentPhase: "failed" });
    });
}

const ENV: TutorialEnv = {
  showDock: (tab) => {
    const s = useGameStore.getState();
    s.setDockCollapsed(false);
    s.setDockTab(tab);
  },
  selectService: (id) => useGameStore.getState().selectService(id),
  openTriageTerminal: (id) => useGameStore.getState().openTriageTerminal(id),
  closeTriageTerminal: () => {
    if (useGameStore.getState().triageIncidentId) useGameStore.getState().closeTriageTerminal();
  },
  closeIncidentDetail: () => {
    if (useGameStore.getState().selectedIncident) useGameStore.getState().closeIncidentDetail();
  },
  ensureIncident,
  captureCooldownBaseline: () => {
    const s = useGameStore.getState();
    s.patchTutorial({ cooldownBaseline: { ...s.telemetry.mitigation_cooldowns } });
  },
};

// THE TUTORIAL'S BRAIN: pauses the sim while it is open, owns the Escape slot, drives the declarative
// steps (entry side effects, completion detection, auto-advance) and exposes view state for the overlay.
export function useTutorialEngine(): TutorialEngine {
  const reduced = useReducedMotion();
  const index = useGameStore((s) => s.tutorial.stepIndex);
  const progress = useGameStore((s) => s.tutorial);
  const activeIncidents = useGameStore((s) => s.telemetry.active_incidents);
  const triageIncidentId = useGameStore((s) => s.triageIncidentId);
  const cooldowns = useGameStore((s) => s.telemetry.mitigation_cooldowns);
  const isRunning = useGameStore((s) => s.telemetry.is_running);
  const [successStepId, setSuccessStepId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const step = TUTORIAL_STEPS[Math.min(index, TUTORIAL_STEPS.length - 1)];
  const snapshot = useMemo(
    () => buildSnapshot({ activeIncidents, progress, triageIncidentId, cooldowns }),
    [activeIncidents, progress, triageIncidentId, cooldowns]
  );
  const stepDone = progress.completed.includes(step.id);

  // ---- leaving: every close path goes through closeOnboarding, which also resets the progress
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leave = useCallback(() => {
    if (leaveTimer.current) return;
    const finish = () => useGameStore.getState().closeOnboarding();
    if (reducedRef.current) {
      finish();
      return;
    }
    setLeaving(true);
    leaveTimer.current = setTimeout(finish, LEAVE_FADE_MS);
  }, []);
  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    []
  );

  // ---- session: pause the clock, own the Escape slot, keep telemetry fresh while paused
  const resumeSpeed = useRef(0);
  useEffect(() => {
    const tel = useGameStore.getState().telemetry;
    resumeSpeed.current = tel.is_running ? Math.max(1, Math.round(1 / tel.tick_rate_seconds)) : 0;
    if (resumeSpeed.current > 0) api.pauseSimulation().catch(() => {});
    const unregister = registerModal(TUTORIAL_MODAL_ID, () => leave());
    const poll = () => {
      api
        .getState()
        .then((state) => useGameStore.getState().setTelemetry(state))
        .catch(() => {});
    };
    const interval = setInterval(poll, POLL_MS);
    return () => {
      unregister();
      clearInterval(interval);
      if (resumeSpeed.current > 0) api.setSpeed(resumeSpeed.current).catch(() => {});
    };
  }, [leave]);

  // the clock stays paused while the tour is open, even if a speed button was clicked
  useEffect(() => {
    if (!isRunning) return;
    const timer = setTimeout(() => api.pauseSimulation().catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [isRunning]);

  // ---- incident bookkeeping
  useEffect(() => {
    if (snapshot.incident && !progress.incidentSeen) useGameStore.getState().patchTutorial({ incidentSeen: true });
  }, [snapshot.incident, progress.incidentSeen]);

  // practice incident could not be created: adopt the first real one whenever it shows up
  useEffect(() => {
    if (progress.incidentPhase !== "failed" || progress.incidentId) return;
    const natural = pickNaturalIncident(activeIncidents);
    if (natural) adoptIncident(natural, "natural");
  }, [progress.incidentPhase, progress.incidentId, activeIncidents]);

  // ---- step entry: safe navigation + per-step setup, once per visit
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const entryAt = useRef(0);
  const heldAtEntry = useRef(false);
  const [alreadyHeld, setAlreadyHeld] = useState(false);
  useEffect(() => {
    entryAt.current = performance.now();
    const snap = readSnapshot();
    const done = useGameStore.getState().tutorial.completed.includes(step.id);
    const held = !done && step.kind === "action" && Boolean(step.completeWhen?.(snap));
    heldAtEntry.current = held;
    setAlreadyHeld(held);
    setSuccessStepId(null);
    step.onEnter?.(ENV, snap);
    // only a change of step is an "entry"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const advance = useCallback(() => {
    const st = useGameStore.getState();
    const next = nextStepIndex(st.tutorial.stepIndex, readSnapshot());
    if (next === null) leave();
    else st.patchTutorial({ stepIndex: next });
  }, [leave]);

  // ---- completion of action steps: green flash, then on to the next step
  const satisfied = step.kind === "action" && !stepDone && Boolean(step.completeWhen?.(snapshot));
  useEffect(() => {
    if (!satisfied) return;
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    const showDone = () => {
      setSuccessStepId(step.id);
      playSuccessSound();
      holdTimer = setTimeout(() => {
        useGameStore.getState().completeTutorialStep(step.id);
        setSuccessStepId(null);
        advance();
      }, SUCCESS_HOLD_MS);
    };
    // a precondition that already held on arrival only completes once the player has seen the step
    const wait = heldAtEntry.current ? Math.max(0, MIN_SHOWN_MS - (performance.now() - entryAt.current)) : 0;
    const startTimer = setTimeout(showDone, wait);
    return () => {
      clearTimeout(startTimer);
      if (holdTimer) clearTimeout(holdTimer);
    };
  }, [satisfied, step.id, advance]);

  const next = useCallback(() => {
    const st = useGameStore.getState();
    const current = TUTORIAL_STEPS[st.tutorial.stepIndex];
    // skipping an action step settles it so a late action never re-triggers it
    if (current.kind === "action") st.completeTutorialStep(current.id);
    setSuccessStepId(null);
    advance();
  }, [advance]);

  const back = useCallback(() => {
    const st = useGameStore.getState();
    setSuccessStepId(null);
    st.patchTutorial({ stepIndex: prevStepIndex(st.tutorial.stepIndex, readSnapshot()) });
  }, []);

  const success = successStepId === step.id;
  const mismatchActionId =
    step.id === "mitigate" && snapshot.incident && snapshot.attemptedRunbook ? snapshot.attemptedRunbook : null;

  return {
    step,
    index,
    total: TUTORIAL_STEP_COUNT,
    snapshot,
    stepDone,
    success,
    alreadyHeld,
    waiting: step.kind === "action" && !stepDone && !success && !satisfied,
    preparing: step.id === "rack" && snapshot.phase === "creating",
    canBack: index > 0,
    isLast: nextStepIndex(index, snapshot) === null,
    leaving,
    mismatchActionId,
    next,
    back,
    leave,
  };
}
