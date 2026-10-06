import { create } from "zustand";
import { detectBrowserLanguage, Language, loadStoredLanguage, persistLanguage } from "../i18n/language";
import { loadLanguage } from "../i18n/loadLanguage";
import { isLanguageReady, TRANSLATIONS } from "../i18n/translations";
import { ActiveScenario, DilemmaOffer, Incident, ScenarioObjective, TelemetryState } from "../types/game";
import { auditKpiInputs } from "../utils/auditKpi";
import { countDependents } from "../utils/incidentImpact";
import { KpiId } from "../utils/kpiBands";
import { KpiEvent, KpiEventInput, mergeKpiEvent } from "../utils/kpiEvents";
import { consumeLocalSpend } from "../utils/localSpendClaims";

// the most recent language the user asked for (guards async dictionary loads against out-of-order resolves)
let languageRequest: Language | null = null;

// pre-connection placeholder state, replaced by the first ws telemetry frame
const INITIAL_TELEMETRY: TelemetryState = {
  type: "TICK_BROADCAST",
  session_id: "incidentzero-alpha",
  tick: 0,
  budget: 250000,
  sla_percentage: 100,
  tech_debt: 25,
  user_happiness: 96,
  status: "running",
  is_running: false,
  tick_rate_seconds: 1,
  services: [],
  active_incidents: [],
  recent_audits: [],
  purchased_upgrades: [],
  mitigation_cooldowns: {},
  error_budget_remaining_ratio: 1,
  feature_freeze_active: false,
  engineers: [],
  infrastructure_nodes: [],
  achievements_unlocked: [],
  prestige_points: 0,
  unlocked_cosmetics: [],
  active_scenario: null,
  difficulty: "standard",
  reputation: 50,
};

const RESOLVED_HISTORY_LIMIT = 8;
const FLOATING_TEXT_LIMIT = 6;
const METRICS_HISTORY_LIMIT = 60;
const NOMINAL_RPS_PER_HEALTHY_SERVICE = 220;
const ONBOARDING_STORAGE_KEY = "incidentzero.onboarding_seen";
const HIGH_CONTRAST_STORAGE_KEY = "incidentzero.high_contrast";
const COLORBLIND_SAFE_STORAGE_KEY = "incidentzero.colorblind_safe";
const REDUCED_MOTION_STORAGE_KEY = "incidentzero.reduced_motion";

export type ReducedMotionPref = "system" | "on" | "off";

function loadReducedMotionPref(): ReducedMotionPref {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(REDUCED_MOTION_STORAGE_KEY);
    return stored === "on" || stored === "off" ? stored : "system";
  } catch {
    return "system";
  }
}

// STRUCTURAL SHARING FOR TELEMETRY FRAMES. every frame arrives as freshly parsed JSON, so every
// array and object is a new reference even when nothing in it changed -- which re-rendered every
// subscriber on every tick. Here each unchanged value keeps its previous reference (compared by
// serialized form), so selectors, memo() and effect dependencies only fire on a real change.
function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function shareList<T>(prev: T[] | undefined, next: T[] | undefined): T[] | undefined {
  if (!prev || !next) return next;
  const shared = next.map((item, idx) => {
    const old = prev[idx];
    // match by id when the items carry one, so a reorder or a removal still reuses the old object
    const byId =
      item && typeof item === "object" && "id" in (item as object)
        ? prev.find((p) => (p as { id?: unknown }).id === (item as { id?: unknown }).id)
        : old;
    return byId !== undefined && sameJson(byId, item) ? byId : item;
  });
  const unchanged = shared.length === prev.length && shared.every((item, idx) => item === prev[idx]);
  return unchanged ? prev : shared;
}

function shareTelemetry(prev: TelemetryState, next: TelemetryState): TelemetryState {
  const out: TelemetryState = { ...next };
  const listKeys = [
    "services",
    "active_incidents",
    "recent_audits",
    "engineers",
    "infrastructure_nodes",
    "purchased_upgrades",
    "achievements_unlocked",
    "unlocked_cosmetics",
  ] as const;
  for (const key of listKeys) {
    (out as unknown as Record<string, unknown>)[key] = shareList(
      prev[key] as unknown[],
      next[key] as unknown[]
    );
  }
  if (sameJson(prev.mitigation_cooldowns, next.mitigation_cooldowns)) out.mitigation_cooldowns = prev.mitigation_cooldowns;
  if (sameJson(prev.active_scenario, next.active_scenario)) out.active_scenario = prev.active_scenario;
  return out;
}

