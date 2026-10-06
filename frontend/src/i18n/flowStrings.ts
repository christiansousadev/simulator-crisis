// menus & flow strings (title, pause, settings, credits, scenario flow, debrief). Kept in their own
// module and merged into Translations as `flow`, so this area never collides with other agents
// editing translations.ts.
export interface FlowStrings {
  // shared
  loading: string;
  loadFailed: string;
  retry: string;
  confirm: string;
  cancel: string;
  launching: string;
  launchFailed: string;
  deploying: (name: string) => string;
  shiftStarted: (day: number, clock: string) => string;
  // title
  productLine: string;
  startOperation: string;
  startOperationHint: string;
  scenariosHint: string;
  hallOfFameHint: string;
  navLabel: string;
  navHint: string;
  heroBadge: string;
  heroTitle: string;
  heroBody: string;
  ledgerArmed: string;
  serverOnline: string;
  serverConnecting: string;
  serverOffline: string;
  muteAudio: string;
  unmuteAudio: string;
  slaLabel: string;
  cashLabel: string;
  incidentsOpen: (n: number) => string;
  // pause menu
  pauseTitle: string;
  tacticalHold: string;
  resume: string;
  restart: string;
  restartPrompt: string;
  changeMission: string;
  audioDisplayPrefs: string;
  cheatSheet: string;
  exitToTitle: string;
  pauseHint: string;
  runway: string;
  incidents: string;
  openCount: (n: number) => string;
  // settings
  muteEverything: string;
  muteEverythingHint: string;
  motionLabel: string;
  motionSystem: string;
  motionReduced: string;
  motionFull: string;
  motionHint: string;
  shortcutsSection: string;
  shortcutPause: string;
  shortcutRun: string;
  shortcutSpeed: string;
  shortcutCycle: string;
  shortcutTabs: string;
  shortcutDock: string;
  shortcutBuild: string;
  // credits
  creditsDesign: string;
  creditsTech: string;
  creditsPractice: string;
  creditsPracticeLines: string[];
  creditsThanks: string;
  creditsThanksLine: string;
  creditsHoverHint: string;
  // hall of fame
  prestige: string;
  runs: string;
  scopeLabel: string;
  sortLabel: string;
  // scenario select / briefing
  difficultyHeading: string;
  difficultyHint: string;
  cascadeLow: string;
  cascadeModerate: string;
  cascadeSevere: string;
  durationLabel: (ticks: number, days: number) => string;
  sandboxObjectives: string[];
  sandboxConditions: string[];
  surviveWindow: string;
  bestLabel: (sla: number, difficulty: string) => string;
  activeDifficulty: string;
  customScenario: string;
  customDescription: string;
  // scenario builder
  serviceNames: Record<string, string>;
  noInjections: string;
  atTick: (tick: number) => string;
  injectionTime: string;
  injectionTarget: string;
  removeInjection: string;
  copied: string;
  errDuration: string;
  errHazard: string;
  errBudgetFloor: string;
  errInjectionTick: (duration: number) => string;
  hintHazard: string;
  hintBudgetFloor: string;
  fixErrors: (n: number) => string;
  configValid: string;
  // debrief
  skipHint: string;
  stampCertified: string;
  newRecord: string;
  prestigeHeader: string;
  prestigeEarnedRun: (pts: number) => string;
  nextRankAt: (pts: number) => string;
  topRankReached: string;
  prestigeUnavailable: string;
  newAchievementsHeader: string;
  noNewAchievements: string;
  achievementsProgress: (count: number, total: number) => string;
  ticksUnit: (n: number) => string;
  comparisonLoading: string;
}

const clock = (day: number, time: string) => `${day} · ${time}`;

