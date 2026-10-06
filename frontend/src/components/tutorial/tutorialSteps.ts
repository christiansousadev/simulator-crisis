import type { TutorialStepId } from "../../i18n/translations";
import type { TutorialIncidentPhase, TutorialProgress } from "../../store/useGameStore";
import type { Incident } from "../../types/game";

// THE GUIDED TUTORIAL AS DATA. Steps are declarative (targets, placement, completion predicate,
// optional entry side effect); everything below the step list is a pure function over a snapshot of
// the game state, so the whole flow is unit-testable without a DOM.

export type TutorialPlacement = "auto" | "top" | "bottom" | "left" | "right" | "center";
export type TutorialDockTab = "incidents" | "directives";

// a css selector, optionally searched only inside the dock card of the tutorial incident
export type TargetSpec = string | { selector: string; inIncidentCard: true };

export interface TutorialSnapshot {
  phase: TutorialIncidentPhase;
  source: TutorialProgress["incidentSource"];
  incidentId: string | null;
  serviceId: string | null;
  // the live open incident (null once resolved or before it shows up in telemetry)
  incident: Incident | null;
  incidentGone: boolean;
  triageOpen: boolean;
  // set when a runbook was fired since the runbook step began
  attemptedRunbook: string | null;
  // practice incident could not be created and no real one exists: action steps are skipped
  noIncident: boolean;
}

// side effects a step may perform when it becomes the current step (safe navigation only)
export interface TutorialEnv {
  showDock: (tab: TutorialDockTab) => void;
  selectService: (serviceId: string | null) => void;
  openTriageTerminal: (incidentId: string) => void;
  closeTriageTerminal: () => void;
  closeIncidentDetail: () => void;
  ensureIncident: () => void;
  captureCooldownBaseline: () => void;
}

export interface TutorialStepDef {
  id: TutorialStepId;
  // "action" steps wait for the player to do the real thing, "info" steps just need Next
  kind: "info" | "action";
  // tried in order; with `union` every target found is merged into one hole
  targets: TargetSpec[];
  union?: boolean;
  placement: TutorialPlacement;
  needsIncident?: boolean;
  completeWhen?: (s: TutorialSnapshot) => boolean;
  onEnter?: (env: TutorialEnv, s: TutorialSnapshot) => void;
  // the step itself asks the player to open a gameplay modal (the log terminal): the dim layer
  // must step aside while it is open
  allowsGameplayModal?: boolean;
}

const INCIDENT_CARD = '[data-tour="incident-card"]';

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    id: "welcome",
    kind: "info",
    targets: [],
    placement: "center",
    onEnter: (env) => {
      env.closeTriageTerminal();
      env.closeIncidentDetail();
    },
  },
  {
    id: "rack",
    kind: "info",
    // the server rack itself (where the alert badge pulses); the desk is only a fallback
    targets: ['[data-rack-service-id="{service}"]', '[data-service-id="{service}"]'],
    placement: "auto",
    onEnter: (env) => {
      env.closeTriageTerminal();
      env.closeIncidentDetail();
      env.ensureIncident();
    },
  },
  {
    id: "card",
    kind: "info",
    targets: [INCIDENT_CARD],
    placement: "top",
    needsIncident: true,
    onEnter: (env) => {
      env.closeTriageTerminal();
      env.closeIncidentDetail();
      env.showDock("incidents");
    },
  },
  {
    id: "acknowledge",
    kind: "action",
    targets: [{ selector: '[data-tour="incident-ack"]', inIncidentCard: true }, INCIDENT_CARD],
    placement: "top",
    needsIncident: true,
    completeWhen: (s) => (s.incident ? s.incident.status !== "active" : s.incidentGone),
    onEnter: (env) => {
      env.closeTriageTerminal();
      env.closeIncidentDetail();
      env.showDock("incidents");
    },
  },
  {
    id: "investigate",
    kind: "action",
    targets: [{ selector: '[data-tour="incident-investigate"]', inIncidentCard: true }, INCIDENT_CARD],
    placement: "top",
    needsIncident: true,
    completeWhen: (s) => s.triageOpen || Boolean(s.incident?.triage_solved) || s.incidentGone,
    onEnter: (env) => {
      env.closeIncidentDetail();
      env.showDock("incidents");
    },
  },
  {
    id: "findCause",
    kind: "action",
    targets: ['[data-tour="triage-lines"]', { selector: '[data-tour="incident-investigate"]', inIncidentCard: true }],
    placement: "right",
    needsIncident: true,
    allowsGameplayModal: true,
    completeWhen: (s) => Boolean(s.incident?.triage_solved) || s.incidentGone,
    onEnter: (env, s) => {
      env.closeIncidentDetail();
      // reached via "skip step": open the terminal for the player so the step still makes sense
      if (s.incidentId && s.incident && !s.incident.triage_solved && !s.triageOpen) env.openTriageTerminal(s.incidentId);
    },
  },
  {
    id: "runbooks",
    kind: "info",
    targets: ['[data-tour="runbook-grid"]'],
    placement: "top",
    needsIncident: true,
    onEnter: (env, s) => {
      env.closeTriageTerminal();
      env.closeIncidentDetail();
      env.showDock("directives");
      env.selectService(s.serviceId);
      env.captureCooldownBaseline();
    },
  },
  {
    id: "mitigate",
    kind: "action",
    targets: ['[data-tour="runbook-rollback"]', '[data-tour="runbook-grid"]'],
    placement: "top",
    needsIncident: true,
    completeWhen: (s) => s.incidentGone,
    onEnter: (env, s) => {
      env.closeTriageTerminal();
      env.closeIncidentDetail();
      env.showDock("directives");
      env.selectService(s.serviceId);
    },
  },
  {
    id: "recap",
    kind: "info",
    targets: ['[data-tour="cash-counter"]', '[data-kpi="budget"]', '[data-tour="topbar-kpis"]'],
    placement: "bottom",
    needsIncident: true,
    onEnter: (env) => {
      env.closeTriageTerminal();
      env.closeIncidentDetail();
    },
  },
  {
    id: "governance",
    kind: "info",
    targets: ['[data-kpi="sla"]', '[data-kpi="errorBudget"]'],
    union: true,
    placement: "bottom",
    onEnter: (env) => {
      env.closeTriageTerminal();
      env.closeIncidentDetail();
    },
  },
];

