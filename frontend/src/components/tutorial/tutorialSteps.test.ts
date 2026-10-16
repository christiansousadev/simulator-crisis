import { beforeEach, describe, expect, it } from "vitest";
import { evolutionEn } from "../../i18n/evolution";
import { evolutionPt } from "../../i18n/locales/pt-BR/evolution";
import { INITIAL_TUTORIAL_PROGRESS, TutorialProgress, useGameStore } from "../../store/useGameStore";
import { Incident } from "../../types/game";
import {
  bodyVariant,
  buildSnapshot,
  detectRunbookAttempt,
  formatTutorialDuration,
  isStepComplete,
  nextStepIndex,
  pickNaturalIncident,
  prevStepIndex,
  moduleRange,
  resolveSelector,
  TUTORIAL_MODULES,
  TUTORIAL_STEPS,
  TutorialSnapshot,
} from "./tutorialSteps";

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: "inc-1",
    session_id: "s",
    service_id: "srv-notify",
    severity: "P2_HIGH",
    title: "t",
    root_cause: null,
    mtta_seconds: 0,
    mttr_seconds: 0,
    status: "active",
    created_tick: 1,
    acknowledged_tick: null,
    resolved_tick: null,
    triage_solved: false,
    ...over,
  };
}

function progress(over: Partial<TutorialProgress> = {}): TutorialProgress {
  return {
    ...INITIAL_TUTORIAL_PROGRESS,
    incidentId: "inc-1",
    serviceId: "srv-notify",
    incidentSource: "tutorial",
    incidentPhase: "ready",
    incidentSeen: true,
    ...over,
  };
}

function snap(over: { incidents?: Incident[]; progress?: Partial<TutorialProgress>; triage?: string | null; cooldowns?: Record<string, number> } = {}): TutorialSnapshot {
  return buildSnapshot({
    activeIncidents: over.incidents ?? [incident()],
    progress: progress(over.progress),
    triageIncidentId: over.triage ?? null,
    cooldowns: over.cooldowns ?? {},
  });
}

const step = (id: string) => TUTORIAL_STEPS.find((s) => s.id === id)!;

describe("tutorial snapshot and completion predicates", () => {
  it("acknowledge completes when the incident leaves the active status", () => {
    expect(isStepComplete(step("acknowledge"), snap())).toBe(false);
    expect(isStepComplete(step("acknowledge"), snap({ incidents: [incident({ status: "acknowledged" })] }))).toBe(true);
  });

  it("investigate completes when the terminal opens for the tutorial incident only", () => {
    expect(isStepComplete(step("investigate"), snap({ triage: "inc-other" }))).toBe(false);
    expect(isStepComplete(step("investigate"), snap({ triage: "inc-1" }))).toBe(true);
  });

  it("findCause completes on triage_solved", () => {
    expect(isStepComplete(step("findCause"), snap())).toBe(false);
    expect(isStepComplete(step("findCause"), snap({ incidents: [incident({ triage_solved: true })] }))).toBe(true);
  });

  it("mitigate completes only once a seen incident is gone (never before it appeared)", () => {
    expect(isStepComplete(step("mitigate"), snap())).toBe(false);
    expect(isStepComplete(step("mitigate"), snap({ incidents: [] }))).toBe(true);
    expect(isStepComplete(step("mitigate"), snap({ incidents: [], progress: { incidentSeen: false } }))).toBe(false);
  });

  it("info steps have no completion predicate", () => {
    expect(isStepComplete(step("welcome"), snap())).toBe(false);
  });

  it("detects a fired runbook from a changed cooldown entry", () => {
    expect(detectRunbookAttempt(null, { rollback: 3 })).toBeNull();
    expect(detectRunbookAttempt({ rollback: 3 }, { rollback: 3 })).toBeNull();
    expect(detectRunbookAttempt({}, { circuit_breaker: 7 })).toBe("circuit_breaker");
    expect(snap({ progress: { cooldownBaseline: {} }, cooldowns: { scale_replicas: 2 } }).attemptedRunbook).toBe("scale_replicas");
  });
});

