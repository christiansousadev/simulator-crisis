import { Language } from "./language";
import { auditorChatEn, AuditorChatCopy } from "./auditorChat";
import { gameplayModalsEn, GameplayModalsCopy } from "./gameplayModals";
import { hudEn, HudCopy } from "./hud";
import { officeLifeEn, OfficeLifeCopy } from "./officeLife";
import { uiGapsEn, UiGapsCopy } from "./uiGaps";
import { flowEn, FlowStrings } from "./flowStrings";

// mitigation action ids mirror app.engine.formulas.MITIGATION_CATALOG on the backend
export type MitigationActionId = "rollback" | "scale_replicas" | "circuit_breaker" | "emergency_patch";
export type MitigationCategoryKey = "deployment" | "compute" | "resilience" | "emergency";
export type ServiceStatusKey = "healthy" | "degraded" | "down";
export type IncidentSeverityKey = "P1_CRITICAL" | "P2_HIGH" | "P3_MEDIUM" | "P4_LOW";

// upgrade ids mirror app.engine.upgrades.UPGRADE_CATALOG on the backend
export type UpgradeActionId =
  | "apm_tracing"
  | "predictive_anomaly_detection"
  | "multi_az_clusters"
  | "automated_cicd"
  | "espresso_machine"
  | "ergonomic_chairs";
export type UpgradeCategoryKey = "observability" | "resilience" | "facility";
export type CompetencyKey = "auth" | "payments" | "gateway" | "db";
export type OnCallStatusKey = "on_duty" | "off_duty" | "resting";
export type ScenarioIdKey = "black_friday_rush" | "ransomware_infiltration" | "chaos_engineering_drill";
// scenarios whose name is translated but whose briefing text still comes from the backend catalog
export type ExtraScenarioIdKey = "ddos_global" | "deployment_rollback" | "third_party_outage";
export type InfrastructureNodeTypeKey = "redis_cache" | "kafka_queue" | "db_read_replica" | "nginx_lb";
export type TutorialStepId =
  | "welcome"
  | "rack"
  | "card"
  | "acknowledge"
  | "investigate"
  | "findCause"
  | "runbooks"
  | "mitigate"
  | "recap"
  | "governance";
export type TutorialCauseKey = "deploy_regression" | "capacity_saturation" | "dependency_fault" | "acute_defect";