export const TUTORIAL_STEP_COUNT = TUTORIAL_STEPS.length;

// a runbook fired since the baseline was captured shows up as a changed cooldown entry
export function detectRunbookAttempt(
  baseline: Record<string, number> | null,
  cooldowns: Record<string, number>
): string | null {
  if (!baseline) return null;
  for (const [actionId, tick] of Object.entries(cooldowns)) {
    if (baseline[actionId] !== tick) return actionId;
  }
  return null;
}

export interface SnapshotInput {
  activeIncidents: Incident[];
  progress: TutorialProgress;
  triageIncidentId: string | null;
  cooldowns: Record<string, number>;
}

export function buildSnapshot({ activeIncidents, progress, triageIncidentId, cooldowns }: SnapshotInput): TutorialSnapshot {
  const incident = progress.incidentId ? (activeIncidents.find((i) => i.id === progress.incidentId) ?? null) : null;
  return {
    phase: progress.incidentPhase,
    source: progress.incidentSource,
    incidentId: progress.incidentId,
    serviceId: incident?.service_id ?? progress.serviceId,
    incident,
    incidentGone: progress.incidentId !== null && progress.incidentSeen && incident === null,
    triageOpen: progress.incidentId !== null && triageIncidentId === progress.incidentId,
    attemptedRunbook: detectRunbookAttempt(progress.cooldownBaseline, cooldowns),
    noIncident: progress.incidentPhase === "failed" && progress.incidentId === null,
  };
}

export function isStepComplete(step: TutorialStepDef, snapshot: TutorialSnapshot): boolean {
  return step.completeWhen ? step.completeWhen(snapshot) : false;
}

function isSkipped(step: TutorialStepDef, snapshot: TutorialSnapshot): boolean {
  return Boolean(step.needsIncident) && snapshot.noIncident;
}

// NEXT/PREVIOUS STEP, SKIPPING THE INCIDENT-BOUND ONES WHEN THERE IS NO INCIDENT TO WORK WITH.
// next() returns null past the last step (= finish), prev() never goes below 0.
export function nextStepIndex(from: number, snapshot: TutorialSnapshot): number | null {
  let i = from + 1;
  while (i < TUTORIAL_STEPS.length && isSkipped(TUTORIAL_STEPS[i], snapshot)) i += 1;
  return i >= TUTORIAL_STEPS.length ? null : i;
}

export function prevStepIndex(from: number, snapshot: TutorialSnapshot): number {
  let i = from - 1;
  while (i > 0 && isSkipped(TUTORIAL_STEPS[i], snapshot)) i -= 1;
  return Math.max(0, i);
}

// WHICH COPY VARIANT A STEP SHOWS: "alt" covers the fallback and the not-resolved cases
export function bodyVariant(stepId: TutorialStepId, snapshot: TutorialSnapshot): "body" | "alt" {
  if (stepId === "rack" && snapshot.noIncident) return "alt";
  if (stepId === "findCause" && snapshot.source !== "tutorial") return "alt";
  if (stepId === "recap" && !snapshot.incidentGone) return "alt";
  return "body";
}

// the first active (unacknowledged) incident, else any open one -- adopted when the practice
// incident cannot be created
export function pickNaturalIncident(incidents: Incident[]): Incident | null {
  return incidents.find((i) => i.status === "active") ?? incidents[0] ?? null;
}

export function resolveSelector(selector: string, serviceId: string | null): string | null {
  if (!selector.includes("{service}")) return selector;
  return serviceId ? selector.replace("{service}", serviceId) : null;
}

export function formatTutorialDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  return `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, "0")}s`;
}
