// COPY FOR THE GAMEPLAY DIALOGS (incident briefing, log triage, CAB decision, post-mortem, replay).
// Kept in its own module so the shared translations.ts only needs one field per locale.

export interface GameplayModalsCopy {
  detail: {
    lifecycleLabel: string;
    steps: { new: string; acknowledged: string; investigated: string; mitigating: string; resolved: string };
    nextStep: string;
    acknowledging: string;
    liveMetrics: string;
    surcharge: string;
    surchargeRate: (amount: string) => string;
    ticksUnit: string;
    oscilloscope: string;
    errSuffix: string;
    rootCauseConfirmed: string;
    closeAction: string;
    mitigationLocked: string;
  };
  triage: {
    instruction: string;
    keyboardHint: string;
    boot: (incidentId: string) => string;
    loading: string;
    loadFailed: string;
    retry: string;
    noLines: string;
    filterLabel: string;
    listLabel: string;
    hiddenByFilter: (count: number) => string;
    slaBleeding: string;
    openFor: (ticks: number) => string;
    surchargeAccrued: (amount: string) => string;
    surchargeRate: (amount: string) => string;
    attempts: (count: number) => string;
    quality: (pct: number) => string;
    wrongInline: (pct: number) => string;
    causeLabel: string;
    causePending: string;
    returning: string;
    back: string;
    submitting: string;
  };
  cab: {
    deadline: string;
    secondsLeft: (seconds: number) => string;
    ticksLeft: (ticks: number) => string;
    resolving: string;
    mustDecide: string;
    previewHeading: string;
    previewHint: string;
    noEffect: string;
    boardDecided: string;
    committeeDecided: string;
    expiredHint: string;
    youChose: (label: string) => string;
    defaultApplied: (label: string) => string;
    applied: string;
    choiceFailed: string;
    timeCritical: string;
  };
  postMortem: {
    documentLabel: string;
    copy: string;
    copied: string;
    copiedToast: string;
    copyFailedToast: string;
    empty: string;
    actions: string;
  };
  replay: {
    share: string;
    copied: string;
    shareTitle: string;
    copiedToast: string;
    copyFailedToast: string;
    eventCount: (count: number) => string;
    speed: string;
    restart: string;
    timelineLabel: string;
    compliant: string;
    flagged: string;
    actorLabel: string;
    finished: string;
    events: Record<string, string>;
  };
}

