import { create } from "zustand";
import { detectBrowserLanguage, Language, loadStoredLanguage, persistLanguage } from "../i18n/language";
import { TRANSLATIONS } from "../i18n/translations";
import { ActiveScenario, DilemmaOffer, Incident, ScenarioObjective, TelemetryState } from "../types/game";
import { countDependents } from "../utils/incidentImpact";

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
let runAnimationSeq = 0;

// audit ledger ids already reflected as a floating callout; module-scoped so it survives
// across store updates without becoming rendered/persisted state of its own
let seenAuditIds: Set<string> | null = null;

// office-scene ephemeral animation kinds, purely presentational and client-local. "raised" is a
// brief entrance flash on the rack the instant a new incident spawns there, distinct from the
// severity glow (which is continuous for as long as the incident stays open) -- same
// trigger/dismiss mechanism as "acknowledge"/"mitigate", just consumed by ServerRack itself.
export type RunAnimationKind = "acknowledge" | "mitigate" | "raised";

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
  settingsOpen: boolean;
  scenarioSelectOpen: boolean;
  scenarioBuilderOpen: boolean;
  buildModeActive: boolean;
  metricsHistory: MetricsSample[];
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
  triggerRunAnimation: (serviceId: string, kind: RunAnimationKind) => void;
  dismissRunAnimation: (id: string) => void;
  dismissResolutionSummary: (id: string) => void;
  setScenarioObjectives: (objectives: ScenarioObjective[]) => void;
  openScenarioBriefing: (scenario: ActiveScenario) => void;
  closeScenarioBriefing: () => void;
  setLanguage: (language: Language) => void;
  setActiveDilemma: (dilemma: DilemmaOffer | null) => void;
  openOnboarding: () => void;
  closeOnboarding: () => void;
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
  onboardingOpen: shouldShowOnboardingOnBoot(),
  settingsOpen: false,
  scenarioSelectOpen: false,
  scenarioBuilderOpen: false,
  buildModeActive: false,
  metricsHistory: [],
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

  setTelemetry: (telemetry) =>
    set((state) => {
      // defend against a stale/older backend process (or a truncated frame) omitting a newer
      // field: fall back to the safe initial defaults instead of crashing on undefined.length
      telemetry = { ...INITIAL_TELEMETRY, ...telemetry };

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

      // ledger diff: turn newly-appended audit entries into RPG-style impact callouts. the very
      // first frame just seeds the seen-ids baseline so a resumed session doesn't replay its
      // entire history as a burst of toasts.
      if (seenAuditIds === null || wasReset) {
        seenAuditIds = new Set(telemetry.recent_audits.map((a) => a.id));
      } else {
        for (const audit of telemetry.recent_audits) {
          if (seenAuditIds.has(audit.id)) continue;
          seenAuditIds.add(audit.id);

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
      };
      const metricsHistory = [...state.metricsHistory, sample].slice(-METRICS_HISTORY_LIMIT);

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
              scenarioBriefing: null,
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
  triggerRunAnimation: (serviceId, kind) =>
    set((state) => ({
      runAnimations: [...state.runAnimations, { id: `ra-${runAnimationSeq++}`, serviceId, kind }],
    })),
  dismissRunAnimation: (id) =>
    set((state) => ({ runAnimations: state.runAnimations.filter((a) => a.id !== id) })),
  dismissResolutionSummary: (id) =>
    set((state) => ({ resolutionSummaries: state.resolutionSummaries.filter((r) => r.id !== id) })),
  setScenarioObjectives: (objectives) => set({ scenarioObjectives: objectives }),
  openScenarioBriefing: (scenario) => set({ scenarioBriefing: scenario }),
  closeScenarioBriefing: () => set({ scenarioBriefing: null }),
  setLanguage: (language) => {
    persistLanguage(language);
    set({ language });
  },
  setActiveDilemma: (dilemma) => set({ activeDilemma: dilemma }),
  openOnboarding: () => set({ onboardingOpen: true }),
  closeOnboarding: () => {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } catch {
      // best-effort only; worst case the tutorial reappears next session
    }
    set({ onboardingOpen: false });
  },
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
  showTitleScreen: () => set({ titleScreenVisible: true, pauseMenuOpen: false }),
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
