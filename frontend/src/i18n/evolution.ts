// COPY FOR THE EVOLUTION PASS: dock split view, service graph view, stakeholder war room, glossary,
// flight academy modules and causal timeline. One namespace so translations.ts needs one field per locale.

export type StakeholderKind = "ceo_inquiry" | "support_surge" | "legal_sla" | "board_pressure";
export type StatusStage = "investigating" | "identified" | "mitigating";

export interface EvolutionCopy {
  dock: {
    pin: string;
    unpin: string;
    pinnedLabel: (tab: string) => string;
    splitHint: string;
  };
  triage: { dock: string; undock: string };
  stage: {
    showGraph: string;
    showOffice: string;
    graphTitle: string;
    latency: string;
    errors: string;
    noServices: string;
    legendHealthy: string;
    legendDegraded: string;
    legendDown: string;
    dependsOn: string;
    cascadeRisk: string;
    nodeAria: (name: string, status: string) => string;
  };
  warRoom: {
    header: string;
    senders: Record<"CEO" | "SUPPORT" | "LEGAL" | "BOARD", string>;
    messages: Record<StakeholderKind, (service: string) => string>;
    tickLabel: (tick: number) => string;
    answered: string;
    unanswered: string;
    feedEmpty: string;
    statusPage: string;
    statusHint: string;
    noOpenIncidents: string;
    stages: Record<StatusStage, string>;
    posted: string;
    postAction: (stage: string) => string;
    truthfulToast: (stage: string) => string;
    misleadingToast: (stage: string) => string;
    postFailed: string;
    silenceWarning: string;
  };
  radial: {
    quickAck: string;
    throttle: string;
    throttleOk: (name: string) => string;
    throttleFailed: string;
    throttleHint: string;
  };
  traffic: {
    label: string;
    peak: string;
    night: string;
    normal: string;
    hint: (factor: string) => string;
  };
  engineer: {
    level: (n: number) => string;
    xp: (xp: number, toNext: number | null) => string;
    maxLevel: string;
  };
  academy: {
    title: string;
    intro: string;
    moduleLabel: (n: number) => string;
    modules: Array<{ title: string; summary: string }>;
    start: string;
    replay: string;
    done: string;
    glossary: string;
    progress: (done: number, total: number) => string;
    close: string;
    stepLabel: (current: number, total: number) => string;
    moduleComplete: (n: number) => string;
  };
  glossary: {
    title: string;
    searchLabel: string;
    searchPlaceholder: string;
    noResults: string;
    terms: Array<{ id: string; name: string; body: string }>;
  };
  causal: {
    tab: string;
    title: string;
    intro: string;
    categories: Record<"deploy_regression" | "capacity_saturation" | "dependency_fault" | "acute_defect", { name: string; why: string }>;
    nodeCause: string;
    nodeService: string;
    nodeDownstream: string;
    nodeImpact: string;
    notConfirmed: string;
    noDownstream: string;
    impactBody: string;
    bestRunbook: (name: string) => string;
    usedRunbooks: (names: string) => string;
    noRunbook: string;
    lesson: string;
  };
}

