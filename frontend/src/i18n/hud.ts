// COPY FOR THE TOP BAR, DOCK, KPI METERS, TOASTS AND INCIDENT CARDS. Kept in its own module so the
// shared translations.ts only needs one field per locale.

export interface HudCopy {
  common: { loading: string; retry: string; dismiss: string };
  // short causes printed on the kpi chips that fly off a meter
  chip: { fine: string; auditor: string; cab: string; hire: string; infrastructure: string; sanction: string; ledger: string };
  topbar: {
    kpiCluster: string;
    burnSuffix: string;
    burnTitle: (amount: string) => string;
    indicators: string;
    indicatorsAria: string;
    indicatorsPanel: string;
    menu: string;
    menuTitle: string;
    pauseTitle: string;
    resumeTitle: string;
    paused: string;
    speedTitle: (x: number) => string;
    freeze: string;
    freezeTitle: string;
  };
  dock: {
    tabsLabel: string;
    metrics: string;
    moreMenu: string;
    moreAria: string;
    badge: {
      incidents: (n: number) => string;
      roster: (n: number) => string;
      upgrades: (n: number) => string;
      achievements: (n: number) => string;
    };
  };
  incidents: {
    steps: { new: string; acknowledged: string; investigated: string; mitigating: string; resolved: string };
    lifecycleLabel: string;
    next: { acknowledge: string; investigate: string; chooseRunbook: string };
    acknowledging: string;
    acknowledgedToast: (service: string) => string;
    resolvedStamp: string;
    emptyTitle: string;
    emptyHint: string;
    openCard: (service: string, title: string) => string;
    alerts: {
      label: string;
      header: (n: number) => string;
      tabHint: string;
      mttaRisk: string;
      ticks: (n: number, max: number) => string;
      mttaFrozen: string;
      ackTitle: string;
      investigateTitle: string;
    };
  };
  mitigations: {
    ready: string;
    shortBy: (amount: string) => string;
    listPrice: (amount: string) => string;
    discountCicd: string;
    discountTriage: string;
    discountTitle: (sources: string) => string;
    tdiTitle: (delta: number) => string;
  };
  ledger: {
    events: Record<string, string>;
    compliant: string;
    flagged: string;
    tick: (n: number) => string;
    raw: string;
    emptyHint: string;
  };
  roster: {
    emptyTitle: string;
    emptyHint: string;
    chooseSpecialty: string;
    hiring: string;
    cancelHire: string;
    hireTitle: (name: string) => string;
    stressAlert: string;
  };
  upgrades: {
    requires: (name: string) => string;
    shortBy: (amount: string) => string;
    buyTitle: (name: string, cost: string) => string;
    nextTier: string;
  };
  achievements: {
    loading: string;
    loadFailed: string;
    emptyTitle: string;
    emptyHint: string;
    points: (n: number) => string;
    cosmetics: string;
    newBadge: string;
    locked: string;
    unlocked: string;
  };
  metrics: {
    sla: string;
    latency: string;
    errorRate: string;
    liveTelemetry: string;
    tick: (n: number) => string;
    emptyTitle: string;
    emptyHint: string;
    sla_states: { nominal: string; degraded: string; breachRisk: string };
    latency_states: { healthy: string; elevated: string; critical: string };
    error_states: { normal: string; elevated: string; severe: string };
    columns: { service: string; status: string; latency: string; errors: string };
  };
  toast: { region: string; dismiss: string };
  resolution: { region: string; dismiss: string };
  language: { label: string };
  ticker: { region: string };
}