// READ A PERSISTED BOOLEAN ACCESSIBILITY PREFERENCE, DEFAULTING TO FALSE
function loadStoredFlag(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function persistFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // best-effort only
  }
}

export type ScreenShakeMagnitude = "light" | "heavy";

// one boardroom-tv sample derived from a tick's service snapshot, never sent by the backend
export interface MetricsSample {
  tick: number;
  avgLatencyMs: number;
  errorRatePct: number;
  throughputProxy: number;
  // sla_percentage at this tick (the dock plots this, not the throughput proxy)
  sla: number;
}

export interface AchievementToastData {
  id: string;
  achievementId: string;
  name: string;
  prestigePoints: number;
}

let achievementToastSeq = 0;

// CHECK WHETHER THE FIRST-TIME TUTORIAL SHOULD AUTO-OPEN ON BOOT
function shouldShowOnboardingOnBoot(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) !== "true";
  } catch {
    return false;
  }
}

export type FloatingTextTone = "danger" | "success" | "warning" | "info" | "gold";

export interface FloatingText {
  id: string;
  text: string;
  tone: FloatingTextTone;
}

let floatingTextSeq = 0;
let kpiEventSeq = 0;
let runAnimationSeq = 0;

// audit ledger ids already reflected as a floating callout; module-scoped so it survives
// across store updates without becoming rendered/persisted state of its own
let seenAuditIds: Set<string> | null = null;

// office-scene ephemeral animation kinds, purely presentational and client-local. "raised" is a
// brief entrance flash on the rack the instant a new incident spawns there, distinct from the
// severity glow (which is continuous for as long as the incident stays open) -- same
// trigger/dismiss mechanism as "acknowledge"/"mitigate", just consumed by ServerRack itself.
// "degrade" / "fail" / "recover" are the staged service-status transitions emitted by the office's
// useServiceTransitions hook (the previous-status diff); each is dismissed by that hook after its ttl.
export type RunAnimationKind = "acknowledge" | "mitigate" | "raised" | "degrade" | "fail" | "recover";

export interface RunAnimation {
  id: string;
  serviceId: string;
  kind: RunAnimationKind;
}

// a compact, non-blocking summary shown the instant an incident leaves the active list -- never
// forces the full postmortem open, just offers it. cost is best-effort: summed from whatever
// RUNBOOK_EXECUTED audit entries for this exact incident_id are still in the current bounded
// recent_audits window; omitted (not fabricated as 0) if none are found there.
export interface IncidentResolutionSummary {
  id: string;
  incidentId: string;
  serviceId: string;
  severity: Incident["severity"];
  mttaSeconds: number;
  mttrSeconds: number;
  cost: number | null;
  techDebtDelta: number | null;
}

let resolutionSummarySeq = 0;

// PROGRESS OF THE GUIDED TUTORIAL (steps themselves are declarative data in components/tutorial).
// `completed` holds step ids that already finished or were skipped, so going Back never re-fires them.
export type TutorialIncidentPhase = "idle" | "creating" | "ready" | "failed";

export interface TutorialProgress {
  stepIndex: number;
  completed: string[];
  incidentId: string | null;
  serviceId: string | null;
  // "tutorial" = the deterministic practice incident; "natural" = a real one adopted as a fallback
  incidentSource: "tutorial" | "natural" | null;
  incidentPhase: TutorialIncidentPhase;
  // whether the practice incident was ever seen in telemetry (so "gone" can only mean resolved)
  incidentSeen: boolean;
  startBudget: number | null;
  // mitigation cooldown ticks when the runbook step began; a changed entry means a runbook was fired
  cooldownBaseline: Record<string, number> | null;
}

export const INITIAL_TUTORIAL_PROGRESS: TutorialProgress = {
  stepIndex: 0,
  completed: [],
  incidentId: null,
  serviceId: null,
  incidentSource: null,
  incidentPhase: "idle",
  incidentSeen: false,
  startBudget: null,
  cooldownBaseline: null,
};

