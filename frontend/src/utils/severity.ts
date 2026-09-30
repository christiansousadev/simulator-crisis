// shared incident-severity presentation tokens, used by incident cards, the detail modal and the
// office scene (server rack ring/glow) so all three read severity the same way instead of each
// component inventing its own P1/P2/P3/P4 color mapping.

import { IncidentSeverity } from "../types/game";

export interface SeverityTone {
  /** badge background/text/border, e.g. for SeverityBadge */
  badge: string;
  /** card/panel border + ambient glow, e.g. for an incident card or the office rack ring */
  ring: string;
  /** raw rgba color for svg drop-shadow/glow filters in the office scene */
  glow: string;
  /** true for the top severity tier, where fx should read faster/more urgent */
  urgent: boolean;
}

const TONES: Record<IncidentSeverity, SeverityTone> = {
  P1_CRITICAL: {
    badge: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    ring: "border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.18)] bg-rose-950/20",
    glow: "rgba(244,63,94,0.9)",
    urgent: true,
  },
  P2_HIGH: {
    badge: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    ring: "border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.12)] bg-amber-950/20",
    glow: "rgba(245,158,11,0.85)",
    urgent: false,
  },
  P3_MEDIUM: {
    badge: "bg-yellow-500/15 text-yellow-300 border-yellow-500/40",
    ring: "border-yellow-500/40 bg-yellow-950/10",
    glow: "rgba(234,179,8,0.75)",
    urgent: false,
  },
  P4_LOW: {
    badge: "bg-slate-500/15 text-slate-300 border-slate-500/40",
    ring: "border-slate-600/40",
    glow: "rgba(148,163,184,0.6)",
    urgent: false,
  },
};

// falls back to P2's tone for a future/unknown severity value rather than throwing
export function severityTone(severity: IncidentSeverity): SeverityTone {
  return TONES[severity] ?? TONES.P2_HIGH;
}

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  P1_CRITICAL: 4,
  P2_HIGH: 3,
  P3_MEDIUM: 2,
  P4_LOW: 1,
};

// picks the worst (highest-priority) severity among several incidents against the same service,
// so a rack with more than one active incident still shows a single, correct highlight
export function highestSeverity(severities: IncidentSeverity[]): IncidentSeverity | null {
  if (severities.length === 0) return null;
  return severities.reduce((worst, s) => (SEVERITY_RANK[s] > SEVERITY_RANK[worst] ? s : worst));
}