export const hudEn: HudCopy = {
  common: { loading: "Loading…", retry: "Retry", dismiss: "Dismiss" },
  chip: {
    fine: "Fine",
    auditor: "Auditor",
    cab: "CAB",
    hire: "Hire",
    infrastructure: "Infrastructure",
    sanction: "SLA sanction",
    ledger: "Ledger",
  },
  topbar: {
    kpiCluster: "Key performance indicators",
    burnSuffix: "/tick",
    burnTitle: (amount) => `Passive burn: ${amount} per tick`,
    indicators: "Indicators",
    indicatorsAria: "Show tech debt, morale and reputation",
    indicatorsPanel: "Tech debt, morale and reputation",
    menu: "Menu",
    menuTitle: "Open tactical pause menu [Esc]",
    pauseTitle: "Pause [Space]",
    resumeTitle: "Resume [Space]",
    paused: "PAUSED",
    speedTitle: (x) => `Run at ${x}x speed`,
    freeze: "FREEZE",
    freezeTitle: "Feature freeze: risky runbooks are locked",
  },
  dock: {
    tabsLabel: "Dock sections",
    metrics: "Metrics",
    moreMenu: "More sections",
    moreAria: "More dock sections",
    badge: {
      incidents: (n) => `${n} open incidents`,
      roster: (n) => `${n} stressed engineers`,
      upgrades: (n) => `${n} affordable upgrades`,
      achievements: (n) => `${n} new achievements`,
    },
  },
  incidents: {
    steps: {
      new: "New",
      acknowledged: "Acknowledged",
      investigated: "Investigated",
      mitigating: "Mitigating",
      resolved: "Resolved",
    },
    lifecycleLabel: "Incident progress",
    next: { acknowledge: "Acknowledge", investigate: "Investigate logs", chooseRunbook: "Choose runbook" },
    acknowledging: "Acknowledging…",
    acknowledgedToast: (service) => `ACKNOWLEDGED: ${service}`,
    resolvedStamp: "RESOLVED",
    emptyTitle: "All systems nominal",
    emptyHint: "New incidents will show up here the moment they are raised.",
    openCard: (service, title) => `Open incident briefing: ${service}, ${title}`,
    alerts: {
      label: "Active incident alerts",
      header: (n) => `ACTIVE THREATS (${n})`,
      tabHint: "[ ] TO CYCLE",
      mttaRisk: "MTTA risk",
      ticks: (n, max) => `${n} / ${max} ticks`,
      mttaFrozen: "MTTA FROZEN",
      ackTitle: "Freeze the MTTA clock and prevent regulatory fines",
      investigateTitle: "Open the log triage terminal",
    },
  },
  mitigations: {
    ready: "Ready",
    shortBy: (amount) => `Need ${amount} more`,
    listPrice: (amount) => `List price ${amount}`,
    discountCicd: "automated CI/CD",
    discountTriage: "root cause found",
    discountTitle: (sources) => `Discounted by ${sources}`,
    tdiTitle: (delta) => `Tech debt ${delta > 0 ? "+" : ""}${delta}`,
  },
  ledger: {
    events: {
      ACHIEVEMENT_UNLOCKED: "Achievement unlocked",
      AI_AUDITOR_INTERVIEW_TURN: "Auditor interview",
      AI_AUDITOR_VERDICT_APPLIED: "Auditor verdict applied",
      BANKRUPTCY_LIQUIDATION: "Bankruptcy liquidation",
      CHAOS_STRIKE: "Chaos strike",
      COSMETIC_UNLOCKED: "Cosmetic unlocked",
      DDOS_ATTACK_DETECTED: "DDoS attack detected",
      DEPLOYMENT_REGRESSION_DETECTED: "Deploy regression detected",
      DILEMMA_OFFERED: "CAB dilemma raised",
      DILEMMA_RESOLVED: "CAB decision made",
      ELEVATED_RISK_WINDOW_OPENED: "Elevated risk window",
      ENGINEER_HIRED: "Engineer hired",
      FEATURE_FREEZE_ENGAGED: "Feature freeze engaged",
      FEATURE_FREEZE_LIFTED: "Feature freeze lifted",
      INCIDENT_ACKNOWLEDGED: "Incident acknowledged",
      INCIDENT_RAISED: "Incident raised",
      INFRASTRUCTURE_NODE_PLACED: "Infrastructure installed",
      INFRASTRUCTURE_NODE_REMOVED: "Infrastructure removed",
      INVESTIGATION_STARTED: "Investigation started",
      MONTHLY_AUDIT_CYCLE_SURVIVED: "Monthly audit survived",
      PATIENT_ZERO_IDENTIFIED: "Patient zero identified",
      PROACTIVE_REFACTOR_CYCLE: "Proactive refactor cycle",
      ROOT_CAUSE_IDENTIFIED: "Root cause identified",
      RUNBOOK_EXECUTED: "Runbook executed",
      SCENARIO_CONCLUDED: "Scenario concluded",
      SECOND_REGRESSION_WAVE: "Second regression wave",
      SHIFT_ROTATED: "Shift rotated",
      SLA_BREACH_EMERGENCY_SANCTION: "SLA breach sanction",
      SNAPSHOT_VERSION_MISMATCH: "Snapshot version mismatch",
      SYSTEM_RESTORED: "System restored",
      THIRD_PARTY_PROVIDER_OUTAGE: "Third-party outage",
      THIRD_PARTY_PROVIDER_RECOVERED: "Third-party recovered",
      UNATTENDED_ALERT_VIOLATION: "Unattended alert fine",
      UPGRADE_PURCHASED: "Upgrade purchased",
    },
    compliant: "Compliant entry",
    flagged: "Flagged entry",
    tick: (n) => `T+${n}`,
    raw: "Raw record",
    emptyHint: "Every spend, fine and decision is recorded here.",
  },
  roster: {
    emptyTitle: "No engineers yet",
    emptyHint: "Hire your first on-call engineer to cover the services.",
    chooseSpecialty: "Choose a specialty",
    hiring: "Hiring…",
    cancelHire: "Cancel",
    hireTitle: (name) => `Hire a ${name} specialist`,
    stressAlert: "High stress",
  },
  upgrades: {
    requires: (name) => `Requires ${name}`,
    shortBy: (amount) => `Need ${amount} more`,
    buyTitle: (name, cost) => `Buy ${name} for ${cost}`,
    nextTier: "unlocks next tier",
  },
  achievements: {
    loading: "Loading achievements…",
    loadFailed: "Could not load the achievement catalog.",
    emptyTitle: "No achievements available",
    emptyHint: "The catalog is empty right now.",
    points: (n) => `+${n} pts`,
    cosmetics: "Cosmetics",
    newBadge: "NEW",
    locked: "Locked",
    unlocked: "Unlocked",
  },
  metrics: {
    sla: "SLA %",
    latency: "Avg latency",
    errorRate: "Error rate",
    liveTelemetry: "Live service telemetry",
    tick: (n) => `Tick ${n}`,
    emptyTitle: "No services reporting",
    emptyHint: "Telemetry appears as soon as the simulation connects.",
    sla_states: { nominal: "Nominal", degraded: "Degraded", breachRisk: "Breach risk" },
    latency_states: { healthy: "Healthy", elevated: "Elevated", critical: "Critical" },
    error_states: { normal: "Normal", elevated: "Elevated", severe: "Severe" },
    columns: { service: "Service", status: "Status", latency: "Latency", errors: "Errors" },
  },
  toast: { region: "Notifications", dismiss: "Dismiss notification" },
  resolution: { region: "Resolved incidents", dismiss: "Dismiss summary" },
  language: { label: "Language" },
  ticker: { region: "Operations news" },
};