export const flowEn: FlowStrings = {
  loading: "Loading…",
  loadFailed: "Could not reach the server. Check the connection and try again.",
  retry: "Try again",
  confirm: "Confirm",
  cancel: "Cancel",
  launching: "Launching…",
  launchFailed: "Could not start the run. Is the server reachable?",
  deploying: (name) => `Deploying ${name}…`,
  shiftStarted: (day, time) => `Shift started · Day ${clock(day, time)}`,
  productLine: "Crisis Simulator",
  startOperation: "Start operation",
  startOperationHint: "Sandbox shift",
  scenariosHint: "Black Friday · Chaos · Ransomware",
  hallOfFameHint: "Ranks & records",
  navLabel: "Main menu",
  navHint: "↑ ↓ to move · Enter to select",
  heroBadge: "Server-authoritative SRE simulation",
  heroTitle: "Survive cascading microservice failures under real governance pressure.",
  heroBody: "Manage technical debt, on-call fatigue, change advisory dilemmas and AI auditor reviews.",
  ledgerArmed: "SOX-404 ledger armed",
  serverOnline: "Server online",
  serverConnecting: "Connecting…",
  serverOffline: "Server offline · retrying",
  muteAudio: "Mute all audio",
  unmuteAudio: "Unmute all audio",
  slaLabel: "SLA",
  cashLabel: "Cash",
  incidentsOpen: (n) => (n === 0 ? "All clear" : `${n} open incident${n === 1 ? "" : "s"}`),
  pauseTitle: "Simulation paused",
  tacticalHold: "TACTICAL HOLD",
  resume: "Resume simulation",
  restart: "Restart scenario",
  restartPrompt: "Restart the current scenario?",
  changeMission: "Change mission / scenario",
  audioDisplayPrefs: "Audio, display & preferences",
  cheatSheet: "Runbook cheat sheet & tutorial",
  exitToTitle: "Exit to main title screen",
  pauseHint: "Esc resumes. The simulation is held while this menu is open.",
  runway: "RUNWAY",
  incidents: "INCIDENTS",
  openCount: (n) => `${n} OPEN`,
  muteEverything: "Mute everything (sound effects + music)",
  muteEverythingHint: "Master switch. Individual volumes are kept.",
  motionLabel: "Motion",
  motionSystem: "System",
  motionReduced: "Reduced",
  motionFull: "Full",
  motionHint: "Reduced motion shows final states instead of animations. System follows your OS setting.",
  shortcutsSection: "Keyboard shortcuts",
  shortcutPause: "Pause menu / close dialog",
  shortcutRun: "Pause or resume the simulation",
  shortcutSpeed: "Simulation speed",
  shortcutCycle: "Previous / next incident",
  shortcutTabs: "Dock tabs",
  shortcutDock: "Collapse or expand the dock",
  shortcutBuild: "Build mode",
  creditsDesign: "Design & simulation",
  creditsTech: "Built with",
  creditsPractice: "Grounded in",
  creditsPracticeLines: ["SLAs & error budgets", "Cascading failure models", "Change advisory boards", "Audit ledgers & governance"],
  creditsThanks: "Thank you",
  creditsThanksLine: "For keeping production alive.",
  creditsHoverHint: "Hover or focus to pause",
  prestige: "Prestige",
  runs: "Runs",
  scopeLabel: "Record scope",
  sortLabel: "Sort order",
  difficultyHeading: "Simulation operating parameters",
  difficultyHint: "Affects starting runway and incident rate",
  cascadeLow: "Low",
  cascadeModerate: "Moderate",
  cascadeSevere: "Severe",
  durationLabel: (ticks, days) => `${ticks} ticks (${days}d)`,
  sandboxObjectives: [
    "Survive the full 720-tick monthly audit",
    "Keep SLA at or above 99.0%",
    "Stay solvent (runway above $0)",
  ],
  sandboxConditions: [
    "Standard operational failure hazard model",
    "Randomized CAB dilemmas every 45-80 ticks",
    "Quiet periods slowly relieve technical debt",
  ],
  surviveWindow: "Survive the scenario window",
  bestLabel: (sla, difficulty) => `Best: ${sla.toFixed(1)}% (${difficulty})`,
  activeDifficulty: "Active difficulty",
  customScenario: "Custom Scenario",
  customDescription: "A player-built chaos scenario with your own duration, hazard level, budget floor and scheduled failures.",
  serviceNames: {
    "srv-auth": "Authentication",
    "srv-payment": "Payment Gateway",
    "srv-api-gw": "API Gateway",
    "srv-search": "Search",
    "srv-notify": "Notification Dispatcher",
  },
  noInjections: "No scheduled failures yet. Add one to force an incident at a chosen moment.",
  atTick: (tick) => `Tick ${tick}`,
  injectionTime: "Failure time",
  injectionTarget: "Failure target",
  removeInjection: "Remove failure",
  copied: "Copied",
  errDuration: "Duration must be at least 10 ticks.",
  errHazard: "Hazard must be between 0 and 20.",
  errBudgetFloor: "The budget floor must stay below the $250,000 starting runway.",
  errInjectionTick: (duration) => `Must fall before the end of the scenario (tick ${duration}).`,
  hintHazard: "1.0x is the standard failure rate.",
  hintBudgetFloor: "Falling below this runway ends the scenario.",
  fixErrors: (n) => `Fix ${n} issue${n === 1 ? "" : "s"} to continue`,
  configValid: "Configuration is valid",
  skipHint: "Press any key to skip",
  stampCertified: "CERTIFIED",
  newRecord: "NEW RECORD",
  prestigeHeader: "Prestige",
  prestigeEarnedRun: (pts) => `+${pts} prestige this run`,
  nextRankAt: (pts) => `Next rank at ${pts} prestige`,
  topRankReached: "Top rank reached",
  prestigeUnavailable: "This run's prestige is not recorded yet.",
  newAchievementsHeader: "New achievements this run",
  noNewAchievements: "No new achievements this run.",
  achievementsProgress: (count, total) => `${count} / ${total} achievements unlocked`,
  ticksUnit: (n) => `${n} ticks`,
  comparisonLoading: "Loading your history…",
};
