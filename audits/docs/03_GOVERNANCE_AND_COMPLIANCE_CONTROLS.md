# Governance and Compliance Controls

**Document ID:** IZ-GOV-03
**Classification:** Internal Controls Framework / Compliance Package Exhibit C
**Alignment claimed:** SOX-404 (Section 404 internal-control-over-financial-reporting principles, applied here to simulated financial state), SOC 2 Type II (Trust Services Criteria: Processing Integrity, Availability), ISO/IEC 27001 (Annex A control themes: logging and monitoring, A.8.15)
**Scope limitation:** This document evaluates the completeness and traceability of the *action ledger*. It does not assert compliance with authentication, encryption-at-rest, or access-control criteria — those gaps are recorded explicitly in Document 01, § 5.2, and are out of scope here by design.

> **Staleness notice:** the ledger has grown substantially since this document was written —
> new event types now exist for infrastructure placement, achievements/career records, AI
> Auditor interview turns and verdicts, and per-scenario events (e.g. `CHAOS_STRIKE`), among
> others — so any control objective below phrased in terms of "the eight event types" or similar
> closed-set language should be re-verified against `audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md`'s
> own staleness notice and, ultimately, against every `_log_audit_event(...)` call site in
> `backend/app/engine/simulator.py` and `backend/app/api/v1/audits.py`.

---

## 1. Internal Controls Framework

### Control Objective 1 — Audit Trail Completeness

**Control statement:** Every operator-initiated or system-initiated action that changes the state of a game session, a service, or an incident must append exactly one immutable record to `audit_logs` at the moment the action is executed, before the HTTP response (or, for tick-driven events, the next broadcast) is returned.

**Design of the control.** `SimulationEngine._log_audit_event` is the single choke point through which every audit record is created (Document 01, § 5.4, "single writer"). Every code path that mutates governable state calls it synchronously and commits the resulting row before control returns to the caller:

| Trigger | Call site | Event logged |
|---|---|---|
| Operator clicks "Acknowledge" | `acknowledge_incident()` | `INCIDENT_ACKNOWLEDGED` |
| Operator executes a runbook | `apply_mitigation()` | `RUNBOOK_EXECUTED` |
| Engine stochastically raises an incident | `_trigger_service_failure()` | `INCIDENT_RAISED` |
| Tick loop detects MTTA ≥ 12 on an active incident | `_progress_incidents()` | `UNATTENDED_ALERT_VIOLATION` |
| Quiet-period counter reaches a multiple of 20 | `_apply_quiet_period_refactor()` | `PROACTIVE_REFACTOR_CYCLE` |
| Cumulative SLA falls below 99.00% past the grace window | `_evaluate_session_status()` | `SLA_BREACH_EMERGENCY_SANCTION` |
| Budget reaches exactly \$0.00 | `_evaluate_session_status()` | `BANKRUPTCY_LIQUIDATION` |
| Tick 720 reached with SLA ≥ 99.00% | `_evaluate_session_status()` | `MONTHLY_AUDIT_CYCLE_SURVIVED` |

**Operating effectiveness evidence.** Because `_log_audit_event` both appends to the in-memory `self.audit_logs` list *and* commits a matching SQLAlchemy `AuditLog` row within the same function call before returning, the in-memory ledger (visible live via `GET /api/audits` and the last-15 slice inside every `TICK_BROADCAST`) and the durable SQLite ledger can never diverge — there is no code path that updates one without the other. A completeness test for this control is therefore reducible to: for every row inserted into `services` or `incidents` with a changed `status` column between two snapshots, at least one corresponding `audit_logs` row must exist with a `tick` value in the same range and an `event_type` from the table above. No status transition documented in Document 02 occurs outside a function that also calls `_log_audit_event`.

**Explicit exclusion.** `_persist_snapshot`, which upserts `game_sessions` and `services` every tick regardless of whether anything materially changed, does **not** itself generate an audit event. This is an intentional design decision: the ledger records *governable actions and threshold crossings*, not routine telemetry persistence. Recording every tick's snapshot write as an audit event would flood the ledger with non-decisional noise and defeat the purpose of a compliance trail; reviewers should not expect a 1:1 correspondence between tick count and audit-log row count.

### Control Objective 2 — Segregation of Duties and Traceability

**Control statement:** Every audit record must attribute its action to a named actor role, and that role must be consistent with the nature of the triggering event, so that human-initiated actions can be distinguished from automated system actions during a review.

**Actor taxonomy** (the complete, closed set of `actor` values found in the codebase):