export const gameplayModalsEn: GameplayModalsCopy = {
  detail: {
    lifecycleLabel: "Incident lifecycle",
    steps: { new: "New", acknowledged: "Acknowledged", investigated: "Investigated", mitigating: "Mitigating", resolved: "Resolved" },
    nextStep: "Next",
    acknowledging: "Acknowledging…",
    liveMetrics: "Live clocks",
    surcharge: "Surcharge",
    surchargeRate: (amount) => `+${amount}/tick`,
    ticksUnit: "t",
    oscilloscope: "Live Telemetry Oscilloscope",
    errSuffix: "err",
    rootCauseConfirmed: "Root cause confirmed",
    closeAction: "Close",
    mitigationLocked: "Select this incident's service to run a mitigation",
  },
  triage: {
    instruction: "Click the line that proves the root cause",
    keyboardHint: "↑ ↓ to move · Enter to submit",
    boot: (id) => `> attaching to log stream for ${id}…`,
    loading: "Fetching log stream…",
    loadFailed: "Could not load the log stream.",
    retry: "Retry",
    noLines: "No log lines available for this incident.",
    filterLabel: "Filter by log level",
    listLabel: "Log lines",
    hiddenByFilter: (count) => `${count} line(s) hidden by the level filter`,
    slaBleeding: "SLA bleeding",
    openFor: (ticks) => `open ${ticks}t`,
    surchargeAccrued: (amount) => `${amount} so far`,
    surchargeRate: (amount) => `+${amount}/tick`,
    attempts: (count) => `Attempts: ${count}`,
    quality: (pct) => `Reward quality ${pct}%`,
    wrongInline: (pct) => `Not the root cause. Reward quality drops to ${pct}%.`,
    causeLabel: "Root cause",
    causePending: "Root cause logged. Details arrive with the next tick…",
    returning: "Returning to the incident…",
    back: "Back to incident",
    submitting: "Checking…",
  },
  cab: {
    deadline: "Decision deadline",
    secondsLeft: (seconds) => `${seconds}s left`,
    ticksLeft: (ticks) => `${ticks} ticks`,
    resolving: "Resolving…",
    mustDecide: "The board needs an answer. This cannot be dismissed.",
    previewHeading: "Projected effect",
    previewHint: "Hover or focus an option to preview its effect.",
    noEffect: "No immediate change",
    boardDecided: "The board decided…",
    committeeDecided: "The committee decided for you",
    expiredHint: "Time ran out, so the default option was applied.",
    youChose: (label) => `You chose: ${label}`,
    defaultApplied: (label) => `Default applied: ${label}`,
    applied: "Applied",
    choiceFailed: "DECISION NOT REGISTERED — TRY AGAIN",
    timeCritical: "Time is almost up",
  },
  postMortem: {
    documentLabel: "Post-mortem report",
    copy: "Copy",
    copied: "Copied",
    copiedToast: "Post-mortem copied as Markdown",
    copyFailedToast: "Could not copy the post-mortem",
    empty: "This report is empty.",
    actions: "Report actions",
  },
  replay: {
    share: "Share",
    copied: "Copied",
    shareTitle: "Copy the replay as JSON",
    copiedToast: "Replay JSON copied to clipboard",
    copyFailedToast: "Could not copy the replay",
    eventCount: (count) => (count === 1 ? "1 event" : `${count} events`),
    speed: "Speed",
    restart: "Restart",
    timelineLabel: "Incident timeline",
    compliant: "Compliant",
    flagged: "Flagged",
    actorLabel: "by",
    finished: "End of timeline",
    events: {
      INCIDENT_RAISED: "Incident raised",
      INCIDENT_ACKNOWLEDGED: "Alert acknowledged",
      INVESTIGATION_STARTED: "Investigation started",
      ROOT_CAUSE_IDENTIFIED: "Root cause identified",
      RUNBOOK_EXECUTED: "Runbook executed",
      UNATTENDED_ALERT_VIOLATION: "Unattended alert violation",
      SLA_BREACH_EMERGENCY_SANCTION: "SLA breach sanction",
      AI_AUDITOR_INTERVIEW_TURN: "Auditor interview turn",
      AI_AUDITOR_VERDICT_APPLIED: "Auditor verdict applied",
      DILEMMA_OFFERED: "Board dilemma offered",
      DILEMMA_RESOLVED: "Board dilemma resolved",
      ELEVATED_RISK_WINDOW_OPENED: "Elevated risk window opened",
      CHAOS_STRIKE: "Chaos strike",
      DDOS_ATTACK_DETECTED: "DDoS attack detected",
      DEPLOYMENT_REGRESSION_DETECTED: "Deployment regression detected",
      SECOND_REGRESSION_WAVE: "Second regression wave",
      THIRD_PARTY_PROVIDER_OUTAGE: "Third-party provider outage",
      THIRD_PARTY_PROVIDER_RECOVERED: "Third-party provider recovered",
      PATIENT_ZERO_IDENTIFIED: "Patient zero identified",
      FEATURE_FREEZE_ENGAGED: "Feature freeze engaged",
      FEATURE_FREEZE_LIFTED: "Feature freeze lifted",
      SHIFT_ROTATED: "On-call shift rotated",
      SYSTEM_RESTORED: "System restored",
      PROACTIVE_REFACTOR_CYCLE: "Proactive refactor cycle",
    },
  },
};