interface GameStore {
  telemetry: TelemetryState;
  connected: boolean;
  selectedServiceId: string | null;
  selectedIncident: Incident | null;
  postMortem: { incidentId: string; markdown: string } | null;
  resolvedHistory: Incident[];
  floatingTexts: FloatingText[];
  runAnimations: RunAnimation[];
  resolutionSummaries: IncidentResolutionSummary[];
  // this scenario's own backend-computed objectives (ScenarioEngine.objectives()), refreshed by
  // useScenarioObjectives -- the frontend only ever renders `done`, never decides it
  scenarioObjectives: ScenarioObjective[];
  // brief, dismissible post-launch briefing for the scenario that was just started -- null for
  // sandbox (which has no backend-computed objectives to show), populated once right after launch
  scenarioBriefing: ActiveScenario | null;
  language: Language;
  activeDilemma: DilemmaOffer | null;
  onboardingOpen: boolean;
  // first run: offer the tutorial (once the title is gone) instead of forcing it
  tutorialOfferPending: boolean;
  tutorial: TutorialProgress;
  settingsOpen: boolean;
  scenarioSelectOpen: boolean;
  scenarioBuilderOpen: boolean;
  buildModeActive: boolean;
  metricsHistory: MetricsSample[];
  // labelled chips that fly off a kpi meter (kept apart from floatingTexts on purpose)
  kpiEvents: KpiEvent[];
  // net cash change per tick between audited events (the calm "passive burn" indicator)
  budgetTrend: number;
  achievementToast: AchievementToastData | null;
  triageIncidentId: string | null;
  replayIncidentId: string | null;
  titleScreenVisible: boolean;
  pauseMenuOpen: boolean;
  creditsOpen: boolean;
  hallOfFameOpen: boolean;
  screenShakeSeq: number;
  screenShakeMagnitude: ScreenShakeMagnitude;
  impactFlashSeq: number;
  dockTab: "incidents" | "directives" | "compliance" | "upgrades" | "roster" | "achievements" | "metrics";
  dockCollapsed: boolean;
  highContrast: boolean;
  colorblindSafe: boolean;
  reducedMotionPref: ReducedMotionPref;

  setReducedMotionPref: (pref: ReducedMotionPref) => void;
  setDockTab: (tab: "incidents" | "directives" | "compliance" | "upgrades" | "roster" | "achievements" | "metrics") => void;
  setDockCollapsed: (collapsed: boolean) => void;
  toggleDockCollapsed: () => void;
  setTelemetry: (telemetry: TelemetryState) => void;
  setConnected: (connected: boolean) => void;
  selectService: (serviceId: string | null) => void;
  openIncidentDetail: (incident: Incident) => void;
  closeIncidentDetail: () => void;
  openPostMortem: (incidentId: string, markdown: string) => void;
  closePostMortem: () => void;
  pushFloatingText: (text: string, tone: FloatingTextTone) => void;
  dismissFloatingText: (id: string) => void;
  triggerRunAnimation: (serviceId: string, kind: RunAnimationKind) => string;
  dismissRunAnimation: (id: string) => void;
  dismissResolutionSummary: (id: string) => void;
  pushKpiEvent: (kpi: KpiId, amount: number, label?: string) => void;
  dismissKpiEvent: (id: string) => void;
  setScenarioObjectives: (objectives: ScenarioObjective[]) => void;
  openScenarioBriefing: (scenario: ActiveScenario) => void;
  closeScenarioBriefing: () => void;
  setLanguage: (language: Language) => void;
  setActiveDilemma: (dilemma: DilemmaOffer | null) => void;
  openOnboarding: () => void;
  closeOnboarding: () => void;
  patchTutorial: (patch: Partial<TutorialProgress>) => void;
  completeTutorialStep: (stepId: string) => void;
  resetTutorial: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  openScenarioSelect: () => void;
  closeScenarioSelect: () => void;
  openScenarioBuilder: () => void;
  closeScenarioBuilder: () => void;
  toggleBuildMode: () => void;
  setAchievementToast: (toast: Omit<AchievementToastData, "id"> | null) => void;
  dismissAchievementToast: () => void;
  openTriageTerminal: (incidentId: string) => void;
  closeTriageTerminal: () => void;
  openIncidentReplay: (incidentId: string) => void;
  closeIncidentReplay: () => void;
  hideTitleScreen: () => void;
  showTitleScreen: () => void;
  openPauseMenu: () => void;
  closePauseMenu: () => void;
  togglePauseMenu: () => void;
  openCredits: () => void;
  closeCredits: () => void;
  openHallOfFame: () => void;
  closeHallOfFame: () => void;
  triggerScreenShake: (magnitude?: ScreenShakeMagnitude) => void;
  triggerImpactFlash: () => void;
  setHighContrast: (value: boolean) => void;
  setColorblindSafe: (value: boolean) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  telemetry: INITIAL_TELEMETRY,
  connected: false,
  selectedServiceId: null,
  selectedIncident: null,
  postMortem: null,
  resolvedHistory: [],
  floatingTexts: [],
  runAnimations: [],
  resolutionSummaries: [],
  scenarioObjectives: [],
  scenarioBriefing: null,
  language: typeof window === "undefined" ? detectBrowserLanguage() : loadStoredLanguage(),
  activeDilemma: null,
  onboardingOpen: false,
  tutorialOfferPending: shouldShowOnboardingOnBoot(),
  tutorial: INITIAL_TUTORIAL_PROGRESS,
  settingsOpen: false,
  scenarioSelectOpen: false,
  scenarioBuilderOpen: false,
  buildModeActive: false,
  metricsHistory: [],
  kpiEvents: [],
  budgetTrend: 0,
  achievementToast: null,
  triageIncidentId: null,
  replayIncidentId: null,
  titleScreenVisible: true,
  pauseMenuOpen: false,
  creditsOpen: false,
  hallOfFameOpen: false,
  screenShakeSeq: 0,
  screenShakeMagnitude: "light",
  impactFlashSeq: 0,
  dockTab: "incidents",
  dockCollapsed: false,
  highContrast: loadStoredFlag(HIGH_CONTRAST_STORAGE_KEY),
  colorblindSafe: loadStoredFlag(COLORBLIND_SAFE_STORAGE_KEY),
  reducedMotionPref: loadReducedMotionPref(),