| Actor | Nature | Events attributed |
|---|---|---|
| `VP_OF_INFRA` | Human operator (the player) | `INCIDENT_ACKNOWLEDGED`, `RUNBOOK_EXECUTED` |
| `AUTOMATED_MONITOR` | System / synthetic monitoring | `INCIDENT_RAISED` |
| `AUDIT_SYSTEM` | System / automated compliance enforcement | `UNATTENDED_ALERT_VIOLATION`, `SLA_BREACH_EMERGENCY_SANCTION`, `MONTHLY_AUDIT_CYCLE_SURVIVED` |
| `BOARD_OF_DIRECTORS` | Governance authority (escalation terminus) | `BANKRUPTCY_LIQUIDATION` |
| `PLATFORM_TEAM` | System / ambient engineering process | `PROACTIVE_REFACTOR_CYCLE` |

**Segregation-of-duties analysis.** The taxonomy enforces a clean separation between three classes of actor:

1. **The accountable human role** (`VP_OF_INFRA`) is the *only* actor ever attributed to a discretionary, cost-incurring decision (acknowledging an alert or spending budget on a runbook). No system-generated event is ever mis-attributed to the human role, and no human action is ever silently attributed to a system role — the two mutation methods reachable from the REST layer that represent human decisions (`acknowledge_incident`, `apply_mitigation`) hardcode `actor="VP_OF_INFRA"` and no other code path uses that literal.
2. **Detective/automated roles** (`AUTOMATED_MONITOR`, `AUDIT_SYSTEM`) are attributed exclusively to events the tick loop itself decides, with no human input — a reviewer can trust that any `AUDIT_SYSTEM`-attributed row reflects a formula threshold being crossed (Document 02, §§ 1.4 and 4.2), not an operator action being mislabeled.
3. **Escalation/terminal governance** (`BOARD_OF_DIRECTORS`) is reserved for exactly one irreversible event — bankruptcy — modeling the real-world escalation path where operational failure becomes a board-level liquidation decision rather than an infrastructure-team action.

**Traceability chain.** Every `AuditLog` row carries a `session_id` foreign key to `game_sessions.id` and a `tick` integer, which together let a reviewer reconstruct the exact simulated moment and session an action occurred in without relying on wall-clock `timestamp` precision (which is retained as a secondary `DateTime` column, `default=datetime.utcnow`, for real-world chronological ordering, but `tick` is the authoritative in-simulation sequencing key because it is monotonically increasing and immune to system-clock skew).

### Control Objective 3 — Incident SLA Adherence

**Control statement:** The Mean Time to Acknowledge (MTTA) regulatory threshold must be enforced automatically and without exception, and every incident's compliance disposition must be independently derivable from ledger data without relying on operator self-reporting.

**Enforcement mechanism.** As specified in Document 02, § 4.2, `is_unattended_breach` is evaluated unconditionally, every tick, for every incident still in `active` status — there is no code path by which an operator can suppress, dismiss, or override this check. The only way to prevent it from firing is to actually acknowledge the incident (a `VP_OF_INFRA`-attributed action that itself generates its own compliant, `compliance_flag=True` ledger entry).

**Compliance flag semantics.** Every `AuditLog` row carries a boolean `compliance_flag`. The as-implemented semantics, read directly from every `_log_audit_event` call site, are:

| `compliance_flag` | Meaning | Events |
|---|---|---|
| `True` | Governable action executed within policy, or a neutral/positive system event | `INCIDENT_RAISED`, `INCIDENT_ACKNOWLEDGED`, `RUNBOOK_EXECUTED`, `PROACTIVE_REFACTOR_CYCLE`, `MONTHLY_AUDIT_CYCLE_SURVIVED` |
| `False` | A regulatory or financial control has been breached | `UNATTENDED_ALERT_VIOLATION`, `SLA_BREACH_EMERGENCY_SANCTION`, `BANKRUPTCY_LIQUIDATION` |

This flag is what the frontend's Boardroom governance panel and Compliance Ledger tab surface as "clean" vs. "flagged" counts (`t.office.auditSummary` / `t.ledger.cleanFlagged`, computed client-side as a simple filter over `recent_audits` by `compliance_flag`), and it is also the field the post-mortem generator (Document 05) reads to decide whether an incident's `{{COMPLIANCE_STATUS}}` placeholder renders as "Flagged" or "Clear" — though note the post-mortem's own compliance determination is independently recalculated from the incident's `mtta_seconds >= 12`, not read back from the `compliance_flag` column, which is an incident-agnostic property of the *audit event* rather than of the *incident row* itself (an `Incident` has no `compliance_flag` column of its own; only `AuditLog` does).