export interface Translations {
  flow: FlowStrings;
  auditorChat: AuditorChatCopy;
  gameplayModals: GameplayModalsCopy;
  hud: HudCopy;
  officeLife: OfficeLifeCopy;
  uiGaps: UiGapsCopy;
  common: {
    close: string;
    none: string;
    target: string;
    day: string;
    collapseDock: string;
    expandDock: string;
    more: string;
  };
  status: Record<ServiceStatusKey, string>;
  severities: Record<IncidentSeverityKey, string>;
  topbar: {
    tagline: string;
    live: string;
    reconnecting: string;
    slaShield: string;
    runway: string;
    techDebt: string;
    morale: string;
    pause: string;
    resume: string;
    pausedBadge: string;
    newGame: string;
    help: string;
    settings: string;
  };
  office: {
    serverRoom: string;
    engineeringFloor: string;
    boardroom: string;
    breakroom: string;
    auditSummary: (clean: number, flagged: number) => string;
    moraleSummary: (pct: number) => string;
    centerOnCrisis: string;
    focusService: string;
  };
  officeCore: {
    radarLabel: string;
    crisis: string;
    jumpToCrisis: string;
    radar: string;
    expandRadar: string;
    collapseRadar: string;
    legendOk: string;
    legendFault: string;
    clickToNavigate: string;
    viewport: string;
    zoneDataCenter: string;
    zoneWarRoom: string;
    zoneBoardroom: string;
    zoneBreakroom: string;
    signDataCenter: string;
    signWarRoom: string;
    signBoardroom: string;
    signBreakroom: string;
    signReception: string;
    featureFreezeTitle: string;
    featureFreezeDetail: string;
    waveform: string;
    nodeLabel: (name: string, status: string) => string;
    engineerLabel: (name: string, status: string) => string;
    cameraHint: string;
    resetView: string;
  };
  nodeInspector: {
    status: string;
    tier: string;
    latency: string;
    errorRate: string;
    upstream: string;
  };
  incidents: {
    header: string;
    openCount: (count: number) => string;
    allNominal: string;
    mtta: string;
    mttr: string;
    sanctionCountdown: (ticks: number) => string;
    acknowledge: string;
    investigate: string;
    activeFor: (ticks: number) => string;
    impactTier: { critical: string; standard: string };
    dependentsAffected: (count: number) => string;
    statusPill: {
      new: string;
      acknowledged: string;
      investigating: string;
      mitigating: string;
      resolved: string;
    };
  };
  mitigations: {
    header: string;
    targetLabel: (serviceId: string) => string;
    categories: Record<MitigationCategoryKey, string>;
    actions: Record<MitigationActionId, { name: string; description: string }>;
    impact: Record<MitigationActionId, string>;
    tdiSuffix: string;
    rejected: string;
    selectServiceHint: string;
    affectedServicesLabel: string;
    highRisk: string;
    readyIn: (ticks: number) => string;
    blocked: { budget: string; cooldown: string; featureFreeze: string; noIncident: string; providerOutage: string };
  };
  ledger: {
    header: string;
    noActivity: string;
    postmortemUnavailable: string;
    cleanFlagged: (clean: number, flagged: number) => string;
    generatePostmortem: string;
  };
  postMortem: {
    title: (incidentId: string) => string;
    exportPdf: string;
  };
  incidentDetail: {
    incidentId: string;
    affectedService: string;
    rootCause: string;
    status: string;
    createdTick: string;
    acknowledgedTick: string;
    whatsHappening: string;
    impactHeader: string;
    actionsHeader: string;
    symptoms: string;
    rootCausePending: string;
    quickMitigate: string;
    backToIncident: string;
  };
  liquidation: {
    eyebrow: string;
    title: string;
    reference: (day: number) => string;
    salutation: string;
    body: string;
    ticksSurvived: string;
    finalSla: string;
    finalTechDebt: string;
    footer: string;
    button: string;
    stamp: string;
    finalReputation: string;
    objectivesHeader: string;
    achievementsHeader: string;
    incidentsHeader: string;
    chooseScenario: string;
  };
  victory: {
    eyebrow: string;
    title: string;
    reference: (day: number) => string;
    salutation: string;
    body: string;
    ticksSurvived: string;
    finalSla: string;
    runwayLeft: string;
    footer: string;
    button: string;
    finalTechDebt: string;
    finalReputation: string;
    objectivesHeader: string;
    achievementsHeader: string;
    incidentsHeader: string;
    chooseScenario: string;
  };
  language: {
    en: string;
    ptBR: string;
    es: string;
  };
  floatingTexts: {
    criticalThreat: string;
    threatDetected: string;
    nodeRestored: (serviceId: string) => string;
    slaWarning: string;
    preAlertWarning: (serviceId: string, ticksRemaining: number) => string;
    fineApplied: (amount: string) => string;
    slaSanction: string;
    cycleSurvived: string;
    techDebtImproved: (amount: number) => string;
    techDebtWorsened: (amount: number) => string;
    budgetGain: (amount: string) => string;
    budgetLoss: (amount: string) => string;
    moraleGain: (amount: number) => string;
    moraleLoss: (amount: number) => string;
    reputationGain: (amount: number) => string;
    reputationLoss: (amount: number) => string;
    actionFailed: string;
    mitigationSuccess: string;
    mitigationMismatch: string;
    auditorFineApplied: (amount: string) => string;
    auditorCreditApplied: (amount: string) => string;
    featureFreezeEngaged: string;
    featureFreezeLifted: string;
    rootCauseIdentified: string;
  };
  workerQuips: {
    idle: string[];
    panic: string[];
    tired: string[];
    happy: string[];
  };
  defcon: {
    label: string;
    level5: string;
    level4: string;
    level3: string;
    level2: string;
    level1: string;
  };
  upgrades: {
    header: string;
    categories: Record<UpgradeCategoryKey, string>;
    actions: Record<UpgradeActionId, { name: string; description: string }>;
    purchase: string;
    owned: string;
    prerequisiteLocked: (upgradeName: string) => string;
    insufficientBudget: string;
  };
  errorBudget: {
    label: string;
    remaining: (pct: number) => string;
    featureFreezeActive: string;
  };
  cabDilemma: {
    modalTitle: string;
    timeRemaining: (seconds: number) => string;
    choiceImpact: { budget: string; techDebt: string; morale: string; reputation: string };
  };
  staff: {
    header: string;
    competencies: Record<CompetencyKey, string>;
    onCallStatus: Record<OnCallStatusKey, string>;
    rotateShift: string;
    hireEngineer: string;
    insufficientStamina: string;
    hiringCost: (amount: string) => string;
    stress: string;
    stamina: string;
  };
  scenarios: {
    header: string;
    names: Record<ScenarioIdKey | ExtraScenarioIdKey, string>;
    descriptions: Record<ScenarioIdKey, string>;
    victoryRequirements: Record<ScenarioIdKey, string>;
    sandbox: string;
    sandboxDescription: string;
    sandboxVictoryRequirement: string;
    durationTicks: (ticks: number) => string;
    unlimitedDuration: string;
    selectModeTitle: string;
    selectModeSubtitle: string;
    launch: string;
    start: string;
    active: (elapsed: number, duration: number) => string;
    victory: string;
    defeat: string;
    briefingContext: string;
    briefingObjectives: string;
    briefingBegin: string;
    specialConditions: string;
    objectives: string;
    locked: string;
    unlockCondition: (cond: string) => string;
    personalBest: (sla: number, days: number, diff: string) => string;
    noPersonalBest: string;
  };
  difficulty: {
    label: string;
    intern: string;
    internDescription: string;
    standard: string;
    standardDescription: string;
    chaos: string;
    chaosDescription: string;
    budgetDim: string;
    incidentRateDim: string;
    cascadeDim: string;
  };
  governance: {
    reputationLabel: string;
    reputationTooltip: string;
  };
  onboarding: {
    offerTitle: string;
    offerBody: string;
    offerStart: string;
    offerSkip: string;
    reopenTitle: string;
  };
  tutorial: {
    dialogLabel: string;
    stepLabel: (current: number, total: number) => string;
    next: string;
    back: string;
    finish: string;
    skipStep: string;
    leave: string;
    pausedNotice: string;
    waitingFor: (action: string) => string;
    done: string;
    alreadyDone: string;
    preparing: string;
    mismatchHint: (runbook: string, percent: number, best: string) => string;
    steps: Record<TutorialStepId, { title: string; body: string; action?: string; alt?: string }>;
    recap: { mtta: string; mttr: string; spent: string; notMeasured: string };
    cheatSheet: {
      title: string;
      intro: string;
      runbookHeader: string;
      causes: Record<TutorialCauseKey, string>;
      legendFull: string;
      legendPartial: string;
      tip: string;
    };
  };
  settings: {
    title: string;
    audioSection: string;
    sfxVolume: string;
    muteAll: string;
    musicSection: string;
    muteMusic: string;
    accessibilitySection: string;
    highContrast: string;
    colorblindSafe: string;
    languageSection: string;
    close: string;
  };
  titleScreen: {
    tagline: string;
    pillars: string[];
    continue: string;
    newGame: string;
    hallOfFame: string;
    settings: string;
    credits: string;
    footer: string;
  };
  credits: {
    body: string;
    builtWith: string;
  };
  hallOfFame: {
    empty: string;
    sandbox: string;
    daysSurvived: (days: number) => string;
    myRecords: string;
    global: string;
    anonymousPlayer: (shortId: string) => string;
    title: string;
    recentRuns: string;
    rankings: string;
    allScenarios: string;
    filterScenario: string;
    operatorRank: (rank: string) => string;
    lifetimePrestige: (pts: number) => string;
    totalRuns: (count: number) => string;
    incidentsHandled: (resolved: number, total: number) => string;
    noObjectives: string;
    date: string;
    outcomeLabel: string;
    techDebtRepLabel: string;
    incidentsLabel: string;
    recordedAtLabel: string;
    objectivesSnapshot: string;
    resolvedOfTotal: (resolved: number, total: number) => string;
  };
  debrief: {
    titleVictory: string;
    titleLiquidation: string;
    titleDefeat: string;
    subtitleVictory: string;
    subtitleLiquidation: string;
    subtitleDefeat: string;
    runSummary: string;
    survivalDuration: string;
    finalSla: string;
    remainingBudget: string;
    techDebt: string;
    reputation: string;
    incidentsResolved: string;
    scenarioObjectives: string;
    allObjectivesMet: string;
    objectivesFailed: string;
    careerProgression: string;
    prestigeEarned: (pts: number) => string;
    achievementsUnlocked: string;
    noAchievements: string;
    comparisonHeader: string;
    firstRunRecord: string;
    newPersonalBest: string;
    betterThanBest: (metric: string, delta: string) => string;
    belowBest: (metric: string, delta: string) => string;
    matchedBest: (metric: string) => string;
    nextChallengeHeader: string;
    playAgain: string;
    increaseDifficulty: string;
    selectAnotherScenario: string;
    viewCareerRecord: string;
    targetGoal: (goal: string) => string;
    auditGrade: string;
    acceptChallenge: string;
    totalRunsLabel: string;
    victoriesLabel: string;
    lifetimePrestigeLabel: string;
    achievementsUnlockedCount: (count: number, total: number) => string;
    completedCount: (done: number, total: number) => string;
    slaVsPriorBest: string;
    survivalVsPriorBest: string;
    priorOutcome: string;
    stampBreached: string;
    stampLiquidated: string;
  };
  newsTicker: {
    label: string;
    flavorLines: string[];
    eventHeadlines: Record<string, string>;
    eventConsequence: Record<string, string>;
    moreEvents: (count: number) => string;
  };
  objectiveHints: {
    acknowledgeIncident: string;
    hireEngineer: string;
    buyUpgrade: string;
    tryBuildMode: string;
    earnAchievement: string;
  };
  // compact, always-on tracker for this scenario's REAL backend-computed objectives -- distinct
  // from objectiveHints above (a single client-derived "what to try next" nudge for new players)
  objectiveTracker: {
    header: string;
    done: string;
    pending: string;
  };
  resolutionSummary: {
    header: (serviceId: string) => string;
    mtta: (ticks: number) => string;
    mttr: (ticks: number) => string;
    cost: (amount: string) => string;
    costUnknown: string;
    techDebt: (delta: number) => string;
    viewPostmortem: string;
  };
  incidentReplay: {
    openButton: string;
    title: (incidentId: string) => string;
    empty: string;
    play: string;
    pause: string;
  };
  buildMode: {
    toggle: string;
    catalog: Record<InfrastructureNodeTypeKey, { name: string; description: string }>;
    selectTargetHint: string;
    selectProducerHint: string;
    placed: string;
    placementFailed: string;
  };
  logTriage: {
    title: string;
    investigateLogs: string;
    alreadySolved: string;
    rootCauseConfirmed: string;
    rewardEarned: string;
    incorrectLine: string;
  };
  achievements: {
    header: string;
    unlockedToast: string;
    prestigePoints: string;
    owned: string;
    insufficientPrestige: string;
  };
  liveOps: {
    title: string;
    subtitle: string;
    activeAlerts: string;
    complianceWaterfall: string;
  };
  scenarioBuilder: {
    openBuilder: string;
    title: string;
    durationTicks: string;
    hazardMultiplier: string;
    budgetFloor: string;
    chaosInjections: string;
    addInjection: string;
    exportCode: string;
    importCode: string;
    importPlaceholder: string;
    importSuccess: string;
    importFailed: string;
    testScenario: string;
    testFailed: string;
  };
}