  setReducedMotionPref: (pref) => {
    try {
      localStorage.setItem(REDUCED_MOTION_STORAGE_KEY, pref);
    } catch {
      // best-effort only
    }
    set({ reducedMotionPref: pref });
  },
  setTelemetry: (telemetry) =>
    set((state) => {
      // defend against a stale/older backend process (or a truncated frame) omitting a newer
      // field: fall back to the safe initial defaults instead of crashing on undefined.length
      telemetry = { ...INITIAL_TELEMETRY, ...telemetry };
      // keep references of everything that did not change since the previous frame
      telemetry = shareTelemetry(state.telemetry, telemetry);

      // a reset is signaled either by tick regression or by a new session_id from the backend
      const wasReset =
        telemetry.tick < state.telemetry.tick ||
        (Boolean(state.telemetry.session_id) &&
          Boolean(telemetry.session_id) &&
          telemetry.session_id !== state.telemetry.session_id);

      const dict = TRANSLATIONS[state.language];
      const prevActiveIds = new Set(state.telemetry.active_incidents.map((i) => i.id));
      const nextActiveIds = new Set(telemetry.active_incidents.map((i) => i.id));

      // incidents present last frame but missing now just got mitigated/resolved
      const newlyResolved = state.telemetry.active_incidents.filter((i) => !nextActiveIds.has(i.id));
      const resolvedHistory = wasReset
        ? []
        : newlyResolved.length
        ? [...newlyResolved, ...state.resolvedHistory].slice(0, RESOLVED_HISTORY_LIMIT)
        : state.resolvedHistory;

      // incidents present now but absent last frame just spawned
      const newlyRaised = telemetry.active_incidents.filter((i) => !prevActiveIds.has(i.id));

      const spawnedTexts: FloatingText[] = [];
      const raisedAnimations: RunAnimation[] = [];
      for (const inc of newlyRaised) {
        const critical = inc.severity === "P1_CRITICAL";
        const urgent = critical || inc.severity === "P2_HIGH";
        // P3/P4 get a calmer tone (info, not danger) -- discreet feedback, same text either way
        spawnedTexts.push({
          id: `ft-${floatingTextSeq++}`,
          text: critical ? dict.floatingTexts.criticalThreat : dict.floatingTexts.threatDetected,
          tone: urgent ? "danger" : "info",
        });
        // initial-impact hint, only for P1/P2 and only when it's actually informative (something
        // downstream really is at risk) -- reuses the exact same blast-radius math IncidentsPanel
        // already shows, never a fabricated number
        if (urgent) {
          const svc = telemetry.services.find((s) => s.id === inc.service_id);
          const dependents = countDependents(svc, telemetry.services);
          if (dependents > 0) {
            spawnedTexts.push({
              id: `ft-${floatingTextSeq++}`,
              text: dict.incidents.dependentsAffected(dependents),
              tone: "warning",
            });
          }
        }
        // brief rack entrance flash, distinct from the continuous severity glow -- consumed by
        // ServerRack and self-dismissed the same way "mitigate"/"acknowledge" already are
        raisedAnimations.push({ id: `ra-${runAnimationSeq++}`, serviceId: inc.service_id, kind: "raised" });
      }
      const newResolutionSummaries: IncidentResolutionSummary[] = [];
      for (const inc of newlyResolved) {
        spawnedTexts.push({
          id: `ft-${floatingTextSeq++}`,
          text: dict.floatingTexts.nodeRestored(inc.service_id),
          tone: "success",
        });
        // best-effort cost: only what's still visible in the current bounded audit window for
        // this exact incident_id -- never fabricated if nothing is found there
        const relatedCosts = telemetry.recent_audits
          .filter((a) => a.event_type === "RUNBOOK_EXECUTED" && a.details.incident_id === inc.id)
          .map((a) => Number(a.details.cost ?? 0));
        const relatedTdi = telemetry.recent_audits
          .filter((a) => a.event_type === "RUNBOOK_EXECUTED" && a.details.incident_id === inc.id)
          .map((a) => Number(a.details.tech_debt_delta ?? 0));
        newResolutionSummaries.push({
          id: `rs-${resolutionSummarySeq++}`,
          incidentId: inc.id,
          serviceId: inc.service_id,
          severity: inc.severity,
          mttaSeconds: inc.mtta_seconds,
          mttrSeconds: inc.mttr_seconds,
          cost: relatedCosts.length ? relatedCosts.reduce((sum, c) => sum + c, 0) : null,
          techDebtDelta: relatedTdi.length ? relatedTdi.reduce((sum, d) => sum + d, 0) : null,
        });
      }
      const justBreached = state.telemetry.status !== "breached" && telemetry.status === "breached";
      if (justBreached) {
        spawnedTexts.push({ id: `ft-${floatingTextSeq++}`, text: dict.floatingTexts.slaWarning, tone: "warning" });
      }

      // kpi chips collected from this frame's new ledger entries (see the merge below)
      const kpiInputs: KpiEventInput[] = [];
      let auditedCash = false;
      const hadAuditBaseline = seenAuditIds !== null && !wasReset;
      // ledger diff: turn newly-appended audit entries into RPG-style impact callouts. the very
      // first frame just seeds the seen-ids baseline so a resumed session doesn't replay its
      // entire history as a burst of toasts.
      if (seenAuditIds === null || wasReset) {
        seenAuditIds = new Set(telemetry.recent_audits.map((a) => a.id));
      } else {
        for (const audit of telemetry.recent_audits) {
          if (seenAuditIds.has(audit.id)) continue;
          seenAuditIds.add(audit.id);
          kpiInputs.push(...auditKpiInputs(audit, dict, consumeLocalSpend));
          if (typeof audit.details?.amount === "number") auditedCash = true;

          if (audit.event_type === "UNATTENDED_ALERT_VIOLATION") {
            const fine = Number(audit.details.fine_amount ?? 0);
            spawnedTexts.push({
              id: `ft-${floatingTextSeq++}`,
              text: dict.floatingTexts.fineApplied(fine.toLocaleString()),
              tone: "danger",
            });
          } else if (audit.event_type === "SLA_BREACH_EMERGENCY_SANCTION") {
            spawnedTexts.push({ id: `ft-${floatingTextSeq++}`, text: dict.floatingTexts.slaSanction, tone: "danger" });
          } else if (audit.event_type === "MONTHLY_AUDIT_CYCLE_SURVIVED") {
            spawnedTexts.push({ id: `ft-${floatingTextSeq++}`, text: dict.floatingTexts.cycleSurvived, tone: "gold" });
          } else if (audit.event_type === "RUNBOOK_EXECUTED") {
            // consequence-of-action: distinguish a clean fix from a mismatched runbook that only
            // papered over the incident (backend already sends fully_resolved on every attempt)
            if (audit.details.fully_resolved === true) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.mitigationSuccess,
                tone: "success",
              });
            } else if (audit.details.fully_resolved === false) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.mitigationMismatch,
                tone: "warning",
              });
            }
            const tdiDelta = Number(audit.details.tech_debt_delta ?? 0);
            if (tdiDelta < 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.techDebtImproved(Math.abs(tdiDelta)),
                tone: "success",
              });
            } else if (tdiDelta > 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.techDebtWorsened(tdiDelta),
                tone: "warning",
              });
            }
          } else if (audit.event_type === "FEATURE_FREEZE_ENGAGED") {
            spawnedTexts.push({
              id: `ft-${floatingTextSeq++}`,
              text: dict.floatingTexts.featureFreezeEngaged,
              tone: "danger",
            });
          } else if (audit.event_type === "FEATURE_FREEZE_LIFTED") {
            spawnedTexts.push({
              id: `ft-${floatingTextSeq++}`,
              text: dict.floatingTexts.featureFreezeLifted,
              tone: "success",
            });
          } else if (audit.event_type === "ROOT_CAUSE_IDENTIFIED") {
            spawnedTexts.push({
              id: `ft-${floatingTextSeq++}`,
              text: dict.floatingTexts.rootCauseIdentified,
              tone: "gold",
            });
          } else if (audit.event_type === "AI_AUDITOR_VERDICT_APPLIED") {
            // the backend-computed, already-capped eligible amount -- never the LLM's raw
            // proposal (see formulas.eligible_audit_adjustment); "amount" is the generic signed
            // field every audited financial event carries (negative = fine, positive = credit)
            const amount = Number(audit.details.amount ?? 0);
            if (amount < 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.auditorFineApplied(Math.abs(amount).toLocaleString()),
                tone: "danger",
              });
            } else if (amount > 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.auditorCreditApplied(amount.toLocaleString()),
                tone: "gold",
              });
            }
          } else if (audit.event_type === "DILEMMA_RESOLVED") {
            const budgetDelta = Number(audit.details.budget_delta ?? 0);
            if (budgetDelta > 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.budgetGain(budgetDelta.toLocaleString()),
                tone: "gold",
              });
            } else if (budgetDelta < 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.budgetLoss(Math.abs(budgetDelta).toLocaleString()),
                tone: "danger",
              });
            }
            const happinessDelta = Number(audit.details.happiness_delta ?? 0);
            if (happinessDelta > 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.moraleGain(Math.round(happinessDelta)),
                tone: "success",
              });
            } else if (happinessDelta < 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.moraleLoss(Math.round(Math.abs(happinessDelta))),
                tone: "warning",
              });
            }
            const dilemmaReputationDelta = Number(audit.details.reputation_delta ?? 0);
            if (dilemmaReputationDelta > 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.reputationGain(Math.round(dilemmaReputationDelta)),
                tone: "success",
              });
            } else if (dilemmaReputationDelta < 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.reputationLoss(Math.round(Math.abs(dilemmaReputationDelta))),
                tone: "warning",
              });
            }
            const dilemmaTechDebtDelta = Number(audit.details.tech_debt_delta ?? 0);
            if (dilemmaTechDebtDelta < 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.techDebtImproved(Math.abs(dilemmaTechDebtDelta)),
                tone: "success",
              });
            } else if (dilemmaTechDebtDelta > 0) {
              spawnedTexts.push({
                id: `ft-${floatingTextSeq++}`,
                text: dict.floatingTexts.techDebtWorsened(dilemmaTechDebtDelta),
                tone: "warning",
              });
            }
          }
        }
        // keep the seen-set bounded instead of growing forever across a long session
        if (seenAuditIds.size > 400) {
          seenAuditIds = new Set(telemetry.recent_audits.map((a) => a.id));
        }
      }

      const floatingTexts = spawnedTexts.length
        ? [...state.floatingTexts, ...spawnedTexts].slice(-FLOATING_TEXT_LIMIT)
        : state.floatingTexts;

      // a dilemma outlives its own displayed countdown only until the next tick confirms
      // the server already auto-resolved it; reconcile rather than trust the client timer.
      // a reset always clears it outright -- the backend no longer knows about it either.
      const activeDilemma = wasReset
        ? null
        : state.activeDilemma && telemetry.tick >= state.activeDilemma.expires_at_tick
        ? null
        : state.activeDilemma;

      // boardroom sparkline sample, derived entirely client-side from this tick's service snapshot
      const healthyCount = telemetry.services.filter((s) => s.status === "healthy").length;
      const sample: MetricsSample = {
        tick: telemetry.tick,
        avgLatencyMs: telemetry.services.length
          ? telemetry.services.reduce((sum, s) => sum + s.latency_ms, 0) / telemetry.services.length
          : 0,
        errorRatePct: telemetry.services.length
          ? (telemetry.services.reduce((sum, s) => sum + s.error_rate, 0) / telemetry.services.length) * 100
          : 0,
        throughputProxy: healthyCount * NOMINAL_RPS_PER_HEALTHY_SERVICE,
        sla: telemetry.sla_percentage,
      };
      const metricsHistory = [...state.metricsHistory, sample].slice(-METRICS_HISTORY_LIMIT);

      // kpi chips, merged per kpi so a burst of changes (5x speed) stays readable
      const nowMs = Date.now();
      let kpiEvents = wasReset ? [] : state.kpiEvents;
      for (const input of kpiInputs) {
        kpiEvents = mergeKpiEvent(kpiEvents, input, nowMs, () => `kpi-${kpiEventSeq++}`);
      }
      // passive burn: the cash delta of a plain tick (no audited movement) is shown as a calm
      // per-tick trend instead of a chip every second
      let budgetTrend = wasReset ? 0 : state.budgetTrend;
      const tickDelta = telemetry.tick - state.telemetry.tick;
      if (hadAuditBaseline && !auditedCash && tickDelta > 0 && tickDelta <= 3) {
        budgetTrend = (telemetry.budget - state.telemetry.budget) / tickDelta;
      }

      // game feel: a fresh p1 alarm rattles the screen and flashes red; going bankrupt hits harder
      const newlyRaisedP1 = newlyRaised.some((i) => i.severity === "P1_CRITICAL");
      const justWentBankrupt = state.telemetry.status !== "bankrupted" && telemetry.status === "bankrupted";
      let screenShakeSeq = state.screenShakeSeq;
      let screenShakeMagnitude = state.screenShakeMagnitude;
      let impactFlashSeq = state.impactFlashSeq;
      if (justWentBankrupt) {
        screenShakeSeq += 1;
        screenShakeMagnitude = "heavy";
        impactFlashSeq += 1;
      } else if (newlyRaisedP1 || justBreached) {
        screenShakeSeq += 1;
        screenShakeMagnitude = "light";
        impactFlashSeq += 1;
      }

      const runAnimations = raisedAnimations.length
        ? [...state.runAnimations, ...raisedAnimations]
        : state.runAnimations;
      const resolutionSummaries = wasReset
        ? []
        : newResolutionSummaries.length
        ? [...state.resolutionSummaries, ...newResolutionSummaries]
        : state.resolutionSummaries;

      return {
        telemetry,
        resolvedHistory,
        floatingTexts,
        runAnimations,
        resolutionSummaries,
        activeDilemma,
        metricsHistory,
        kpiEvents,
        budgetTrend,
        screenShakeSeq,
        screenShakeMagnitude,
        impactFlashSeq,
        // no auto-selection: the inspector and action deck target only activate on an explicit click
        selectedServiceId: state.selectedServiceId,
        // a fresh run means any modal still open from the *previous* one is now showing a ghost:
        // an incident/postmortem/triage session the backend no longer has any record of. close
        // them all rather than leave them frozen on stale data over the new session.
        ...(wasReset
          ? {
              selectedServiceId: null,
              selectedIncident: null,
              postMortem: null,
              triageIncidentId: null,
              replayIncidentId: null,
              scenarioObjectives: [],
              // the briefing is deliberately NOT cleared here: the launch flow opens it right after the
              // reset, and this frame can arrive after it -- the briefing closes only via its own button
              resolutionSummaries: [],
              floatingTexts: [],
            }
          : null),
      };
    }),
  setConnected: (connected) => set({ connected }),
  selectService: (serviceId) => set({ selectedServiceId: serviceId }),
  openIncidentDetail: (incident) => set({ selectedIncident: incident }),
  closeIncidentDetail: () => set({ selectedIncident: null }),
  openPostMortem: (incidentId, markdown) => set({ postMortem: { incidentId, markdown } }),
  closePostMortem: () => set({ postMortem: null }),
  pushFloatingText: (text, tone) =>
    set((state) => ({
      floatingTexts: [...state.floatingTexts, { id: `ft-${floatingTextSeq++}`, text, tone }].slice(
        -FLOATING_TEXT_LIMIT
      ),
    })),
  dismissFloatingText: (id) =>
    set((state) => ({ floatingTexts: state.floatingTexts.filter((t) => t.id !== id) })),
  triggerRunAnimation: (serviceId, kind) => {
    const id = `ra-${runAnimationSeq++}`;
    set((state) => ({ runAnimations: [...state.runAnimations, { id, serviceId, kind }] }));
    return id;
  },
  dismissRunAnimation: (id) =>
    set((state) => ({ runAnimations: state.runAnimations.filter((a) => a.id !== id) })),
  pushKpiEvent: (kpi, amount, label) =>
    set((state) => ({
      kpiEvents: mergeKpiEvent(state.kpiEvents, { kpi, amount, label }, Date.now(), () => `kpi-${kpiEventSeq++}`),
    })),
  dismissKpiEvent: (id) => set((state) => ({ kpiEvents: state.kpiEvents.filter((e) => e.id !== id) })),
  dismissResolutionSummary: (id) =>
    set((state) => ({ resolutionSummaries: state.resolutionSummaries.filter((r) => r.id !== id) })),
  setScenarioObjectives: (objectives) => set({ scenarioObjectives: objectives }),
  openScenarioBriefing: (scenario) => set({ scenarioBriefing: scenario }),
  closeScenarioBriefing: () => set({ scenarioBriefing: null }),
  // a lazy dictionary is fetched first and the switch happens only once it is registered, so the UI
  // never renders keys/undefined; the latest request wins and a failed fetch leaves the language as is
  setLanguage: (language) => {
    const apply = () => {
      persistLanguage(language);
      set({ language });
    };
    languageRequest = language;
    if (isLanguageReady(language)) {
      apply();
      return;
    }
    loadLanguage(language).then(
      () => {
        if (languageRequest === language) apply();
      },
      () => {
        // offline with a cold cache: keep the current language, the user can retry the switch
      }
    );
  },
  setActiveDilemma: (dilemma) => set({ activeDilemma: dilemma }),
  // every open starts at step 1; every close path (Escape, skip, finish) resets it again
  openOnboarding: () => set({ onboardingOpen: true, tutorialOfferPending: false, tutorial: INITIAL_TUTORIAL_PROGRESS }),
  closeOnboarding: () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } catch {
      // best-effort only; worst case the tutorial reappears next session
    }
    set({ onboardingOpen: false, tutorialOfferPending: false, tutorial: INITIAL_TUTORIAL_PROGRESS });
  },
  patchTutorial: (patch) => set((state) => ({ tutorial: { ...state.tutorial, ...patch } })),
  completeTutorialStep: (stepId) =>
    set((state) =>
      state.tutorial.completed.includes(stepId)
        ? state
        : { tutorial: { ...state.tutorial, completed: [...state.tutorial.completed, stepId] } }
    ),
  resetTutorial: () => set({ tutorial: INITIAL_TUTORIAL_PROGRESS }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openScenarioSelect: () => set({ scenarioSelectOpen: true }),
  closeScenarioSelect: () => set({ scenarioSelectOpen: false }),
  openScenarioBuilder: () => set({ scenarioBuilderOpen: true }),
  closeScenarioBuilder: () => set({ scenarioBuilderOpen: false }),
  toggleBuildMode: () => set((state) => ({ buildModeActive: !state.buildModeActive })),
  setAchievementToast: (toast) =>
    set({ achievementToast: toast ? { ...toast, id: `ach-toast-${achievementToastSeq++}` } : null }),
  dismissAchievementToast: () => set({ achievementToast: null }),
  openTriageTerminal: (incidentId) => set({ triageIncidentId: incidentId }),
  closeTriageTerminal: () => set({ triageIncidentId: null }),
  openIncidentReplay: (incidentId) => set({ replayIncidentId: incidentId }),
  closeIncidentReplay: () => set({ replayIncidentId: null }),
  hideTitleScreen: () => set({ titleScreenVisible: false }),
  // back to the title also drops anything that would otherwise float above it: a timed CAB
  // decision (it would keep ticking behind the menu) and incident dialogs of the run being left
  showTitleScreen: () =>
    set({
      titleScreenVisible: true,
      pauseMenuOpen: false,
      activeDilemma: null,
      selectedIncident: null,
      postMortem: null,
      triageIncidentId: null,
      replayIncidentId: null,
      scenarioBriefing: null,
    }),
  openPauseMenu: () => set({ pauseMenuOpen: true }),
  closePauseMenu: () => set({ pauseMenuOpen: false }),
  togglePauseMenu: () => set((state) => ({ pauseMenuOpen: !state.pauseMenuOpen })),
  openCredits: () => set({ creditsOpen: true }),
  closeCredits: () => set({ creditsOpen: false }),
  openHallOfFame: () => set({ hallOfFameOpen: true }),
  closeHallOfFame: () => set({ hallOfFameOpen: false }),
  triggerScreenShake: (magnitude = "light") =>
    set((state) => ({ screenShakeSeq: state.screenShakeSeq + 1, screenShakeMagnitude: magnitude })),
  triggerImpactFlash: () => set((state) => ({ impactFlashSeq: state.impactFlashSeq + 1 })),
  setHighContrast: (value) => {
    persistFlag(HIGH_CONTRAST_STORAGE_KEY, value);
    set({ highContrast: value });
  },
  setDockTab: (tab) => set({ dockTab: tab, dockCollapsed: false }),
  setDockCollapsed: (collapsed) => set({ dockCollapsed: collapsed }),
  toggleDockCollapsed: () => set((state) => ({ dockCollapsed: !state.dockCollapsed })),
  setColorblindSafe: (value) => {
    persistFlag(COLORBLIND_SAFE_STORAGE_KEY, value);
    set({ colorblindSafe: value });
  },
}));