**Visual rendering (as-implemented, Phase 2 War Room revision).** The Compliance Ledger tab (`frontend/src/components/dock/AuditTicker.tsx`) renders every ledger row over the dock's tactical dark surface (`bg-slate-900/60` per-row card, `border-slate-800/70`), with `compliance_flag` driving the same binary color semantics as before the revision, only recontrasted for the dark register: `compliance_flag=True` renders its `event_type` label in emerald (`text-emerald-400`), and `compliance_flag=False` renders it in a bold crimson (`text-rose-400 font-bold`). This is a presentational recoloring only — no change to which events carry which flag value (§ Compliance flag semantics table above), to the ordering or completeness of `recent_audits`, or to the underlying `AuditLog` schema. The open-incident count badge surfaced elsewhere in the dock (`BottomDock.tsx`) likewise renders as a pulsing rose chip (`bg-rose-500`, `animate-pulse`) to keep an active violation visually salient without altering the count's derivation (`active_incidents.length`, unchanged).

**MTTA/MTTR field provenance.** `mtta_seconds` and `mttr_seconds` (naming carried over from the original real-second design even though the platform now runs on a tick clock; both fields are populated in whole ticks) are advanced exclusively inside `_progress_incidents`, which increments `mttr_seconds` for any incident in `active` or `acknowledged` status and additionally increments `mtta_seconds` only while still `active`. This means `mtta_seconds` is permanently frozen at its acknowledgment-time value the instant an incident is acknowledged — it is a true "time to first response" measurement, not a "time to resolution" measurement, and the two fields diverge exactly at the tick of acknowledgment for every incident that is ever acknowledged before being resolved.

---

## 2. Ledger Tamper-Evident Design

### 2.1 Append-Only Storage Analysis

The `audit_logs` table has no `UPDATE` or `DELETE` statement issued against it anywhere in `backend/app/` outside of the cascading delete described below. Every row's lifecycle from the application's perspective is: created once by `_log_audit_event`, read arbitrarily many times thereafter (`GET /api/audits`, the `TICK_BROADCAST` 15-row slice, and ad-hoc queries inside `generate_postmortem`). This satisfies the structural definition of an append-only ledger at the application layer. Two caveats are recorded for completeness rather than omitted:

1. **No database-level `INSERT`-only trigger or grant restriction exists.** SQLite itself does not enforce append-only semantics; the guarantee is entirely a property of the current application code never issuing a mutating statement against the table. A reviewer with direct file-system or SQL access to `incidentzero.db` could alter or delete rows outside the application. This is consistent with the single-operator, non-multi-tenant deployment model documented in Document 01, § 5.2, and would need to be revisited (e.g., via a separate write-only service account, database-level triggers, or an external write-once log shipper) before this design could satisfy a production-grade SOC 2 tamper-evidence criterion.
2. **Session reset is a logged, explicit cascade — not silent tampering.** `_persist_bootstrap()` (invoked by both engine construction and `POST /api/session/reset`) deletes the existing `GameSession` row for the fixed session id, which cascades via the ORM-level `relationship(..., cascade="all, delete-orphan")` on `GameSession.audit_logs` to remove every prior `AuditLog` row belonging to that session. This is the *only* mechanism by which audit history is ever destroyed, and it is always a consequence of a deliberate, operator- or process-initiated session reset (there is no scheduled or automatic reset trigger anywhere in the codebase). Because the current architecture uses a single fixed `session_id` ("incidentzero-alpha") for the life of the process, a reset genuinely and unrecoverably clears that session's compliance history from the durable store; a production hardening of this control would assign each session run a fresh UUID and retain historical sessions' ledgers indefinitely, converting "reset" from a destructive operation into an "archive and start a new session" operation.

### 2.2 Session Isolation

Every governable row (`services`, `incidents`, `audit_logs`) carries a `session_id` foreign key to `game_sessions.id` with `ondelete="CASCADE"` declared at the SQLAlchemy column level *and* mirrored at the ORM relationship level. In the current single-session deployment this partitioning is not exercised for multi-tenant isolation, but the schema is already shaped to support multiple concurrent `GameSession` rows without any migration, should the engine be extended to key `SimulationEngine` instances by an externally supplied session id rather than the current hardcoded constant.

### 2.3 Audit Trail Export Pipeline

Two export surfaces exist today:

- **`GET /api/audits`** returns the complete, unbounded in-memory `audit_logs` list as JSON — suitable for a compliance reviewer to pull the full session ledger programmatically at any point during a live run.
- **`GET /api/audits/postmortem/{incident_id}`** is a *derived*, incident-scoped export: it does not dump the ledger verbatim but instead correlates a specific `Incident` row with the most recent matching `RUNBOOK_EXECUTED` audit entry (matched by a `LIKE` filter on `details_json` containing the incident's `service_id`, ordered by `tick` descending) and renders a durable Markdown artifact to `audits/reports/{incident_id}.md` on disk (full mechanics in Document 05). This is the only export path that writes to persistent storage outside the SQLite file itself, and it is triggered on demand by a human reviewer action, not automatically.

No export path currently redacts, truncates, or summarizes `details_json` — every exported audit record carries its full original payload, satisfying a completeness expectation for any downstream compliance review that consumes these exports.
