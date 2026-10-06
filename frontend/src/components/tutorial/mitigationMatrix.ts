import { MitigationActionId, TutorialCauseKey } from "../../i18n/translations";

// mirrors app.engine.formulas.MITIGATION_EFFECTIVENESS (base values, before the +-15% speed nudge and
// the specialist/triage bonuses). 70%+ fully resolves an incident, anything below leaves it open.
export const MITIGATION_EFFECTIVENESS: Record<MitigationActionId, Record<TutorialCauseKey, number>> = {
  rollback: { deploy_regression: 1.0, capacity_saturation: 0.55, dependency_fault: 0.4, acute_defect: 0.35 },
  scale_replicas: { deploy_regression: 0.4, capacity_saturation: 1.0, dependency_fault: 0.45, acute_defect: 0.35 },
  circuit_breaker: { deploy_regression: 0.35, capacity_saturation: 0.55, dependency_fault: 1.0, acute_defect: 0.4 },
  emergency_patch: { deploy_regression: 0.8, capacity_saturation: 0.8, dependency_fault: 0.8, acute_defect: 1.0 },
};

export const FULL_RESOLUTION_THRESHOLD = 0.7;

export const RUNBOOK_ORDER: MitigationActionId[] = ["rollback", "scale_replicas", "circuit_breaker", "emergency_patch"];
export const CAUSE_ORDER: TutorialCauseKey[] = ["deploy_regression", "capacity_saturation", "dependency_fault", "acute_defect"];

// the practice incident ("memory leak in connection pooling thread") is a bad deploy
export const TUTORIAL_CAUSE: TutorialCauseKey = "deploy_regression";

export function bestRunbookFor(cause: TutorialCauseKey): MitigationActionId {
  return RUNBOOK_ORDER.reduce((best, id) =>
    MITIGATION_EFFECTIVENESS[id][cause] > MITIGATION_EFFECTIVENESS[best][cause] ? id : best
  );
}

export function effectivenessPercent(actionId: string, cause: TutorialCauseKey): number | null {
  const row = MITIGATION_EFFECTIVENESS[actionId as MitigationActionId];
  return row ? Math.round(row[cause] * 100) : null;
}