export const evolutionEn: EvolutionCopy = {
  dock: {
    pin: "Pin this tab beside the next one",
    unpin: "Unpin split view",
    pinnedLabel: (tab) => `Pinned: ${tab}`,
    splitHint: "Split view: pick another tab to compare",
  },
  triage: { dock: "Dock to the right", undock: "Float in the middle" },
  stage: {
    showGraph: "Service map",
    showOffice: "Office view",
    graphTitle: "Service dependency map",
    latency: "Latency",
    errors: "Errors",
    noServices: "No services to map yet.",
    legendHealthy: "Healthy",
    legendDegraded: "Degraded",
    legendDown: "Down",
    dependsOn: "depends on",
    cascadeRisk: "Cascade risk: a failing dependency multiplies this service's failure odds",
    nodeAria: (name, status) => `${name}: ${status}`,
  },
  warRoom: {
    header: "War Room",
    senders: { CEO: "CEO", SUPPORT: "Customer Support", LEGAL: "Legal & Compliance", BOARD: "Board of Directors" },
    messages: {
      ceo_inquiry: (service) => `Why is ${service} down? I have a customer on the phone. Give me an update.`,
      support_surge: (service) => `Support is getting hundreds of calls a minute about ${service}. What do we tell them?`,
      legal_sla: (service) => `The ${service} outage is putting us near an SLA breach clause. We need a status on record.`,
      board_pressure: (service) => `The board is watching the ${service} incident. Is this under control?`,
    },
    tickLabel: (tick) => `T+${tick}`,
    answered: "Answered",
    unanswered: "Awaiting your update",
    feedEmpty: "All quiet. Stakeholders write in when a serious incident drags on.",
    statusPage: "Public status page",
    statusHint: "Post only what is true: announcing progress that has not happened costs reputation.",
    noOpenIncidents: "No open incident needs a public update.",
    stages: { investigating: "Investigating", identified: "Cause identified", mitigating: "Mitigating" },
    posted: "Posted",
    postAction: (stage) => `Post "${stage}"`,
    truthfulToast: (stage) => `Status page: ${stage}. Customers calm down a little.`,
    misleadingToast: (stage) => `Status page said "${stage}" but the record disagrees. Reputation hit.`,
    postFailed: "The status update was rejected.",
    silenceWarning: "Customers are hearing nothing: satisfaction is falling faster.",
  },
  radial: {
    quickAck: "ACK NOW",
    throttle: "THROTTLE",
    throttleOk: (name) => `Traffic throttled on ${name}: load shed for a few ticks`,
    throttleFailed: "Throttle rejected",
    throttleHint: "Emergency traffic throttling: sheds ~50% of requests, does not fix the cause",
  },
  traffic: {
    label: "Traffic",
    peak: "Peak load",
    night: "Overnight lull",
    normal: "Normal load",
    hint: (factor) => `Traffic x${factor}: outages cost more at peak and fail less overnight`,
  },
  engineer: {
    level: (n) => `Lv ${n}`,
    xp: (xp, toNext) => (toNext === null ? `${xp} XP` : `${xp} XP · ${toNext} to next level`),
    maxLevel: "Max level",
  },
  academy: {
    title: "SRE Flight Academy",
    intro: "Four short missions, each one a skill the job demands. Take them in order or jump to the one you need. The simulation stays paused while you learn.",
    moduleLabel: (n) => `Module ${n}`,
    modules: [
      { title: "Baptism by Fire", summary: "Spot an alert, acknowledge it before the MTTA fine kicks in, and read the incident card." },
      { title: "The Production Detective", summary: "Read the CRT logs, find the root cause, match the runbook to it and see what it cost." },
      { title: "The Budget Guardian", summary: "SLA, error budget, feature freeze, CAB dilemmas and the public status page." },
      { title: "Resilience Engineering", summary: "Put the right specialist on the right rack and harden the topology in Build Mode." },
    ],
    start: "Start",
    replay: "Replay",
    done: "Completed",
    glossary: "Open the glossary",
    progress: (done, total) => `${done} of ${total} modules completed`,
    close: "Close",
    stepLabel: (current, total) => `Step ${current} of ${total}`,
    moduleComplete: (n) => `Module ${n} complete`,
  },
  glossary: {
    title: "Operations Glossary",
    searchLabel: "Search terms",
    searchPlaceholder: "Search: MTTA, error budget, circuit breaker...",
    noResults: "No term matches that search.",
    terms: [
      { id: "mtta", name: "MTTA (Mean Time To Acknowledge)", body: "How long an alert waits before someone acknowledges it. Here it is counted in ticks. At 12 ticks unacknowledged you pay a $4,500 regulatory fine every tick." },
      { id: "mttr", name: "MTTR (Mean Time To Recover)", body: "Time from the alert to the service being healthy again. Every open tick adds an incident surcharge that grows over time." },
      { id: "sla", name: "SLA (Service Level Agreement)", body: "The availability promise made to customers, with consequences when broken. Here: a rolling window of 720 ticks, weighted so critical services count 3x. Below 99.00% regulators fine you." },
      { id: "slo", name: "SLO (Service Level Objective)", body: "The internal target you steer by, stricter than the SLA so you have room to react. Here the benchmark is 99.90%; the gap between it and 100% is your error budget." },
      { id: "errorBudget", name: "Error Budget", body: "The amount of unavailability the SLO allows: 0.10% here. Spend it all and a feature freeze locks risky runbooks until the budget recovers." },
      { id: "featureFreeze", name: "Feature Freeze", body: "An operational lockout when the error budget is gone: no discretionary risky changes. Fixing the incident that is burning the budget is still allowed." },
      { id: "circuitBreaker", name: "Circuit Breaker", body: "Stops calling a failing dependency so its errors do not spread. It fully fixes a dependency fault, and only partly fixes other causes." },
      { id: "blueGreen", name: "Blue/Green & Rollback", body: "Run the new version beside the old one and switch traffic over; if it misbehaves, switch back. A rollback is 100% effective against a bad deploy." },
      { id: "rateLimiting", name: "Rate Limiting & Throttling", body: "Rejecting a share of requests to protect the system. The emergency throttle sheds about half the traffic: it buys time and does not resolve the incident." },
      { id: "techDebt", name: "Technical Debt (TDI)", body: "Shortcuts that make future failures likelier. The failure chance grows with (1 + (TDI / 35)^1.8). Hotfixes add debt; rollbacks and quiet periods pay it down." },
      { id: "cascade", name: "Cascading Failure", body: "One service failing makes the ones that depend on it fail too. A down dependency multiplies a service's failure odds by 3.5x." },
      { id: "cab", name: "CAB (Change Advisory Board)", body: "The governance forum that approves risky changes. Its dilemmas trade cash, tech debt and reputation against each other, and the choice has consequences." },
      { id: "sox", name: "SOX-404", body: "A financial-controls standard. The audit ledger mirrors it: every governed action is recorded once, with an actor, and never edited." },
      { id: "runbook", name: "Runbook", body: "A documented, repeatable response to a known failure. Each one fits some causes better: 70% effectiveness or more fully resolves the incident." },
      { id: "alertFatigue", name: "Alert Fatigue", body: "Too many alarms left unanswered wear people and customers down: satisfaction drops while an alert sits unacknowledged." },
      { id: "statusPage", name: "Status Page", body: "The public record of an incident: investigating, cause identified, mitigating. Honest, timely updates soothe customers; misleading ones cost reputation." },
      { id: "postmortem", name: "Post-mortem", body: "A blameless write-up of what happened and why, built from the incident's own frozen facts. It feeds the audit interview." },
    ],
  },
  causal: {
    tab: "Why it failed",
    title: "Cause and cascade",
    intro: "How this incident unfolded, from the underlying cause to the services that could be dragged along.",
    categories: {
      deploy_regression: { name: "Bad deploy", why: "A new build shipped a defect. Reverting to the last stable version removes it, which is why a rollback fits." },
      capacity_saturation: { name: "Saturated capacity", why: "Demand outgrew the resources. More replicas absorb the load; reverting code would not." },
      dependency_fault: { name: "Failing dependency", why: "A service this one relies on misbehaves. Cutting the call with a circuit breaker contains it." },
      acute_defect: { name: "Code bug", why: "A latent defect in the running code. Only a direct patch reliably fixes it, at the price of tech debt." },
    },
    nodeCause: "Root cause",
    nodeService: "Failed service",
    nodeDownstream: "Services at risk downstream",
    nodeImpact: "Customer impact",
    notConfirmed: "The root cause was not confirmed through log triage, so no cause is asserted.",
    noDownstream: "Nothing depends on this service.",
    impactBody: "Lower availability, a growing surcharge and falling customer satisfaction until the service recovers.",
    bestRunbook: (name) => `Best-fit runbook for this cause: ${name}.`,
    usedRunbooks: (names) => `Runbooks used: ${names}.`,
    noRunbook: "No runbook was executed for this incident.",
    lesson: "Confirm the cause first: it tells you which runbook is a full fix instead of a partial one.",
  },
};
