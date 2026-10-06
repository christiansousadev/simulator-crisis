// COPY FOR THE AI-AUDITOR INTERVIEW TAB INSIDE THE POST-MORTEM DIALOG.
// Own module so the shared translations.ts only needs one field per locale.

export interface AuditorChatCopy {
  tabsLabel: string;
  reportTab: string;
  auditorTab: string;
  heading: string;
  intro: string;
  logLabel: string;
  auditorName: string;
  operatorName: string;
  loadingHistory: string;
  emptyChat: string;
  inputLabel: string;
  placeholder: string;
  send: string;
  sending: string;
  shortcutHint: string;
  counter: (used: number, max: number) => string;
  typing: string;
  verdictLabel: string;
  verdicts: { PENDING: string; VALID: string; JUSTIFIED: string; NON_COMPLIANT: string };
  verdictHints: { PENDING: string; VALID: string; JUSTIFIED: string; NON_COMPLIANT: string };
  proposedNone: string;
  proposedCredit: (amount: string, cap: string) => string;
  proposedFine: (amount: string, cap: string) => string;
  apply: string;
  applying: string;
  applied: string;
  appliedCredit: (amount: string) => string;
  appliedFine: (amount: string) => string;
  appliedUnknown: string;
  appliedToastCredit: (amount: string) => string;
  appliedToastFine: (amount: string) => string;
  appliedToastUnknown: string;
  applyHint: string;
  applyFailed: (message: string) => string;
  notConfiguredTitle: string;
  notConfiguredBody: string;
  notConfiguredHowTo: string;
  rateLimited: string;
  rateLimitedIn: (seconds: number) => string;
  networkError: string;
  genericError: (message: string) => string;
  keptMessage: string;
  retry: string;
  dismiss: string;
}

export const auditorChatEn: AuditorChatCopy = {
  tabsLabel: "Post-mortem sections",
  reportTab: "Report",
  auditorTab: "Auditor",
  heading: "Auditor interview",
  intro:
    "A compliance auditor will question your response. The server, not the AI, decides any fine or credit, capped by severity.",
  logLabel: "Auditor interview transcript",
  auditorName: "Auditor",
  operatorName: "You",
  loadingHistory: "Loading the previous interview…",
  emptyChat: "No questions yet. Open with a short account of what you did and why.",
  inputLabel: "Your answer to the auditor",
  placeholder: "Explain your decisions during this incident…",
  send: "Send",
  sending: "Sending…",
  shortcutHint: "Ctrl/Cmd + Enter to send",
  counter: (used, max) => `${used}/${max}`,
  typing: "The auditor is reviewing your answer",
  verdictLabel: "Verdict",
  verdicts: { PENDING: "Pending", VALID: "Valid", JUSTIFIED: "Justified", NON_COMPLIANT: "Non-compliant" },
  verdictHints: {
    PENDING: "The interview is still open. Nothing can be applied yet.",
    VALID: "Your actions were compliant. A capped credit may be available.",
    JUSTIFIED: "The deviation was justified. A capped credit may be available.",
    NON_COMPLIANT: "Your defense was rejected. A capped fine may be charged.",
  },
  proposedNone: "No adjustment proposed",
  proposedCredit: (amount, cap) => `Proposed: -${amount} credit (cap ${cap})`,
  proposedFine: (amount, cap) => `Proposed: +${amount} fine (cap ${cap})`,
  apply: "Apply verdict",
  applying: "Applying…",
  applied: "Applied",
  appliedCredit: (amount) => `Credit of ${amount} added to the budget`,
  appliedFine: (amount) => `Fine of ${amount} charged to the budget`,
  appliedUnknown: "This verdict was already applied to the budget",
  appliedToastCredit: (amount) => `Auditor credit +${amount}`,
  appliedToastFine: (amount) => `Regulatory fine -${amount}`,
  appliedToastUnknown: "Verdict applied",
  applyHint: "Only a final verdict with a non-zero amount can be applied, once per incident.",
  applyFailed: (message) => `Could not apply the verdict: ${message}`,
  notConfiguredTitle: "The AI auditor is not configured on this server",
  notConfiguredBody: "The interview needs an LLM provider. Without a key this feature stays off and the rest of the game is unaffected.",
  notConfiguredHowTo:
    "To enable it, set LLM_API_KEY (plus LLM_API_BASE_URL and optionally LLM_MODEL_ID) in the backend environment, see .env.example, then restart the server.",
  rateLimited: "Too many requests, wait a moment.",
  rateLimitedIn: (seconds) => `Too many requests, wait ${seconds}s before trying again.`,
  networkError: "Could not reach the server.",
  genericError: (message) => `The auditor could not answer: ${message}`,
  keptMessage: "Your message was kept in the box.",
  retry: "Retry",
  dismiss: "Dismiss",
};