const en: Translations = {
  flow: flowEn,
  auditorChat: auditorChatEn,
  gameplayModals: gameplayModalsEn,
  hud: hudEn,
  officeLife: officeLifeEn,
  uiGaps: uiGapsEn,
  common: { close: "Close", none: "none", target: "Target", day: "Day", collapseDock: "Collapse dock", expandDock: "Expand dock", more: "More" },
  status: { healthy: "Healthy", degraded: "Degraded", down: "Down" },
  severities: {
    P1_CRITICAL: "P1 Critical",
    P2_HIGH: "P2 High",
    P3_MEDIUM: "P3 Medium",
    P4_LOW: "P4 Low",
  },
  topbar: {
    tagline: "Office Operations",
    live: "Live",
    reconnecting: "Reconnecting",
    slaShield: "SLA Shield",
    runway: "Runway",
    techDebt: "Tech Debt",
    morale: "Morale",
    pause: "Pause simulation",
    resume: "Resume simulation",
    pausedBadge: "PAUSED",
    newGame: "New Game",
    help: "Help & Tutorial",
    settings: "Settings",
  },
  office: {
    serverRoom: "SERVER ROOM",
    engineeringFloor: "ENGINEERING FLOOR",
    boardroom: "BOARDROOM",
    breakroom: "BREAKROOM",
    auditSummary: (clean, flagged) => `${clean} clean / ${flagged} flagged`,
    moraleSummary: (pct) => `morale ${pct.toFixed(0)}%`,
    centerOnCrisis: "Center on Crisis",
    focusService: "Focus Rack",
  },
  officeCore: {
    radarLabel: "Tactical mini-map",
    crisis: "CRISIS",
    jumpToCrisis: "Jump to the failing rack",
    radar: "RADAR",
    expandRadar: "Expand radar",
    collapseRadar: "Collapse radar",
    legendOk: "OK",
    legendFault: "FAULT",
    clickToNavigate: "CLICK OR DRAG TO NAVIGATE",
    viewport: "Current view",
    zoneDataCenter: "DATA CENTER",
    zoneWarRoom: "WAR ROOM",
    zoneBoardroom: "BOARDROOM",
    zoneBreakroom: "BREAKROOM",
    signDataCenter: "// DATA CENTER · TIER-1 VAULT",
    signWarRoom: "// SRE WAR ROOM · INCIDENT COMMAND",
    signBoardroom: "// CAB BOARDROOM · EXECUTIVE SUITE",
    signBreakroom: "// RECHARGE LOUNGE & BREAKROOM",
    signReception: "// RECEPTION & LOBBY",
    featureFreezeTitle: "Feature Freeze Active",
    featureFreezeDetail: "Deployments suspended until the error budget recovers",
    waveform: "Telemetry waveform",
    nodeLabel: (name, status) => `${name}, ${status}`,
    engineerLabel: (name, status) => `${name} (${status})`,
    cameraHint: "Arrows pan, + and - zoom, Home resets the view",
    resetView: "Reset view",
  },
  nodeInspector: {
    status: "Status",
    tier: "Tier",
    latency: "Latency",
    errorRate: "Error Rate",
    upstream: "Upstream",
  },
  incidents: {
    header: "Active Incidents",
    openCount: (count) => `${count} open`,
    allNominal: "All systems nominal",
    mtta: "MTTA",
    mttr: "MTTR",
    sanctionCountdown: (ticks) => `T-${ticks}`,
    acknowledge: "Acknowledge",
    investigate: "Investigate",
    activeFor: (ticks) => `active ${ticks}t`,
    impactTier: { critical: "Critical service", standard: "Standard service" },
    dependentsAffected: (count) => (count === 1 ? "1 dependent service" : `${count} dependent services`),
    statusPill: {
      new: "New",
      acknowledged: "Acknowledged",
      investigating: "Investigating",
      mitigating: "Mitigating",
      resolved: "Resolved",
    },
  },
  mitigations: {
    header: "Operational Directives",
    targetLabel: (serviceId) => `target: ${serviceId}`,
    categories: {
      deployment: "Deployment",
      compute: "Compute",
      resilience: "Resilience",
      emergency: "Emergency Hotfix",
    },
    actions: {
      rollback: { name: "Rollback Canary", description: "Revert to last stable build." },
      scale_replicas: { name: "Spin Replicas", description: "Add 4 compute pods." },
      circuit_breaker: { name: "Circuit Breaker", description: "Shed non-critical traffic." },
      emergency_patch: { name: "Hotfix Live", description: "Direct prod hotfix." },
    },
    impact: {
      rollback: "Steady resolution, no speed bonus",
      scale_replicas: "Absorbs load, moderate speed-up",
      circuit_breaker: "Fast relief for the affected service",
      emergency_patch: "Fastest fix, highest long-term cost",
    },
    tdiSuffix: "TDI",
    rejected: "ACTION REJECTED: BUDGET TOO LOW",
    selectServiceHint: "Select an affected service to compare mitigations.",
    affectedServicesLabel: "Affected services",
    highRisk: "High risk",
    readyIn: (ticks) => `ready in ${ticks}t`,
    blocked: {
      budget: "Insufficient runway",
      cooldown: "Still on cooldown",
      featureFreeze: "Locked by feature freeze",
      noIncident: "No open incident on this service",
      providerOutage: "Provider outage: wait for recovery",
    },
  },
  ledger: {
    header: "Compliance Ledger",
    noActivity: "No ledger activity yet",
    postmortemUnavailable: "LEDGER RECORD UNAVAILABLE",
    cleanFlagged: (clean, flagged) => `${clean} clean / ${flagged} flagged`,
    generatePostmortem: "Generate Post-Mortem",
  },
  postMortem: {
    title: (incidentId) => `Post-Mortem Report :: ${incidentId}`,
    exportPdf: "Export Official PDF",
  },
  incidentDetail: {
    incidentId: "Incident ID",
    affectedService: "Affected Service",
    rootCause: "Root Cause",
    status: "Status",
    createdTick: "Created Tick",
    acknowledgedTick: "Acknowledged Tick",
    whatsHappening: "What's happening",
    impactHeader: "What's the impact",
    actionsHeader: "What can I do now",
    symptoms: "Symptoms",
    rootCausePending: "Root cause not yet confirmed — investigate the logs to identify it.",
    quickMitigate: "Quick mitigation",
    backToIncident: "Back to incident",
  },
  liquidation: {
    eyebrow: "IncidentZero Corp. · Board of Directors",
    title: "Notice of Termination",
    reference: (day) => `Reference: Operational Bankruptcy Review, Day ${day}`,
    salutation: "To the Head of Infrastructure,",
    body: "Effective immediately, the Board of Directors has resolved to terminate current operational command. The company's runway credits have been fully exhausted, leaving no remaining capital to sustain infrastructure operations.",
    ticksSurvived: "Ticks Survived",
    finalSla: "Final SLA",
    finalTechDebt: "Final Tech Debt",
    footer: "This decision is final and effective as of the close of business. We thank you for your service.",
    button: "Reapply for the Position",
    stamp: "TERMINATED",
    finalReputation: "Final Reputation",
    objectivesHeader: "Objectives",
    achievementsHeader: "Achievements Unlocked",
    incidentsHeader: "Recent Incidents",
    chooseScenario: "Choose a Scenario",
  },
  victory: {
    eyebrow: "IncidentZero Corp. · External Audit Office",
    title: "Certificate of Compliance",
    reference: (day) => `Reference: Monthly SLA Audit Cycle, Day ${day}`,
    salutation: "To the Head of Infrastructure,",
    body: "This letter certifies that IncidentZero Corp. has successfully completed a full audit cycle while maintaining service availability above the regulatory breach threshold. The Board approves your continued tenure.",
    ticksSurvived: "Ticks Survived",
    finalSla: "Final SLA",
    runwayLeft: "Runway Left",
    footer: "Certified and filed with the compliance ledger.",
    button: "Begin Next Audit Cycle",
    finalTechDebt: "Final Tech Debt",
    finalReputation: "Final Reputation",
    objectivesHeader: "Objectives",
    achievementsHeader: "Achievements Unlocked",
    incidentsHeader: "Recent Incidents",
    chooseScenario: "Choose a Scenario",
  },
  language: { en: "English", ptBR: "Português (BR)", es: "Español" },
  floatingTexts: {
    criticalThreat: "CRITICAL THREAT DETECTED",
    threatDetected: "THREAT DETECTED",
    nodeRestored: (serviceId) => `NODE RESTORED: ${serviceId}`,
    slaWarning: "SLA WARNING: AUDIT SANCTIONS ACTIVE",
    preAlertWarning: (serviceId, ticksRemaining) => `INCOMING FAILURE: ${serviceId} (T-${ticksRemaining})`,
    fineApplied: (amount) => `-$${amount} :: REGULATORY FINE`,
    slaSanction: "SLA SANCTION APPLIED",
    cycleSurvived: "AUDIT CYCLE SURVIVED",
    techDebtImproved: (amount) => `-${amount} TDI`,
    techDebtWorsened: (amount) => `+${amount} TDI`,
    budgetGain: (amount) => `+$${amount}`,
    budgetLoss: (amount) => `-$${amount}`,
    moraleGain: (amount) => `+${amount} MORALE`,
    moraleLoss: (amount) => `-${amount} MORALE`,
    reputationGain: (amount) => `+${amount} REPUTATION`,
    reputationLoss: (amount) => `-${amount} REPUTATION`,
    actionFailed: "ACTION FAILED — TRY AGAIN",
    mitigationSuccess: "MITIGATION SUCCESSFUL",
    mitigationMismatch: "MITIGATION MISMATCHED — ROOT CAUSE PERSISTS",
    auditorFineApplied: (amount) => `-$${amount} :: AUDITOR FINE`,
    auditorCreditApplied: (amount) => `+$${amount} :: AUDITOR CREDIT`,
    featureFreezeEngaged: "FEATURE FREEZE: Error budget exhausted",
    featureFreezeLifted: "FEATURE FREEZE LIFTED: Error budget restored",
    rootCauseIdentified: "ROOT CAUSE IDENTIFIED: Mitigation cost halved",
  },
  upgrades: {
    header: "Upgrades",
    categories: {
      observability: "Observability",
      resilience: "Resilience",
      facility: "Facility & Ergonomics",
    },
    actions: {
      apm_tracing: {
        name: "APM Distributed Tracing",
        description: "Reduces effective MTTA by 2 ticks for regulatory breach evaluation.",
      },
      predictive_anomaly_detection: {
        name: "Predictive Anomaly Detection",
        description: "Warns of an incoming failure 5 ticks before it materializes.",
      },
      multi_az_clusters: {
        name: "Multi-AZ Compute Clusters",
        description: "Reduces cascading failure hazard by 40%.",
      },
      automated_cicd: {
        name: "Automated CI/CD Pipelines",
        description: "Halves the cost and technical debt penalty of the Rollback runbook.",
      },
      espresso_machine: {
        name: "Commercial Espresso Machine",
        description: "Slows morale decline by 25%.",
      },
      ergonomic_chairs: {
        name: "Ergonomic Herman Miller Chairs",
        description: "Reduces on-call engineer fatigue accumulation by 20%.",
      },
    },
    purchase: "Purchase",
    owned: "Owned",
    prerequisiteLocked: (upgradeName) => `Requires: ${upgradeName}`,
    insufficientBudget: "Insufficient budget runway",
  },
  errorBudget: {
    label: "Error Budget",
    remaining: (pct) => `${pct.toFixed(1)}% remaining`,
    featureFreezeActive: "FEATURE FREEZE ACTIVE",
  },
  cabDilemma: {
    modalTitle: "Change Advisory Board — Decision Required",
    timeRemaining: (seconds) => `${seconds}s to decide`,
    choiceImpact: { budget: "Runway", techDebt: "Tech Debt", morale: "Morale", reputation: "Reputation" },
  },
  staff: {
    header: "Roster",
    competencies: { auth: "Identity & Auth", payments: "Payments", gateway: "Gateway", db: "Database" },
    onCallStatus: { on_duty: "On Duty", off_duty: "Off Duty", resting: "Resting" },
    rotateShift: "Rotate Shift",
    hireEngineer: "Hire Engineer",
    insufficientStamina: "Stamina too low to return to duty",
    hiringCost: (amount) => `Signing cost: ${amount}`,
    stress: "Stress",
    stamina: "Stamina",
  },
  scenarios: {
    header: "Scenarios",
    names: {
      black_friday_rush: "Black Friday Rush",
      ransomware_infiltration: "Ransomware Infiltration",
      chaos_engineering_drill: "Chaos Engineering Drill",
      ddos_global: "DDoS Global Attack",
      deployment_rollback: "Deployment Rollback Emergency",
      third_party_outage: "Third-Party Provider Outage",
    },
    descriptions: {
      black_friday_rush: "A 48-tick, 4x traffic surge hits every service at once. Cloud burn accelerates and only capacity-scaling runbooks are permitted against the strain.",
      ransomware_infiltration: "Malware pivots from the Notification Dispatcher, spreading node-by-node along the dependency graph. Quarantine infected services with Circuit Breakers before it reaches the master database.",
      chaos_engineering_drill: "An automated chaos monkey randomly terminates healthy pods for 40 ticks straight, independent of technical debt. Pure resilience, no mercy.",
    },
    victoryRequirements: {
      black_friday_rush: "Maintain SLA above the regulatory threshold for the full 48-tick surge window.",
      ransomware_infiltration: "Prevent the Payment Gateway Core from being fully encrypted before the 60-tick window ends.",
      chaos_engineering_drill: "Finish the 40-tick drill with zero regulatory breach flags on the compliance ledger.",
    },
    sandbox: "Sandbox Mode",
    sandboxDescription: "The default, unscripted simulation. No time limit, no special rules — just the org chart and whatever the hazard model throws at you.",
    sandboxVictoryRequirement: "Survive a full 720-tick monthly audit cycle with SLA at or above the regulatory threshold.",
    durationTicks: (ticks) => `${ticks} ticks`,
    unlimitedDuration: "No time limit",
    selectModeTitle: "Select Game Mode",
    selectModeSubtitle: "Choose a challenge scenario or start the open-ended sandbox simulation.",
    launch: "Launch",
    start: "Start Scenario",
    active: (elapsed, duration) => `Tick ${elapsed} / ${duration}`,
    victory: "Scenario Complete",
    defeat: "Scenario Failed",
    briefingContext: "Briefing",
    briefingObjectives: "Objectives",
    briefingBegin: "Begin",
    specialConditions: "Special Conditions",
    objectives: "Core Objectives",
    locked: "Locked",
    unlockCondition: (cond) => `Unlock condition: ${cond}`,
    personalBest: (sla, days, diff) => `Personal Best: ${sla.toFixed(2)}% SLA · ${days}d · ${diff}`,
    noPersonalBest: "No prior run recorded yet",
  },
  difficulty: {
    label: "Difficulty",
    intern: "Intern",
    internDescription: "Starting runway $320k (+28%), 0.7x incident rate (-30%). Forgiving operational environment for learning runbooks.",
    standard: "Standard",
    standardDescription: "Starting runway $250k (Baseline), 1.0x incident rate. The canonical enterprise crisis simulation experience.",
    chaos: "Chaos",
    chaosDescription: "Starting runway $180k (-28%), 1.4x incident rate (+40%). High cascading failure probability and strict cost limits.",
    budgetDim: "Starting Capital",
    incidentRateDim: "Incident Frequency",
    cascadeDim: "Cascade Severity",
  },
  governance: {
    reputationLabel: "Board Reputation",
    reputationTooltip: "Shaped by your CAB dilemma choices. Falling too low invites board scrutiny (and worse incident luck); staying high buys goodwill.",
  },
  onboarding: {
    offerTitle: "First time here?",
    offerBody: "Take a 2-minute guided tour with a practice incident, or jump straight in. You can replay it any time from the help button.",
    offerStart: "Do the tutorial",
    offerSkip: "Skip",
    reopenTitle: "Replay the tutorial",
  },
  tutorial: {
    dialogLabel: "Guided tutorial",
    stepLabel: (current, total) => `Step ${current} of ${total}`,
    next: "Next",
    back: "Back",
    finish: "Finish",
    skipStep: "Skip step",
    leave: "Leave tutorial",
    pausedNotice: "Simulation paused during the tutorial",
    waitingFor: (action) => `Waiting for you: ${action}`,
    done: "Done!",
    alreadyDone: "Already done, continuing…",
    preparing: "Preparing a practice incident…",
    mismatchHint: (runbook, percent, best) =>
      `${runbook} only fixes this cause ${percent}%. Match the runbook to the cause: try ${best}.`,
    steps: {
      welcome: {
        title: "Welcome, Head of Infrastructure",
        body: "You keep five services online, the books balanced and the board calm. Two minutes, one practice incident: spot it, acknowledge it, find the cause, fix it. The clock stays paused while you learn.",
      },
      rack: {
        title: "Your infrastructure",
        body: "Each rack is a live service. This one just raised an alert: see it pulse? Click any rack later to inspect its health.",
        alt: "We could not create a practice incident. When a real alert fires, its rack pulses like the ones on this floor. Press Next to jump to governance.",
      },
      card: {
        title: "The incident card",
        body: "Every alert lands in the dock: severity, affected service and the regulatory fine countdown.",
      },
      acknowledge: {
        title: "Acknowledge it",
        body: "Acknowledging stops the fine countdown and the alert fatigue. Click Acknowledge on the highlighted card.",
        action: "click Acknowledge",
      },
      investigate: {
        title: "Open the logs",
        body: "Do not guess the cause. Open the log terminal from the card.",
        action: "click Investigate",
      },
      findCause: {
        title: "Find the root cause",
        body: "Read the logs and click the line that explains the failure: the memory leak in the connection pool. Confirming it cuts cost and recovery time.",
        alt: "Read the logs and click the line that explains the failure. Confirming the cause cuts mitigation cost and recovery time.",
        action: "click the root-cause log line",
      },
      runbooks: {
        title: "Your runbooks",
        body: "Four runbooks, and each one fixes some causes better than others. Cost, tech debt and cooldown are on every card. The affected service is already selected.",
      },
      mitigate: {
        title: "Apply the fix",
        body: "A bad deploy is fixed by a rollback: 100% effective on that cause. Click Rollback.",
        action: "click Rollback",
      },
      recap: {
        title: "Incident closed",
        body: "Service restored. That is the whole loop: acknowledge, investigate, fix. Here is what it cost you.",
        alt: "The incident is still open. When you finish the tutorial, close it with a Rollback.",
      },
      governance: {
        title: "Keep the SLA alive",
        body: "The shield is your SLA and the meter is your error budget. Burn the budget and a feature freeze locks risky runbooks; drop below the SLA and regulators fine you. Keep both healthy through the monthly audit.",
      },
    },
    recap: { mtta: "Time to acknowledge", mttr: "Time to recover", spent: "Money spent", notMeasured: "n/a" },
    cheatSheet: {
      title: "Runbook cheat sheet",
      intro: "How well each runbook fixes each cause. 70% or more fully resolves the incident; less leaves it open and adds tech debt.",
      runbookHeader: "Runbook",
      causes: {
        deploy_regression: "Bad deploy",
        capacity_saturation: "Saturated capacity",
        dependency_fault: "Failing dependency",
        acute_defect: "Code bug",
      },
      legendFull: "Fully resolves (70%+)",
      legendPartial: "Partial: the incident stays open",
      tip: "Read the logs first: confirming the root cause tells you which column you are in.",
    },
  },
  settings: {
    title: "Settings",
    audioSection: "Audio",
    sfxVolume: "SFX Volume",
    muteAll: "Mute All Sound",
    musicSection: "Music",
    muteMusic: "Mute Music",
    accessibilitySection: "Accessibility",
    highContrast: "High Contrast",
    colorblindSafe: "Colorblind-Safe Palette",
    languageSection: "Language",
    close: "Close",
  },
  titleScreen: {
    tagline: "SRE Crisis Management, Gamified",
    pillars: ["Incidents", "Infrastructure", "Decisions", "Tech Debt", "Runway", "Roster", "Consequences"],
    continue: "Continue",
    newGame: "New Game / Select Mode",
    hallOfFame: "Hall of Fame",
    settings: "Settings",
    credits: "Credits",
    footer: "A tycoon simulation of SRE crisis management and IT governance.",
  },
  credits: {
    body: "Every incident, formula and audit control in this simulation was designed to mirror real SRE and IT governance practice — SLA math, error budgets, cascading failure models and all.",
    builtWith: "Built with FastAPI, React, Zustand and pure SVG — no external game engine.",
  },
  hallOfFame: {
    empty: "No concluded runs yet. Survive or go bankrupt to earn your first entry.",
    sandbox: "Sandbox",
    daysSurvived: (days) => `${days} days survived`,
    myRecords: "My Records",
    global: "Global",
    anonymousPlayer: (shortId) => `Operator #${shortId}`,
    title: "Career History & Hall of Fame",
    recentRuns: "Recent Runs",
    rankings: "Leaderboards",
    allScenarios: "All Scenarios",
    filterScenario: "Filter by Scenario",
    operatorRank: (rank) => `Rank: ${rank}`,
    lifetimePrestige: (pts) => `${pts} Lifetime Prestige`,
    totalRuns: (count) => `${count} Runs Recorded`,
    incidentsHandled: (resolved, total) => `${resolved}/${total} incidents resolved`,
    noObjectives: "Standard sandbox rules",
    date: "Date",
    outcomeLabel: "Outcome",
    techDebtRepLabel: "Tech Debt / Rep",
    incidentsLabel: "Incidents",
    recordedAtLabel: "Recorded At",
    objectivesSnapshot: "Objectives Snapshot",
    resolvedOfTotal: (resolved, total) => `${resolved} / ${total} resolved`,
  },
  debrief: {
    titleVictory: "AUDIT CYCLE CERTIFIED",
    titleLiquidation: "BOARD LIQUIDATION ORDER",
    titleDefeat: "SCENARIO CONTAINMENT BREACHED",
    subtitleVictory: "Official Notice of Full Regulatory Compliance & Production Stability",
    subtitleLiquidation: "Official Notice of Immediate Corporate Insolvency & Asset Foreclosure",
    subtitleDefeat: "Critical Security Incident Escalation & Uncontained Cascading Failure",
    runSummary: "Operational Debrief",
    survivalDuration: "Survival Time",
    finalSla: "Cumulative SLA",
    remainingBudget: "Remaining Runway",
    techDebt: "Technical Debt Index",
    reputation: "Governance Reputation",
    incidentsResolved: "Incidents Resolved",
    scenarioObjectives: "Mission Objectives",
    allObjectivesMet: "All Scenario Objectives Successfully Completed",
    objectivesFailed: "Objectives Compromised",
    careerProgression: "Career Progression",
    prestigeEarned: (pts) => `+${pts} Prestige Points Earned`,
    achievementsUnlocked: "Achievements Unlocked This Run",
    noAchievements: "No new achievements unlocked during this run",
    comparisonHeader: "Personal Historical Benchmark",
    firstRunRecord: "First official career record established for this scenario & difficulty!",
    newPersonalBest: "NEW PERSONAL BEST!",
    betterThanBest: (metric, delta) => `${metric}: Improved by ${delta} vs personal best`,
    belowBest: (metric, delta) => `${metric}: ${delta} below personal best`,
    matchedBest: (metric) => `${metric}: Equal to personal best`,
    nextChallengeHeader: "Recommended Next Steps",
    playAgain: "Play Again (Same Setup)",
    increaseDifficulty: "Increase Difficulty",
    selectAnotherScenario: "Select Another Scenario",
    viewCareerRecord: "View Career History",
    targetGoal: (goal) => `Target Goal: ${goal}`,
    auditGrade: "Audit Grade",
    acceptChallenge: "Accept Challenge",
    totalRunsLabel: "Total Runs:",
    victoriesLabel: "Victories:",
    lifetimePrestigeLabel: "Lifetime Prestige:",
    achievementsUnlockedCount: (count, total) => `Achievements Unlocked: ${count}/${total}`,
    completedCount: (done, total) => `${done}/${total} Completed`,
    slaVsPriorBest: "SLA vs Prior Best",
    survivalVsPriorBest: "Survival vs Prior Best",
    priorOutcome: "Prior Outcome",
    stampBreached: "BREACHED",
    stampLiquidated: "LIQUIDATED",
  },
  newsTicker: {
    label: "IZ NEWS",
    flavorLines: [
      "Board of Directors praises Q3 uptime, demands more with less budget",
      "Anonymous source: breakroom espresso machine rumored for an upgrade",
      "Industry analysts: 'Nobody reads post-mortems, but everyone should'",
      "IncidentZero Corp. stock unaffected by yesterday's minor outage, allegedly",
    ],
    eventHeadlines: {
      INCIDENT_RAISED: "BREAKING: New service disruption reported on the floor",
      INCIDENT_ACKNOWLEDGED: "On-call engineer acknowledges alert, board relieved",
      RUNBOOK_EXECUTED: "Infrastructure team deploys emergency runbook",
      UPGRADE_PURCHASED: "Capital expenditure approved for infrastructure upgrade",
      ACHIEVEMENT_UNLOCKED: "Employee of the month nominee announced internally",
      DILEMMA_RESOLVED: "Change Advisory Board decision finalized",
      FEATURE_FREEZE_ENGAGED: "Engineering feature freeze declared amid error budget exhaustion",
      SLA_BREACH_EMERGENCY_SANCTION: "Regulators issue emergency sanction over SLA breach",
      BANKRUPTCY_LIQUIDATION: "Board of Directors announces immediate liquidation",
      MONTHLY_AUDIT_CYCLE_SURVIVED: "Company certified compliant after monthly audit",
      ENGINEER_HIRED: "New engineer joins the on-call roster",
      INFRASTRUCTURE_NODE_PLACED: "New hardware module installed in the server room",
      ROOT_CAUSE_IDENTIFIED: "Engineering praised for rapid root-cause diagnosis",
      COSMETIC_UNLOCKED: "Office decor budget approved for a cosmetic upgrade",
    },
    eventConsequence: {
      INCIDENT_RAISED: "A live incident is burning MTTA — acknowledge it before the fine clock starts.",
      SLA_BREACH_EMERGENCY_SANCTION: "SLA fell below the regulatory floor — expect a board review if this repeats.",
      BANKRUPTCY_LIQUIDATION: "Runway hit zero — this run is over.",
      FEATURE_FREEZE_ENGAGED: "Error budget is exhausted — risky runbooks are locked until tech debt comes down.",
    },
    moreEvents: (count) => `+${count} more`,
  },
  objectiveHints: {
    acknowledgeIncident: "An alert is waiting — acknowledge it before the fine clock starts.",
    hireEngineer: "Hire your first on-call engineer from the Roster tab.",
    buyUpgrade: "Your runway can afford your first upgrade — check the Upgrades tab.",
    tryBuildMode: "Try Build Mode: place your first infrastructure node in the server room.",
    earnAchievement: "Keep going — your first career achievement is within reach.",
  },
  objectiveTracker: {
    header: "Objectives",
    done: "Done",
    pending: "Pending",
  },
  resolutionSummary: {
    header: (serviceId) => `${serviceId} restored`,
    mtta: (ticks) => `MTTA ${ticks}t`,
    mttr: (ticks) => `MTTR ${ticks}t`,
    cost: (amount) => `Cost $${amount}`,
    costUnknown: "Cost unavailable",
    techDebt: (delta) => `TDI ${delta > 0 ? `+${delta}` : delta}`,
    viewPostmortem: "View postmortem",
  },
  incidentReplay: {
    openButton: "Replay",
    title: (incidentId) => `Incident Replay :: ${incidentId}`,
    empty: "No correlated ledger events found for this incident.",
    play: "Play",
    pause: "Pause",
  },
  buildMode: {
    toggle: "Build Mode",
    catalog: {
      redis_cache: { name: "Redis Cache Cluster", description: "Absorbs read spikes; reduces upstream latency by 45%." },
      kafka_queue: { name: "Kafka Message Queue", description: "Decouples services; prevents cascade failures between producer and consumer." },
      db_read_replica: { name: "Database Read Replica", description: "Divides database query load; reduces deadlock probability by 60%." },
      nginx_lb: { name: "NGINX Load Balancer", description: "Balances edge traffic across replicated compute nodes." },
    },
    selectTargetHint: "Click a server rack to target",
    selectProducerHint: "Now click the producer rack to decouple",
    placed: "Infrastructure node placed",
    placementFailed: "Placement failed: insufficient budget or invalid target",
  },
  logTriage: {
    title: "Root-Cause Log Triage",
    investigateLogs: "Investigate Logs",
    alreadySolved: "Root Cause Already Identified",
    rootCauseConfirmed: "ROOT CAUSE CONFIRMED",
    rewardEarned: "ROOT CAUSE FOUND: -50% mitigation cost, MTTR halved",
    incorrectLine: "NOT THE ROOT CAUSE — KEEP LOOKING",
  },
  achievements: {
    header: "Achievements",
    unlockedToast: "Achievement Unlocked",
    prestigePoints: "Prestige Points",
    owned: "Owned",
    insufficientPrestige: "Insufficient prestige points",
  },
  liveOps: {
    title: "Live Ops",
    subtitle: "Read-only spectator dashboard — safe for a second monitor",
    activeAlerts: "Active Alerts",
    complianceWaterfall: "Compliance Waterfall",
  },
  scenarioBuilder: {
    openBuilder: "Build Custom Scenario",
    title: "Chaos Sandbox Scenario Builder",
    durationTicks: "Duration (ticks)",
    hazardMultiplier: "Hazard Multiplier",
    budgetFloor: "Budget Floor ($)",
    chaosInjections: "Scheduled Chaos Injections",
    addInjection: "Add Injection",
    exportCode: "Copy Challenge Code",
    importCode: "Import",
    importPlaceholder: "Paste a challenge code…",
    importSuccess: "Scenario imported",
    importFailed: "Invalid challenge code",
    testScenario: "Test Scenario",
    testFailed: "Failed to load custom scenario",
  },
  workerQuips: {
    idle: ["Monitoring logs... nothing exploding for now.", "Just refilled my coffee. Send incidents responsibly."],
    panic: ["WHO DEPLOYED ON A FRIDAY?!", "HELP, THE DATABASE IS ON FIRE!", "I TOLD THEM TO ADD MORE REPLICAS!"],
    tired: ["One more hour on-call and I turn into a houseplant...", "Where's the coffee...? Zzz"],
    happy: ["Zero-bug deploy! Pinch me!", "SLA back to 99.9%, buying the team donuts."],
  },
  defcon: {
    label: "DEFCON",
    level5: "NOMINAL",
    level4: "ELEVATED",
    level3: "P1 ACTIVE",
    level2: "MULTIPLE P1s",
    level1: "IMMINENT COLLAPSE",
  },
};

// every key whose copy lives in its own per-namespace module; a locale assembles core + these four
export type NamespaceKey = "auditorChat" | "flow" | "gameplayModals" | "hud" | "officeLife" | "uiGaps";
// the locale modules type their inline dictionary against this, then assemble the full Translations
export type CoreTranslations = Omit<Translations, NamespaceKey>;

// English is bundled (fallback + tests); every other dictionary lives in its own lazy chunk and is
// registered by loadLanguage (see ./loadLanguage) before the UI switches to it
const loaded: Partial<Record<Language, Translations>> = { en };

export function registerTranslations(language: Language, dict: Translations): void {
  loaded[language] = dict;
}

export function isLanguageReady(language: Language): boolean {
  return language in loaded;
}

// a Record-shaped accessor: always resolves to a dictionary (english while a language is not yet
// loaded, which loadLanguage prevents from ever being visible)
export const TRANSLATIONS: Record<Language, Translations> = {
  en,
  get "pt-BR"() {
    return loaded["pt-BR"] ?? en;
  },
  get es() {
    return loaded.es ?? en;
  },
};