describe("tutorial navigation", () => {
  const index = (id: string) => TUTORIAL_STEPS.findIndex((s) => s.id === id);

  it("walks the steps of a module in order", () => {
    expect(nextStepIndex(0, snap())).toBe(1);
    expect(nextStepIndex(index("investigate"), snap())).toBe(index("findCause"));
    expect(prevStepIndex(3, snap())).toBe(2);
  });

  it("finishes (null) at the end of each module and never goes below its first step", () => {
    expect(nextStepIndex(index("acknowledge"), snap())).toBeNull();
    expect(nextStepIndex(index("recap"), snap())).toBeNull();
    expect(nextStepIndex(TUTORIAL_STEPS.length - 1, snap())).toBeNull();
    expect(prevStepIndex(0, snap())).toBe(0);
    expect(prevStepIndex(index("investigate"), snap())).toBe(index("investigate"));
  });

  it("lays the steps out as four contiguous modules", () => {
    expect(TUTORIAL_MODULES).toEqual([1, 2, 3, 4]);
    let covered = 0;
    for (const module of TUTORIAL_MODULES) {
      const { start, count } = moduleRange(module);
      expect(count).toBeGreaterThan(0);
      expect(start).toBe(covered);
      expect(TUTORIAL_STEPS.slice(start, start + count).every((s) => s.module === module)).toBe(true);
      covered += count;
    }
    expect(covered).toBe(TUTORIAL_STEPS.length);
  });

  it("every step has copy in every locale", () => {
    for (const locale of [evolutionEn, evolutionPt]) expect(locale.academy.modules).toHaveLength(TUTORIAL_MODULES.length);
    const ids = TUTORIAL_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("skips incident-bound steps when no incident could be created, in both directions", () => {
    const none = snap({ incidents: [], progress: { incidentId: null, incidentPhase: "failed", incidentSource: null } });
    expect(none.noIncident).toBe(true);
    // module 1 has nothing left to do without an incident, so it ends right after the rack
    expect(nextStepIndex(index("rack"), none)).toBeNull();
    expect(prevStepIndex(index("acknowledge"), none)).toBe(index("rack"));
    // module 3 never needed an incident
    expect(nextStepIndex(index("governance"), none)).toBe(index("cab"));
  });

  it("keeps the incident steps while the practice incident is still being created", () => {
    const creating = snap({ incidents: [], progress: { incidentId: null, incidentPhase: "creating" } });
    expect(creating.noIncident).toBe(false);
    expect(nextStepIndex(index("rack"), creating)).toBe(index("card"));
  });
});

describe("tutorial copy variants and helpers", () => {
  it("picks alternate copy for the fallback, natural incidents and an unresolved recap", () => {
    const none = snap({ incidents: [], progress: { incidentId: null, incidentPhase: "failed" } });
    expect(bodyVariant("rack", none)).toBe("alt");
    expect(bodyVariant("rack", snap())).toBe("body");
    expect(bodyVariant("findCause", snap({ progress: { incidentSource: "natural" } }))).toBe("alt");
    expect(bodyVariant("findCause", snap())).toBe("body");
    expect(bodyVariant("recap", snap())).toBe("alt");
    expect(bodyVariant("recap", snap({ incidents: [] }))).toBe("body");
  });

  it("adopts the first unacknowledged incident, else any open one", () => {
    const a = incident({ id: "a", status: "acknowledged" });
    const b = incident({ id: "b", status: "active" });
    expect(pickNaturalIncident([a, b])?.id).toBe("b");
    expect(pickNaturalIncident([a])?.id).toBe("a");
    expect(pickNaturalIncident([])).toBeNull();
  });

  it("substitutes the service token and refuses an unresolved one", () => {
    expect(resolveSelector('[data-service-id="{service}"]', "srv-notify")).toBe('[data-service-id="srv-notify"]');
    expect(resolveSelector('[data-service-id="{service}"]', null)).toBeNull();
    expect(resolveSelector('[data-tour="x"]', null)).toBe('[data-tour="x"]');
  });

  it("formats durations and hides zero", () => {
    expect(formatTutorialDuration(0)).toBeNull();
    expect(formatTutorialDuration(42)).toBe("42s");
    expect(formatTutorialDuration(125)).toBe("2m 05s");
  });
});

describe("tutorial store lifecycle", () => {
  beforeEach(() => {
    useGameStore.setState({ onboardingOpen: false, tutorial: INITIAL_TUTORIAL_PROGRESS, tutorialOfferPending: true });
  });

  it("every open starts at step 1, even after a previous run stopped mid-way", () => {
    const s = useGameStore.getState();
    s.openOnboarding();
    s.patchTutorial({ stepIndex: 5 });
    s.completeTutorialStep("acknowledge");
    s.closeOnboarding();
    expect(useGameStore.getState().tutorial).toEqual(INITIAL_TUTORIAL_PROGRESS);
    s.openOnboarding();
    expect(useGameStore.getState().tutorial.stepIndex).toBe(0);
    expect(useGameStore.getState().onboardingOpen).toBe(true);
  });

  it("closing marks the tutorial seen and clears the pending offer", () => {
    useGameStore.getState().closeOnboarding();
    expect(useGameStore.getState().tutorialOfferPending).toBe(false);
    expect(localStorage.getItem("incidentzero.onboarding_seen")).toBe("true");
  });

  it("completing a step twice stores it once", () => {
    const s = useGameStore.getState();
    s.completeTutorialStep("mitigate");
    s.completeTutorialStep("mitigate");
    expect(useGameStore.getState().tutorial.completed).toEqual(["mitigate"]);
  });
});
