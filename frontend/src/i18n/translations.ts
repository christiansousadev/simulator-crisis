import { Language } from "./language";

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
export type InfrastructureNodeTypeKey = "redis_cache" | "kafka_queue" | "db_read_replica" | "nginx_lb";

export interface Translations {
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
  };
  mitigations: {
    header: string;
    targetLabel: (serviceId: string) => string;
    categories: Record<MitigationCategoryKey, string>;
    actions: Record<MitigationActionId, { name: string; description: string }>;
    tdiSuffix: string;
    rejected: string;
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
    timeRemaining: (ticks: number) => string;
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
    names: Record<ScenarioIdKey, string>;
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
  };
  difficulty: {
    label: string;
    intern: string;
    internDescription: string;
    standard: string;
    standardDescription: string;
    chaos: string;
    chaosDescription: string;
  };
  governance: {
    reputationLabel: string;
    reputationTooltip: string;
  };
  onboarding: {
    stepLabel: (current: number, total: number) => string;
    skip: string;
    next: string;
    back: string;
    getStarted: string;
    reopenTitle: string;
    steps: {
      welcome: { title: string; body: string };
      topology: { title: string; body: string };
      crisis: { title: string; body: string };
      governance: { title: string; body: string };
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
  };
  newsTicker: {
    label: string;
    flavorLines: string[];
    eventHeadlines: Record<string, string>;
  };
  objectiveHints: {
    acknowledgeIncident: string;
    hireEngineer: string;
    buyUpgrade: string;
    tryBuildMode: string;
    earnAchievement: string;
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
    tdiSuffix: "TDI",
    rejected: "ACTION REJECTED: BUDGET TOO LOW",
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
  },
  language: { en: "English", ptBR: "Português (BR)", es: "Español" },
  floatingTexts: {
    criticalThreat: "CRITICAL THREAT DETECTED",
    threatDetected: "THREAT DETECTED",
    nodeRestored: (serviceId) => `NODE RESTORED: ${serviceId}`,
    slaWarning: "SLA WARNING: AUDIT SANCTIONS ACTIVE",
    preAlertWarning: (serviceId, ticksRemaining) => `INCOMING FAILURE: ${serviceId} (T-${ticksRemaining})`,
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
    timeRemaining: (ticks) => `${ticks} ticks to decide`,
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
  },
  difficulty: {
    label: "Difficulty",
    intern: "Intern",
    internDescription: "Bigger starting runway, fewer surprise failures. Learn the ropes without the pressure.",
    standard: "Standard",
    standardDescription: "The intended balance: real pressure, real trade-offs.",
    chaos: "Chaos",
    chaosDescription: "Tighter budget, a much higher hazard rate. For veterans of the war room only.",
  },
  governance: {
    reputationLabel: "Board Reputation",
    reputationTooltip: "Shaped by your CAB dilemma choices. Falling too low invites board scrutiny (and worse incident luck); staying high buys goodwill.",
  },
  onboarding: {
    stepLabel: (current, total) => `Step ${current} of ${total}`,
    skip: "Skip Tutorial",
    next: "Next",
    back: "Back",
    getStarted: "Get Started",
    reopenTitle: "Replay the tutorial",
    steps: {
      welcome: {
        title: "Welcome & Mission",
        body: "Welcome, Head of Infrastructure. IncidentZero Corp. has entrusted you with keeping five critical services online, the books balanced, and the board off your back. Every tick is one office hour — survive a full monthly audit cycle without going bankrupt or breaching your SLA.",
      },
      topology: {
        title: "Service Topology",
        body: "Your office floor mirrors your real infrastructure. Click any server rack or engineering desk to inspect its health, latency, and error rate in the diagnostics drawer. Watch the dependency chain closely — a failure upstream can cascade downstream.",
      },
      crisis: {
        title: "Crisis Management",
        body: "When an alert fires, the clock starts ticking. Acknowledge it fast — wait too long and alert fatigue drains morale, then regulators start fining you every tick until you respond. Pick a runbook wisely: a quick hotfix is cheap but piles on technical debt; a rollback costs more but keeps the platform healthy.",
      },
      governance: {
        title: "IT Governance",
        body: "Your Error Budget is your license to fail — burn through it and a Feature Freeze locks out risky runbooks until you pay down technical debt. Keep your SLA above the regulatory threshold for the full monthly cycle to pass the audit and win.",
      },
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
    tagline: "Office Operations Simulator",
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
  },
  objectiveHints: {
    acknowledgeIncident: "An alert is waiting — acknowledge it before the fine clock starts.",
    hireEngineer: "Hire your first on-call engineer from the Roster tab.",
    buyUpgrade: "Your runway can afford your first upgrade — check the Upgrades tab.",
    tryBuildMode: "Try Build Mode: place your first infrastructure node in the server room.",
    earnAchievement: "Keep going — your first career achievement is within reach.",
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
};

const ptBR: Translations = {
  common: { close: "Fechar", none: "nenhum", target: "Alvo", day: "Dia", collapseDock: "Recolher painel", expandDock: "Expandir painel", more: "Mais" },
  status: { healthy: "Saudável", degraded: "Degradado", down: "Inativo" },
  severities: {
    P1_CRITICAL: "P1 Crítico",
    P2_HIGH: "P2 Alto",
    P3_MEDIUM: "P3 Médio",
    P4_LOW: "P4 Baixo",
  },
  topbar: {
    tagline: "Operações do Escritório",
    live: "Ao vivo",
    reconnecting: "Reconectando",
    slaShield: "Escudo de SLA",
    runway: "Caixa Disponível",
    techDebt: "Dívida Técnica",
    morale: "Moral",
    pause: "Pausar simulação",
    newGame: "Novo Jogo",
    help: "Ajuda e Tutorial",
    settings: "Configurações",
  },
  office: {
    serverRoom: "SALA DE SERVIDORES",
    engineeringFloor: "ANDAR DE ENGENHARIA",
    boardroom: "SALA DE REUNIÕES",
    breakroom: "COPA",
    auditSummary: (clean, flagged) => `${clean} sem ressalvas / ${flagged} sinalizados`,
    moraleSummary: (pct) => `moral ${pct.toFixed(0)}%`,
  },
  nodeInspector: {
    status: "Status",
    tier: "Camada",
    latency: "Latência",
    errorRate: "Taxa de Erro",
    upstream: "Dependências",
  },
  incidents: {
    header: "Incidentes Ativos",
    openCount: (count) => `${count} em aberto`,
    allNominal: "Todos os sistemas normais",
    mtta: "MTTA",
    mttr: "MTTR",
    sanctionCountdown: (ticks) => `T-${ticks}`,
    acknowledge: "Reconhecer",
  },
  mitigations: {
    header: "Diretivas Operacionais",
    targetLabel: (serviceId) => `alvo: ${serviceId}`,
    categories: {
      deployment: "Implantação",
      compute: "Computação",
      resilience: "Resiliência",
      emergency: "Hotfix de Emergência",
    },
    actions: {
      rollback: { name: "Reverter Canário", description: "Voltar à última versão estável." },
      scale_replicas: { name: "Escalar Réplicas", description: "Adicionar 4 pods de computação." },
      circuit_breaker: { name: "Circuit Breaker", description: "Descartar tráfego não crítico." },
      emergency_patch: { name: "Hotfix em Produção", description: "Correção direta em produção." },
    },
    tdiSuffix: "TDI",
    rejected: "AÇÃO REJEITADA: ORÇAMENTO INSUFICIENTE",
  },
  ledger: {
    header: "Registro de Conformidade",
    noActivity: "Nenhuma atividade registrada ainda",
    postmortemUnavailable: "REGISTRO INDISPONÍVEL",
    cleanFlagged: (clean, flagged) => `${clean} sem ressalvas / ${flagged} sinalizados`,
    generatePostmortem: "Gerar Post-Mortem",
  },
  postMortem: {
    title: (incidentId) => `Relatório de Post-Mortem :: ${incidentId}`,
    exportPdf: "Exportar PDF Oficial",
  },
  incidentDetail: {
    incidentId: "ID do Incidente",
    affectedService: "Serviço Afetado",
    rootCause: "Causa Raiz",
    status: "Status",
    createdTick: "Tick de Criação",
    acknowledgedTick: "Tick de Reconhecimento",
  },
  liquidation: {
    eyebrow: "IncidentZero Corp. · Conselho de Administração",
    title: "Aviso de Desligamento",
    reference: (day) => `Referência: Revisão de Falência Operacional, Dia ${day}`,
    salutation: "Ao Chefe de Infraestrutura,",
    body: "Com efeito imediato, o Conselho de Administração resolveu encerrar o comando operacional atual. Os créditos de caixa da empresa foram totalmente esgotados, sem capital restante para sustentar as operações de infraestrutura.",
    ticksSurvived: "Ticks Sobrevividos",
    finalSla: "SLA Final",
    finalTechDebt: "Dívida Técnica Final",
    footer: "Esta decisão é final e entra em vigor no encerramento do expediente. Agradecemos pelos seus serviços.",
    button: "Recandidatar-se ao Cargo",
    stamp: "ENCERRADO",
  },
  victory: {
    eyebrow: "IncidentZero Corp. · Escritório de Auditoria Externa",
    title: "Certificado de Conformidade",
    reference: (day) => `Referência: Ciclo Mensal de Auditoria de SLA, Dia ${day}`,
    salutation: "Ao Chefe de Infraestrutura,",
    body: "Esta carta certifica que a IncidentZero Corp. concluiu com êxito um ciclo completo de auditoria mantendo a disponibilidade do serviço acima do limite de violação regulatória. O Conselho aprova a continuidade do seu mandato.",
    ticksSurvived: "Ticks Sobrevividos",
    finalSla: "SLA Final",
    runwayLeft: "Caixa Restante",
    footer: "Certificado e arquivado no registro de conformidade.",
    button: "Iniciar Próximo Ciclo de Auditoria",
  },
  language: { en: "English", ptBR: "Português (BR)", es: "Español" },
  floatingTexts: {
    criticalThreat: "AMEAÇA CRÍTICA DETECTADA",
    threatDetected: "AMEAÇA DETECTADA",
    nodeRestored: (serviceId) => `NÓ RESTAURADO: ${serviceId}`,
    slaWarning: "ALERTA DE SLA: SANÇÕES DE AUDITORIA ATIVAS",
    preAlertWarning: (serviceId, ticksRemaining) => `FALHA IMINENTE: ${serviceId} (T-${ticksRemaining})`,
  },
  upgrades: {
    header: "Melhorias",
    categories: {
      observability: "Observabilidade",
      resilience: "Resiliência",
      facility: "Instalações & Ergonomia",
    },
    actions: {
      apm_tracing: {
        name: "Rastreamento Distribuído APM",
        description: "Reduz o MTTA efetivo em 2 ticks para avaliação de violação regulatória.",
      },
      predictive_anomaly_detection: {
        name: "Detecção Preditiva de Anomalias",
        description: "Alerta sobre uma falha iminente 5 ticks antes de ela se materializar.",
      },
      multi_az_clusters: {
        name: "Clusters de Computação Multi-AZ",
        description: "Reduz o risco de falha em cascata em 40%.",
      },
      automated_cicd: {
        name: "Pipelines de CI/CD Automatizados",
        description: "Reduz pela metade o custo e a penalidade de dívida técnica do runbook Rollback.",
      },
      espresso_machine: {
        name: "Máquina de Café Expresso Comercial",
        description: "Reduz a queda de moral em 25%.",
      },
      ergonomic_chairs: {
        name: "Cadeiras Ergonômicas Herman Miller",
        description: "Reduz o acúmulo de fadiga dos engenheiros de plantão em 20%.",
      },
    },
    purchase: "Comprar",
    owned: "Adquirido",
    prerequisiteLocked: (upgradeName) => `Requer: ${upgradeName}`,
    insufficientBudget: "Orçamento de caixa insuficiente",
  },
  errorBudget: {
    label: "Orçamento de Erro",
    remaining: (pct) => `${pct.toFixed(1)}% restante`,
    featureFreezeActive: "CONGELAMENTO DE FUNCIONALIDADES ATIVO",
  },
  cabDilemma: {
    modalTitle: "Comitê de Mudanças — Decisão Necessária",
    timeRemaining: (ticks) => `${ticks} ticks para decidir`,
    choiceImpact: { budget: "Caixa", techDebt: "Dívida Técnica", morale: "Moral", reputation: "Reputação" },
  },
  staff: {
    header: "Equipe",
    competencies: { auth: "Identidade & Auth", payments: "Pagamentos", gateway: "Gateway", db: "Banco de Dados" },
    onCallStatus: { on_duty: "Em Plantão", off_duty: "Fora de Plantão", resting: "Descansando" },
    rotateShift: "Trocar Turno",
    hireEngineer: "Contratar Engenheiro",
    insufficientStamina: "Disposição insuficiente para retomar o plantão",
    hiringCost: (amount) => `Custo de contratação: ${amount}`,
    stress: "Estresse",
    stamina: "Disposição",
  },
  scenarios: {
    header: "Cenários",
    names: {
      black_friday_rush: "Corrida da Black Friday",
      ransomware_infiltration: "Infiltração de Ransomware",
      chaos_engineering_drill: "Simulado de Chaos Engineering",
    },
    descriptions: {
      black_friday_rush: "Um pico de tráfego 4x por 48 ticks atinge todos os serviços de uma vez. O consumo de nuvem acelera e apenas runbooks de escalonamento de capacidade são permitidos contra a sobrecarga.",
      ransomware_infiltration: "Um malware parte do Notification Dispatcher e se espalha nó a nó pelo grafo de dependências. Isole os serviços infectados com Circuit Breakers antes que ele alcance o banco de dados mestre.",
      chaos_engineering_drill: "Um chaos monkey automatizado encerra pods saudáveis aleatoriamente por 40 ticks seguidos, independentemente da dívida técnica. Resiliência pura, sem trégua.",
    },
    victoryRequirements: {
      black_friday_rush: "Mantenha o SLA acima do limite regulatório durante toda a janela de 48 ticks do pico.",
      ransomware_infiltration: "Evite que o Payment Gateway Core seja totalmente criptografado antes do fim da janela de 60 ticks.",
      chaos_engineering_drill: "Termine o simulado de 40 ticks sem nenhuma sinalização de violação regulatória no registro de conformidade.",
    },
    sandbox: "Modo Sandbox",
    sandboxDescription: "A simulação padrão e livre. Sem limite de tempo, sem regras especiais — apenas o organograma e o que o modelo de risco jogar contra você.",
    sandboxVictoryRequirement: "Sobreviva a um ciclo mensal completo de 720 ticks com o SLA igual ou acima do limite regulatório.",
    durationTicks: (ticks) => `${ticks} ticks`,
    unlimitedDuration: "Sem limite de tempo",
    selectModeTitle: "Selecionar Modo de Jogo",
    selectModeSubtitle: "Escolha um cenário de desafio ou inicie a simulação livre em modo sandbox.",
    launch: "Iniciar",
    start: "Iniciar Cenário",
    active: (elapsed, duration) => `Tick ${elapsed} / ${duration}`,
    victory: "Cenário Concluído",
    defeat: "Cenário Fracassado",
  },
  difficulty: {
    label: "Dificuldade",
    intern: "Estagiário",
    internDescription: "Orçamento inicial maior, menos falhas surpresa. Aprenda o jogo sem tanta pressão.",
    standard: "Padrão",
    standardDescription: "O equilíbrio pretendido: pressão real, trade-offs reais.",
    chaos: "Caos Total",
    chaosDescription: "Orçamento apertado, taxa de risco muito maior. Só para veteranos da sala de guerra.",
  },
  governance: {
    reputationLabel: "Reputação com o Conselho",
    reputationTooltip: "Moldada pelas escolhas nos dilemas do CAB. Cair demais atrai escrutínio do conselho (e mais azar com incidentes); ficar alta compra boa vontade.",
  },
  onboarding: {
    stepLabel: (current, total) => `Passo ${current} de ${total}`,
    skip: "Pular Tutorial",
    next: "Avançar",
    back: "Voltar",
    getStarted: "Começar",
    reopenTitle: "Repetir o tutorial",
    steps: {
      welcome: {
        title: "Boas-vindas e Missão",
        body: "Bem-vindo, Chefe de Infraestrutura. A IncidentZero Corp. confiou a você a tarefa de manter cinco serviços críticos no ar, as contas em dia e o conselho longe do seu pé. Cada tick é uma hora de expediente — sobreviva a um ciclo mensal completo de auditoria sem falir ou violar o seu SLA.",
      },
      topology: {
        title: "Topologia de Serviços",
        body: "O andar do seu escritório espelha sua infraestrutura real. Clique em qualquer rack de servidor ou mesa de engenharia para inspecionar sua saúde, latência e taxa de erro na gaveta de diagnóstico. Observe a cadeia de dependências com atenção — uma falha a montante pode se propagar para os serviços a jusante.",
      },
      crisis: {
        title: "Gestão de Crises",
        body: "Quando um alerta dispara, o relógio começa a contar. Reconheça-o rápido — esperar demais drena o moral por fadiga de alertas e, depois, os reguladores começam a multar você a cada tick até você responder. Escolha o runbook com sabedoria: um hotfix rápido é barato, mas acumula dívida técnica; um rollback custa mais, mas mantém a plataforma saudável.",
      },
      governance: {
        title: "Governança de TI",
        body: "Seu Orçamento de Erro é sua licença para falhar — esgote-o e um Congelamento de Funcionalidades bloqueia runbooks arriscados até você reduzir a dívida técnica. Mantenha o SLA acima do limite regulatório durante todo o ciclo mensal para passar na auditoria e vencer.",
      },
    },
  },
  settings: {
    title: "Configurações",
    audioSection: "Áudio",
    sfxVolume: "Volume dos Efeitos",
    muteAll: "Silenciar Todo o Áudio",
    musicSection: "Música",
    muteMusic: "Silenciar Música",
    accessibilitySection: "Acessibilidade",
    highContrast: "Alto Contraste",
    colorblindSafe: "Paleta para Daltonismo",
    languageSection: "Idioma",
    close: "Fechar",
  },
  titleScreen: {
    tagline: "Simulador de Operações de Escritório",
    continue: "Continuar",
    newGame: "Novo Jogo / Selecionar Modo",
    hallOfFame: "Hall da Fama",
    settings: "Configurações",
    credits: "Créditos",
    footer: "Uma simulação tycoon de gestão de crises SRE e governança de TI.",
  },
  credits: {
    body: "Cada incidente, fórmula e controle de auditoria desta simulação foi desenhado para espelhar práticas reais de SRE e governança de TI — matemática de SLA, orçamento de erro, modelos de falha em cascata e mais.",
    builtWith: "Construído com FastAPI, React, Zustand e SVG puro — sem motor de jogo externo.",
  },
  hallOfFame: {
    empty: "Nenhuma partida concluída ainda. Sobreviva ou vá à falência para registrar sua primeira entrada.",
    sandbox: "Sandbox",
    daysSurvived: (days) => `${days} dias sobrevividos`,
    myRecords: "Meus Recordes",
    global: "Global",
    anonymousPlayer: (shortId) => `Operador #${shortId}`,
  },
  newsTicker: {
    label: "IZ NOTÍCIAS",
    flavorLines: [
      "Conselho elogia disponibilidade do trimestre, exige mais com menos orçamento",
      "Fonte anônima: máquina de café da copa pode ganhar upgrade",
      "Analistas do setor: 'Ninguém lê post-mortems, mas todo mundo deveria'",
      "Ações da IncidentZero Corp. não afetadas pela pequena instabilidade de ontem, segundo fontes",
    ],
    eventHeadlines: {
      INCIDENT_RAISED: "URGENTE: Nova interrupção de serviço registrada no andar",
      INCIDENT_ACKNOWLEDGED: "Engenheiro de plantão reconhece alerta, conselho respira aliviado",
      RUNBOOK_EXECUTED: "Equipe de infraestrutura executa runbook de emergência",
      UPGRADE_PURCHASED: "Investimento aprovado para upgrade de infraestrutura",
      ACHIEVEMENT_UNLOCKED: "Indicado a funcionário do mês anunciado internamente",
      DILEMMA_RESOLVED: "Decisão do Comitê de Mudanças finalizada",
      FEATURE_FREEZE_ENGAGED: "Congelamento de funcionalidades declarado após esgotamento do orçamento de erro",
      SLA_BREACH_EMERGENCY_SANCTION: "Reguladores emitem sanção emergencial por violação de SLA",
      BANKRUPTCY_LIQUIDATION: "Conselho de Administração anuncia liquidação imediata",
      MONTHLY_AUDIT_CYCLE_SURVIVED: "Empresa certificada em conformidade após auditoria mensal",
      ENGINEER_HIRED: "Novo engenheiro se junta à escala de plantão",
      INFRASTRUCTURE_NODE_PLACED: "Novo módulo de hardware instalado na sala de servidores",
      ROOT_CAUSE_IDENTIFIED: "Engenharia elogiada por diagnóstico rápido de causa raiz",
      COSMETIC_UNLOCKED: "Orçamento de decoração aprovado para upgrade estético",
    },
  },
  objectiveHints: {
    acknowledgeIncident: "Há um alerta esperando — reconheça antes que a multa comece a contar.",
    hireEngineer: "Contrate seu primeiro engenheiro de plantão na aba Equipe.",
    buyUpgrade: "Seu caixa já dá pra sua primeira melhoria — veja a aba Melhorias.",
    tryBuildMode: "Experimente o Modo de Construção: instale seu primeiro módulo na sala de servidores.",
    earnAchievement: "Continue assim — sua primeira conquista de carreira está por perto.",
  },
  incidentReplay: {
    openButton: "Replay",
    title: (incidentId) => `Replay do Incidente :: ${incidentId}`,
    empty: "Nenhum evento do registro correlacionado a este incidente foi encontrado.",
    play: "Reproduzir",
    pause: "Pausar",
  },
  buildMode: {
    toggle: "Modo de Construção",
    catalog: {
      redis_cache: { name: "Cluster de Cache Redis", description: "Absorve picos de leitura; reduz a latência upstream em 45%." },
      kafka_queue: { name: "Fila de Mensagens Kafka", description: "Desacopla serviços; evita falhas em cascata entre produtor e consumidor." },
      db_read_replica: { name: "Réplica de Leitura do Banco", description: "Divide a carga de consultas; reduz a probabilidade de deadlock em 60%." },
      nginx_lb: { name: "Balanceador de Carga NGINX", description: "Distribui o tráfego de borda entre nós de computação replicados." },
    },
    selectTargetHint: "Clique em um rack de servidor para o alvo",
    selectProducerHint: "Agora clique no rack produtor para desacoplar",
    placed: "Módulo de infraestrutura instalado",
    placementFailed: "Falha na instalação: orçamento insuficiente ou alvo inválido",
  },
  logTriage: {
    title: "Triagem de Logs — Causa Raiz",
    investigateLogs: "Investigar Logs",
    alreadySolved: "Causa Raiz Já Identificada",
    rootCauseConfirmed: "CAUSA RAIZ CONFIRMADA",
    rewardEarned: "CAUSA RAIZ ENCONTRADA: -50% no custo de mitigação, MTTR reduzido pela metade",
  },
  achievements: {
    header: "Conquistas",
    unlockedToast: "Conquista Desbloqueada",
    prestigePoints: "Pontos de Prestígio",
    owned: "Adquirido",
    insufficientPrestige: "Pontos de prestígio insuficientes",
  },
  liveOps: {
    title: "Operações ao Vivo",
    subtitle: "Painel de espectador somente leitura — seguro para um segundo monitor",
    activeAlerts: "Alertas Ativos",
    complianceWaterfall: "Linha do Tempo de Conformidade",
  },
  scenarioBuilder: {
    openBuilder: "Criar Cenário Personalizado",
    title: "Construtor de Cenários do Chaos Sandbox",
    durationTicks: "Duração (ticks)",
    hazardMultiplier: "Multiplicador de Risco",
    budgetFloor: "Piso de Orçamento ($)",
    chaosInjections: "Injeções de Caos Agendadas",
    addInjection: "Adicionar Injeção",
    exportCode: "Copiar Código de Desafio",
    importCode: "Importar",
    importPlaceholder: "Cole um código de desafio…",
    importSuccess: "Cenário importado",
    importFailed: "Código de desafio inválido",
    testScenario: "Testar Cenário",
    testFailed: "Falha ao carregar cenário personalizado",
  },
};

const es: Translations = {
  common: { close: "Cerrar", none: "ninguno", target: "Objetivo", day: "Día", collapseDock: "Contraer panel", expandDock: "Expandir panel", more: "Más" },
  status: { healthy: "Saludable", degraded: "Degradado", down: "Caído" },
  severities: {
    P1_CRITICAL: "P1 Crítico",
    P2_HIGH: "P2 Alto",
    P3_MEDIUM: "P3 Medio",
    P4_LOW: "P4 Bajo",
  },
  topbar: {
    tagline: "Operaciones de la Oficina",
    live: "En vivo",
    reconnecting: "Reconectando",
    slaShield: "Escudo de SLA",
    runway: "Fondos Disponibles",
    techDebt: "Deuda Técnica",
    morale: "Moral",
    pause: "Pausar simulación",
    newGame: "Nueva Partida",
    help: "Ayuda y Tutorial",
    settings: "Configuración",
  },
  office: {
    serverRoom: "SALA DE SERVIDORES",
    engineeringFloor: "PISO DE INGENIERÍA",
    boardroom: "SALA DE JUNTAS",
    breakroom: "SALA DE DESCANSO",
    auditSummary: (clean, flagged) => `${clean} limpios / ${flagged} marcados`,
    moraleSummary: (pct) => `moral ${pct.toFixed(0)}%`,
  },
  nodeInspector: {
    status: "Estado",
    tier: "Nivel",
    latency: "Latencia",
    errorRate: "Tasa de Error",
    upstream: "Dependencias",
  },
  incidents: {
    header: "Incidentes Activos",
    openCount: (count) => `${count} abiertos`,
    allNominal: "Todos los sistemas normales",
    mtta: "MTTA",
    mttr: "MTTR",
    sanctionCountdown: (ticks) => `T-${ticks}`,
    acknowledge: "Reconocer",
  },
  mitigations: {
    header: "Directivas Operativas",
    targetLabel: (serviceId) => `objetivo: ${serviceId}`,
    categories: {
      deployment: "Despliegue",
      compute: "Cómputo",
      resilience: "Resiliencia",
      emergency: "Hotfix de Emergencia",
    },
    actions: {
      rollback: { name: "Revertir Canary", description: "Volver a la última versión estable." },
      scale_replicas: { name: "Escalar Réplicas", description: "Agregar 4 pods de cómputo." },
      circuit_breaker: { name: "Circuit Breaker", description: "Descartar tráfico no crítico." },
      emergency_patch: { name: "Hotfix en Producción", description: "Corrección directa en producción." },
    },
    tdiSuffix: "TDI",
    rejected: "ACCIÓN RECHAZADA: PRESUPUESTO INSUFICIENTE",
  },
  ledger: {
    header: "Registro de Cumplimiento",
    noActivity: "Aún no hay actividad registrada",
    postmortemUnavailable: "REGISTRO NO DISPONIBLE",
    cleanFlagged: (clean, flagged) => `${clean} limpios / ${flagged} marcados`,
    generatePostmortem: "Generar Post-Mortem",
  },
  postMortem: {
    title: (incidentId) => `Informe Post-Mortem :: ${incidentId}`,
    exportPdf: "Exportar PDF Oficial",
  },
  incidentDetail: {
    incidentId: "ID del Incidente",
    affectedService: "Servicio Afectado",
    rootCause: "Causa Raíz",
    status: "Estado",
    createdTick: "Tick de Creación",
    acknowledgedTick: "Tick de Reconocimiento",
  },
  liquidation: {
    eyebrow: "IncidentZero Corp. · Junta Directiva",
    title: "Aviso de Terminación",
    reference: (day) => `Referencia: Revisión de Quiebra Operativa, Día ${day}`,
    salutation: "Al Jefe de Infraestructura,",
    body: "Con efecto inmediato, la Junta Directiva ha resuelto terminar el mando operativo actual. Los créditos de fondos de la empresa se han agotado por completo, sin capital restante para sostener las operaciones de infraestructura.",
    ticksSurvived: "Ticks Sobrevividos",
    finalSla: "SLA Final",
    finalTechDebt: "Deuda Técnica Final",
    footer: "Esta decisión es final y efectiva al cierre de operaciones. Le agradecemos sus servicios.",
    button: "Volver a Postularse al Cargo",
    stamp: "TERMINADO",
  },
  victory: {
    eyebrow: "IncidentZero Corp. · Oficina de Auditoría Externa",
    title: "Certificado de Cumplimiento",
    reference: (day) => `Referencia: Ciclo Mensual de Auditoría de SLA, Día ${day}`,
    salutation: "Al Jefe de Infraestructura,",
    body: "Esta carta certifica que IncidentZero Corp. ha completado con éxito un ciclo completo de auditoría manteniendo la disponibilidad del servicio por encima del umbral de incumplimiento regulatorio. La Junta aprueba la continuidad de su gestión.",
    ticksSurvived: "Ticks Sobrevividos",
    finalSla: "SLA Final",
    runwayLeft: "Fondos Restantes",
    footer: "Certificado y archivado en el registro de cumplimiento.",
    button: "Iniciar Próximo Ciclo de Auditoría",
  },
  language: { en: "English", ptBR: "Português (BR)", es: "Español" },
  floatingTexts: {
    criticalThreat: "AMENAZA CRÍTICA DETECTADA",
    threatDetected: "AMENAZA DETECTADA",
    nodeRestored: (serviceId) => `NODO RESTAURADO: ${serviceId}`,
    slaWarning: "ALERTA DE SLA: SANCIONES DE AUDITORÍA ACTIVAS",
    preAlertWarning: (serviceId, ticksRemaining) => `FALLA INMINENTE: ${serviceId} (T-${ticksRemaining})`,
  },
  upgrades: {
    header: "Mejoras",
    categories: {
      observability: "Observabilidad",
      resilience: "Resiliencia",
      facility: "Instalaciones y Ergonomía",
    },
    actions: {
      apm_tracing: {
        name: "Rastreo Distribuido APM",
        description: "Reduce el MTTA efectivo en 2 ticks para la evaluación de incumplimiento regulatorio.",
      },
      predictive_anomaly_detection: {
        name: "Detección Predictiva de Anomalías",
        description: "Advierte de una falla inminente 5 ticks antes de que se materialice.",
      },
      multi_az_clusters: {
        name: "Clústeres de Cómputo Multi-AZ",
        description: "Reduce el riesgo de falla en cascada en un 40%.",
      },
      automated_cicd: {
        name: "Pipelines de CI/CD Automatizados",
        description: "Reduce a la mitad el costo y la penalización de deuda técnica del runbook Rollback.",
      },
      espresso_machine: {
        name: "Máquina de Café Espresso Comercial",
        description: "Ralentiza la caída de la moral en un 25%.",
      },
      ergonomic_chairs: {
        name: "Sillas Ergonómicas Herman Miller",
        description: "Reduce la acumulación de fatiga de los ingenieros de guardia en un 20%.",
      },
    },
    purchase: "Comprar",
    owned: "Adquirido",
    prerequisiteLocked: (upgradeName) => `Requiere: ${upgradeName}`,
    insufficientBudget: "Presupuesto insuficiente",
  },
  errorBudget: {
    label: "Presupuesto de Errores",
    remaining: (pct) => `${pct.toFixed(1)}% restante`,
    featureFreezeActive: "CONGELAMIENTO DE FUNCIONES ACTIVO",
  },
  cabDilemma: {
    modalTitle: "Comité de Cambios — Decisión Requerida",
    timeRemaining: (ticks) => `${ticks} ticks para decidir`,
    choiceImpact: { budget: "Fondos", techDebt: "Deuda Técnica", morale: "Moral", reputation: "Reputación" },
  },
  staff: {
    header: "Personal",
    competencies: { auth: "Identidad y Auth", payments: "Pagos", gateway: "Gateway", db: "Base de Datos" },
    onCallStatus: { on_duty: "De Guardia", off_duty: "Fuera de Guardia", resting: "Descansando" },
    rotateShift: "Rotar Turno",
    hireEngineer: "Contratar Ingeniero",
    insufficientStamina: "Resistencia insuficiente para volver al turno",
    hiringCost: (amount) => `Costo de contratación: ${amount}`,
    stress: "Estrés",
    stamina: "Resistencia",
  },
  scenarios: {
    header: "Escenarios",
    names: {
      black_friday_rush: "Avalancha del Black Friday",
      ransomware_infiltration: "Infiltración de Ransomware",
      chaos_engineering_drill: "Simulacro de Chaos Engineering",
    },
    descriptions: {
      black_friday_rush: "Un pico de tráfico 4x durante 48 ticks golpea todos los servicios a la vez. El consumo de nube se acelera y solo se permiten runbooks de escalado de capacidad contra la sobrecarga.",
      ransomware_infiltration: "Un malware parte del Notification Dispatcher y se propaga nodo a nodo por el grafo de dependencias. Aísla los servicios infectados con Circuit Breakers antes de que llegue a la base de datos maestra.",
      chaos_engineering_drill: "Un chaos monkey automatizado termina pods saludables al azar durante 40 ticks seguidos, sin importar la deuda técnica. Resiliencia pura, sin tregua.",
    },
    victoryRequirements: {
      black_friday_rush: "Mantén el SLA por encima del umbral regulatorio durante toda la ventana de 48 ticks del pico.",
      ransomware_infiltration: "Evita que el Payment Gateway Core sea cifrado por completo antes de que termine la ventana de 60 ticks.",
      chaos_engineering_drill: "Termina el simulacro de 40 ticks sin ninguna alerta de incumplimiento regulatorio en el registro de cumplimiento.",
    },
    sandbox: "Modo Sandbox",
    sandboxDescription: "La simulación libre por defecto. Sin límite de tiempo, sin reglas especiales — solo el organigrama y lo que el modelo de riesgo te depare.",
    sandboxVictoryRequirement: "Sobrevive un ciclo mensual completo de 720 ticks con el SLA igual o por encima del umbral regulatorio.",
    durationTicks: (ticks) => `${ticks} ticks`,
    unlimitedDuration: "Sin límite de tiempo",
    selectModeTitle: "Seleccionar Modo de Juego",
    selectModeSubtitle: "Elige un escenario de desafío o inicia la simulación libre en modo sandbox.",
    launch: "Iniciar",
    start: "Iniciar Escenario",
    active: (elapsed, duration) => `Tick ${elapsed} / ${duration}`,
    victory: "Escenario Completado",
    defeat: "Escenario Fallido",
  },
  difficulty: {
    label: "Dificultad",
    intern: "Interno",
    internDescription: "Más presupuesto inicial, menos fallas sorpresa. Aprende sin tanta presión.",
    standard: "Estándar",
    standardDescription: "El equilibrio previsto: presión real, decisiones reales.",
    chaos: "Caos Total",
    chaosDescription: "Presupuesto ajustado, tasa de riesgo mucho más alta. Solo para veteranos de la sala de crisis.",
  },
  governance: {
    reputationLabel: "Reputación ante la Junta",
    reputationTooltip: "Moldeada por tus decisiones en los dilemas del CAB. Caer demasiado atrae escrutinio de la junta (y peor suerte con los incidentes); mantenerla alta compra buena voluntad.",
  },
  onboarding: {
    stepLabel: (current, total) => `Paso ${current} de ${total}`,
    skip: "Omitir Tutorial",
    next: "Siguiente",
    back: "Atrás",
    getStarted: "Comenzar",
    reopenTitle: "Repetir el tutorial",
    steps: {
      welcome: {
        title: "Bienvenida y Misión",
        body: "Bienvenido, Jefe de Infraestructura. IncidentZero Corp. te ha confiado mantener cinco servicios críticos en línea, las cuentas equilibradas y a la junta directiva tranquila. Cada tick es una hora de oficina — sobrevive un ciclo mensual completo de auditoría sin quebrar ni incumplir tu SLA.",
      },
      topology: {
        title: "Topología de Servicios",
        body: "El piso de tu oficina refleja tu infraestructura real. Haz clic en cualquier rack de servidor o escritorio de ingeniería para inspeccionar su estado, latencia y tasa de error en el panel de diagnóstico. Observa bien la cadena de dependencias — una falla en un servicio upstream puede propagarse hacia los que dependen de él.",
      },
      crisis: {
        title: "Gestión de Crisis",
        body: "Cuando se dispara una alerta, el reloj empieza a correr. Reconócela rápido — esperar demasiado agota la moral por fatiga de alertas y luego los reguladores empiezan a multarte cada tick hasta que respondas. Elige el runbook con cuidado: un hotfix rápido es barato pero acumula deuda técnica; un rollback cuesta más pero mantiene la plataforma sana.",
      },
      governance: {
        title: "Gobernanza de TI",
        body: "Tu Presupuesto de Errores es tu licencia para fallar — agótalo y un Congelamiento de Funciones bloquea los runbooks arriesgados hasta que reduzcas la deuda técnica. Mantén el SLA por encima del umbral regulatorio durante todo el ciclo mensual para pasar la auditoría y ganar.",
      },
    },
  },
  settings: {
    title: "Configuración",
    audioSection: "Audio",
    sfxVolume: "Volumen de Efectos",
    muteAll: "Silenciar Todo el Audio",
    musicSection: "Música",
    muteMusic: "Silenciar Música",
    accessibilitySection: "Accesibilidad",
    highContrast: "Alto Contraste",
    colorblindSafe: "Paleta para Daltonismo",
    languageSection: "Idioma",
    close: "Cerrar",
  },
  titleScreen: {
    tagline: "Simulador de Operaciones de Oficina",
    continue: "Continuar",
    newGame: "Nueva Partida / Seleccionar Modo",
    hallOfFame: "Salón de la Fama",
    settings: "Configuración",
    credits: "Créditos",
    footer: "Una simulación tycoon de gestión de crisis SRE y gobernanza de TI.",
  },
  credits: {
    body: "Cada incidente, fórmula y control de auditoría en esta simulación fue diseñado para reflejar prácticas reales de SRE y gobernanza de TI — matemática de SLA, presupuesto de errores, modelos de falla en cascada y más.",
    builtWith: "Construido con FastAPI, React, Zustand y SVG puro — sin motor de juego externo.",
  },
  hallOfFame: {
    empty: "Aún no hay partidas concluidas. Sobrevive o quiebra para registrar tu primera entrada.",
    sandbox: "Sandbox",
    daysSurvived: (days) => `${days} días sobrevividos`,
    myRecords: "Mis Récords",
    global: "Global",
    anonymousPlayer: (shortId) => `Operador #${shortId}`,
  },
  newsTicker: {
    label: "IZ NOTICIAS",
    flavorLines: [
      "La Junta elogia el tiempo de actividad del trimestre, exige más con menos presupuesto",
      "Fuente anónima: se rumorea una mejora para la máquina de café de la oficina",
      "Analistas del sector: 'Nadie lee los post-mortems, pero todos deberían'",
      "Las acciones de IncidentZero Corp. no se vieron afectadas por la falla menor de ayer, según fuentes",
    ],
    eventHeadlines: {
      INCIDENT_RAISED: "ÚLTIMA HORA: Nueva interrupción de servicio reportada en el piso",
      INCIDENT_ACKNOWLEDGED: "Ingeniero de guardia reconoce la alerta, la junta respira aliviada",
      RUNBOOK_EXECUTED: "El equipo de infraestructura despliega un runbook de emergencia",
      UPGRADE_PURCHASED: "Inversión aprobada para mejora de infraestructura",
      ACHIEVEMENT_UNLOCKED: "Nominado a empleado del mes anunciado internamente",
      DILEMMA_RESOLVED: "Decisión del Comité de Cambios finalizada",
      FEATURE_FREEZE_ENGAGED: "Se declara congelamiento de funciones tras agotarse el presupuesto de errores",
      SLA_BREACH_EMERGENCY_SANCTION: "Reguladores emiten sanción de emergencia por incumplimiento de SLA",
      BANKRUPTCY_LIQUIDATION: "La Junta Directiva anuncia liquidación inmediata",
      MONTHLY_AUDIT_CYCLE_SURVIVED: "Empresa certificada en cumplimiento tras la auditoría mensual",
      ENGINEER_HIRED: "Nuevo ingeniero se une al equipo de guardia",
      INFRASTRUCTURE_NODE_PLACED: "Nuevo módulo de hardware instalado en la sala de servidores",
      ROOT_CAUSE_IDENTIFIED: "Ingeniería elogiada por diagnóstico rápido de causa raíz",
      COSMETIC_UNLOCKED: "Presupuesto de decoración aprobado para una mejora estética",
    },
  },
  objectiveHints: {
    acknowledgeIncident: "Hay una alerta esperando — reconócela antes de que empiece la multa.",
    hireEngineer: "Contrata a tu primer ingeniero de guardia en la pestaña Personal.",
    buyUpgrade: "Tu presupuesto ya alcanza para tu primera mejora — revisa la pestaña Mejoras.",
    tryBuildMode: "Prueba el Modo Construcción: instala tu primer módulo en la sala de servidores.",
    earnAchievement: "Sigue así — tu primer logro de carrera está cerca.",
  },
  incidentReplay: {
    openButton: "Reproducir",
    title: (incidentId) => `Repetición del Incidente :: ${incidentId}`,
    empty: "No se encontraron eventos del registro correlacionados con este incidente.",
    play: "Reproducir",
    pause: "Pausar",
  },
  buildMode: {
    toggle: "Modo Construcción",
    catalog: {
      redis_cache: { name: "Clúster de Caché Redis", description: "Absorbe picos de lectura; reduce la latencia upstream en 45%." },
      kafka_queue: { name: "Cola de Mensajes Kafka", description: "Desacopla servicios; evita fallas en cascada entre productor y consumidor." },
      db_read_replica: { name: "Réplica de Lectura de la BD", description: "Divide la carga de consultas; reduce la probabilidad de deadlock en 60%." },
      nginx_lb: { name: "Balanceador de Carga NGINX", description: "Distribuye el tráfico de borde entre nodos de cómputo replicados." },
    },
    selectTargetHint: "Haz clic en un rack de servidor para el objetivo",
    selectProducerHint: "Ahora haz clic en el rack productor para desacoplar",
    placed: "Módulo de infraestructura instalado",
    placementFailed: "Fallo de instalación: presupuesto insuficiente u objetivo inválido",
  },
  logTriage: {
    title: "Triaje de Logs — Causa Raíz",
    investigateLogs: "Investigar Logs",
    alreadySolved: "Causa Raíz Ya Identificada",
    rootCauseConfirmed: "CAUSA RAÍZ CONFIRMADA",
    rewardEarned: "CAUSA RAÍZ ENCONTRADA: -50% en costo de mitigación, MTTR reducido a la mitad",
  },
  achievements: {
    header: "Logros",
    unlockedToast: "Logro Desbloqueado",
    prestigePoints: "Puntos de Prestigio",
    owned: "Adquirido",
    insufficientPrestige: "Puntos de prestigio insuficientes",
  },
  liveOps: {
    title: "Operaciones en Vivo",
    subtitle: "Panel de espectador de solo lectura — seguro para un segundo monitor",
    activeAlerts: "Alertas Activas",
    complianceWaterfall: "Línea de Tiempo de Cumplimiento",
  },
  scenarioBuilder: {
    openBuilder: "Crear Escenario Personalizado",
    title: "Constructor de Escenarios del Chaos Sandbox",
    durationTicks: "Duración (ticks)",
    hazardMultiplier: "Multiplicador de Riesgo",
    budgetFloor: "Piso de Presupuesto ($)",
    chaosInjections: "Inyecciones de Caos Programadas",
    addInjection: "Agregar Inyección",
    exportCode: "Copiar Código de Desafío",
    importCode: "Importar",
    importPlaceholder: "Pega un código de desafío…",
    importSuccess: "Escenario importado",
    importFailed: "Código de desafío inválido",
    testScenario: "Probar Escenario",
    testFailed: "Error al cargar el escenario personalizado",
  },
};

export const TRANSLATIONS: Record<Language, Translations> = { en, "pt-BR": ptBR, es };
