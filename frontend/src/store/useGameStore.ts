import { create } from "zustand";
import { detectBrowserLanguage, Language, loadStoredLanguage, persistLanguage } from "../i18n/language";
import { TRANSLATIONS } from "../i18n/translations";
import { DilemmaOffer, Incident, TelemetryState } from "../types/game";

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

// office-scene ephemeral animation kinds, purely presentational and client-local
export type RunAnimationKind = "acknowledge" | "mitigate";

export interface RunAnimation {
  id: string;
  serviceId: string;
  kind: RunAnimationKind;
}

interface GameStore {
  telemetry: TelemetryState;
  connected: boolean;
  selectedServiceId: string | null;
  selectedIncident: Incident | null;
  postMortem: { incidentId: string; markdown: string } | null;
  resolvedHistory: Incident[];
  floatingTexts: FloatingText[];
  runAnimations: RunAnimation[];
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
  creditsOpen: boolean;
  hallOfFameOpen: boolean;
  screenShakeSeq: number;
  screenShakeMagnitude: ScreenShakeMagnitude;
  impactFlashSeq: number;
  highContrast: boolean;
  colorblindSafe: boolean;

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
  creditsOpen: false,
  hallOfFameOpen: false,
  screenShakeSeq: 0,
  screenShakeMagnitude: "light",
  impactFlashSeq: 0,
  highContrast: loadStoredFlag(HIGH_CONTRAST_STORAGE_KEY),
  colorblindSafe: loadStoredFlag(COLORBLIND_SAFE_STORAGE_KEY),

  setTelemetry: (telemetry) =>
    set((state) => {
      // defend against a stale/older backend process (or a truncated frame) omitting a newer
      // field: fall back to the safe initial defaults instead of crashing on undefined.length
      telemetry = { ...INITIAL_TELEMETRY, ...telemetry };

      const dict = TRANSLATIONS[state.language];
      const prevActiveIds = new Set(state.telemetry.active_incidents.map((i) => i.id));
      const nextActiveIds = new Set(telemetry.active_incidents.map((i) => i.id));

      // incidents present last frame but missing now just got mitigated/resolved
      const newlyResolved = state.telemetry.active_incidents.filter((i) => !nextActiveIds.has(i.id));
      const resolvedHistory = newlyResolved.length
        ? [...newlyResolved, ...state.resolvedHistory].slice(0, RESOLVED_HISTORY_LIMIT)
        : state.resolvedHistory;

      // incidents present now but absent last frame just spawned
      const newlyRaised = telemetry.active_incidents.filter((i) => !prevActiveIds.has(i.id));

      const spawnedTexts: FloatingText[] = [];
      for (const inc of newlyRaised) {
        spawnedTexts.push({
          id: `ft-${floatingTextSeq++}`,
          text: inc.severity === "P1_CRITICAL" ? dict.floatingTexts.criticalThreat : dict.floatingTexts.threatDetected,
          tone: "danger",
        });
      }
      for (const inc of newlyResolved) {
        spawnedTexts.push({
          id: `ft-${floatingTextSeq++}`,
          text: dict.floatingTexts.nodeRestored(inc.service_id),
          tone: "success",
        });
      }
      const justBreached = state.telemetry.status !== "breached" && telemetry.status === "breached";
      if (justBreached) {
        spawnedTexts.push({ id: `ft-${floatingTextSeq++}`, text: dict.floatingTexts.slaWarning, tone: "warning" });
      }

      // ledger diff: turn newly-appended audit entries into RPG-style impact callouts. the very
      // first frame just seeds the seen-ids baseline so a resumed session doesn't replay its
      // entire history as a burst of toasts.
      if (seenAuditIds === null) {
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
              spawnedTexts.push({ id: `ft-${floatingTextSeq++}`, text: dict.floatingTexts.moraleGain, tone: "success" });
            } else if (happinessDelta < 0) {
              spawnedTexts.push({ id: `ft-${floatingTextSeq++}`, text: dict.floatingTexts.moraleLoss, tone: "warning" });
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
      // the server already auto-resolved it; reconcile rather than trust the client timer
      const activeDilemma =
        state.activeDilemma && telemetry.tick >= state.activeDilemma.expires_at_tick ? null : state.activeDilemma;

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

      return {
        telemetry,
        resolvedHistory,
        floatingTexts,
        activeDilemma,
        metricsHistory,
        screenShakeSeq,
        screenShakeMagnitude,
        impactFlashSeq,
        // no auto-selection: the inspector and action deck target only activate on an explicit click
        selectedServiceId: state.selectedServiceId,
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
  showTitleScreen: () => set({ titleScreenVisible: true }),
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
  setColorblindSafe: (value) => {
    persistFlag(COLORBLIND_SAFE_STORAGE_KEY, value);
    set({ colorblindSafe: value });
  },
}));
