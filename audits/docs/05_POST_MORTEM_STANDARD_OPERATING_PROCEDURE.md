# Post-Mortem Standard Operating Procedure

**Document ID:** IZ-SOP-05
**Classification:** Operational Procedure / Compliance Package Exhibit F
**Source of truth:** `backend/app/api/v1/audits.py` (hydration pipeline), `audits/templates/post_mortem_template.md` (template contract), `backend/app/models/incident.py`, `backend/app/models/session.py`

> **Staleness notice:** `backend/app/api/v1/audits.py` has since grown a PDF export endpoint,
> an LLM-driven "AI Auditor" interview flow, and a verdict-application endpoint, none of which
> this SOP describes. As of the hardening pass that added this notice: `apply_interview_verdict`
> now 404s against an incident id that no longer exists in the database (matching the guard the
> other three endpoints in this file already had), and `conduct_interview`'s request body is
> length-bounded and rate-limited per client — both closing gaps this document's sibling specs
> had flagged as open. See `audits/docs/implementations/06_AI_AUDITOR_POSTMORTEM_INTERVIEW_SPEC.md`
> and `commercial/05_EXECUTIVE_PDF_GENERATOR_SPEC.md` for those flows.

---

## 1. Purpose and Scope

This SOP governs the lifecycle of an incident from initial detection through to the generation and archival of its formal post-mortem report. It is the canonical procedure a reviewer should follow to reconstruct, from durable artifacts alone, the complete narrative of any incident that occurred during a simulation session. It also serves as the precise, code-level specification of `GET /api/audits/postmortem/{incident_id}` — the single endpoint responsible for post-mortem generation — so that an auditor can verify every claim made in a rendered report against its actual data provenance rather than assuming the report means what its prose implies.

This document deliberately separates two concerns that are easy to conflate: **§ 2** describes the incident response lifecycle as a process (what happens, in what order, and who/what is responsible for each step); **§ 3** describes the template hydration mechanism as an implementation (exactly how a `{{PLACEHOLDER}}` becomes a rendered value, byte for byte). A reviewer relying on § 2 alone would form an accurate operational picture; a reviewer relying on § 3 alone would form an accurate implementation picture. Both are necessary because, as § 3.4 documents explicitly, several fields in the rendered report do **not** mean what their template prose says they mean.

---

## 2. Incident Response Lifecycle

The lifecycle below tracks the `Incident.status` state machine (`backend/app/models/incident.py`) end to end. Every transition is emitted as a `TICK_BROADCAST` field change and, where noted, as an `audit_logs` row (full schema in the Audit Ledger Data Dictionary, `audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md`).

### 2.1 Stage 1 — Detection (`status: active`)

An incident is created by `SimulationEngine._evaluate_cascading_failures` (Document 02, § 2) when the per-tick hazard roll succeeds against a currently `healthy` service. At creation:

- `Incident.id` is generated as `f"inc-{uuid.uuid4().hex[:6]}"`.
- `Incident.created_tick` is set to `SimulationEngine.current_tick`.
- `Incident.severity` is deterministically assigned from the target service's `tier` (`P1_CRITICAL` for `critical`-tier services, `P2_HIGH` otherwise).
- `Incident.root_cause` is drawn from `event_generator.ROOT_CAUSE_POOL`, an 8-entry fixed pool of narrative root-cause strings (enumerated in full in the Audit Ledger Data Dictionary, § 5).
- `Incident.title` is composed from `event_generator.INCIDENT_TITLE_TEMPLATES` (4 templates) interpolated with the service's display name.
- An `INCIDENT_RAISED` audit event is logged (actor `AUTOMATED_MONITOR`, `compliance_flag=True` — an incident occurring is not itself a compliance violation; only mishandling one is).
- The target service's `status` field is set to `"down"`; `latency_ms` and `error_rate` are driven to degraded values per Document 02, § 2.4.

At this point `Incident.mtta_seconds` and `Incident.mttr_seconds` both begin incrementing by 1 every tick, unconditionally, as computed properties of elapsed ticks since `created_tick` — they are **not** separately-stored counters incremented by discrete events; they are continuously recomputed from `current_tick - created_tick` until frozen (§ 2.2, § 2.3).

### 2.2 Stage 2 — Acknowledgment (`status: active`, unchanged)

A human (or scripted) operator calls `POST /api/incidents/{id}/acknowledge`. This is a **status-preserving** action — acknowledgment does not move `Incident.status` out of `active`; it only:

- Freezes `Incident.mtta_seconds` at its current value (the field stops incrementing from this point forward — this is the field's only write, ever; it is never mutated again for the life of the incident).
- Logs an `INCIDENT_ACKNOWLEDGED` audit event (actor `VP_OF_INFRA`, payload `{"incident_id", "mtta_ticks"}`, `compliance_flag=True`).

**Regulatory significance of this stage:** Document 02, § 4.2 documents that failure to reach this stage before `mtta_seconds` reaches 5 begins an alert-fatigue happiness drain, and failure to reach it before `mtta_seconds` reaches 12 begins an unconditional, recurring $4,500-per-tick `UNATTENDED_ALERT_VIOLATION` fine that continues **every tick** until acknowledgment or resolution — whichever comes first. Acknowledgment is therefore the single highest-leverage action in the entire incident lifecycle from a financial-exposure standpoint, and the SOP's clock for measuring on-call performance runs entirely on this transition.

### 2.3 Stage 3 — Mitigation and Resolution (`status: active → resolved`)

An operator calls `POST /api/mitigations/execute` naming an `action_id` (Document 04's catalog) and a `service_id`. On success:

- A `RUNBOOK_EXECUTED` audit event is logged, carrying the runbook's display `name` (not its `action_id`) in the `action` field.
- Every `Incident` row whose `service_id` matches the target and whose `status` is still `active` is transitioned to `resolved`, with `Incident.resolved_tick` set to the current tick.
- `Incident.mttr_seconds` is frozen at its current value in the same manner as `mtta_seconds` in § 2.2 — it stops incrementing once `resolved_tick` is set.
- The target service is healed instantaneously (Document 04, § 2): `status → "healthy"`, `latency_ms` re-randomized to a nominal band, `error_rate` reset to `0.0001`.

A resolved incident is **not deleted**. It remains a permanent row in the `incidents` table (and its full lifecycle remains reconstructable from the correlated `audit_logs` rows), which is what makes Stage 4 possible at any point after resolution — including, as § 4 documents, **before** resolution as well, since the generation endpoint performs no status check.

### 2.4 Stage 4 — Post-Mortem Generation and Archival

This is the terminal, retrospective stage, initiated on demand (not automatically) via `GET /api/audits/postmortem/{incident_id}`. It is a **read-and-render** operation: it does not mutate `Incident`, `GameSession`, or `AuditLog` state in any way. Its sole side effect is a filesystem write (§ 3.5). This stage is described in full mechanical detail in § 3.

### 2.5 Lifecycle Summary Diagram

```
 [SERVICE: healthy]
        |
        | hazard roll succeeds (Document 02, Formula 2)
        v
 +-------------------+        INCIDENT_RAISED audit event
 |  status: active    |<----- mtta_seconds, mttr_seconds begin
 |  created_tick set  |       incrementing every tick
 +-------------------+
        |
        | POST /api/incidents/{id}/acknowledge
        v
 +-------------------+        INCIDENT_ACKNOWLEDGED audit event
 |  status: active    |<----- mtta_seconds FROZEN
 |  (acknowledged)     |       mttr_seconds still incrementing
 +-------------------+
        |
        | POST /api/mitigations/execute (matching service_id)
        v
 +-------------------+        RUNBOOK_EXECUTED audit event
 |  status: resolved  |<----- mttr_seconds FROZEN
 |  resolved_tick set |       service healed instantaneously
 +-------------------+
        |
        | GET /api/audits/postmortem/{incident_id}   (on demand, any time,
        v                                              even pre-resolution)
 +-------------------------+
 |  audits/reports/         |
 |  {incident_id}.md         |  <-- rendered + persisted, § 3
 |  written (create/overwrite)|
 +-------------------------+
```

### 2.6 Governance Gap — No Status Gate on Report Generation

Neither `generate_postmortem` nor any dependency it calls checks `incident.status` before rendering. An operator (or any unauthenticated caller, per Document 01's Security & Isolation Boundaries — there is no auth layer on this route) can generate a "post-mortem" for an incident that is still `active` and has never been acknowledged or mitigated. In that case the template still renders without error: `{{MTTA}}` and `{{MTTR}}` reflect the still-incrementing live values at the moment of the call rather than frozen final values, `{{ACTION_TICK}}` and `{{MITIGATION_NAME}}` fall back to `mitigation_tick = incident.created_tick` and `mitigation_name = "Manual remediation"` respectively (§ 3.3), and the report's own "Status: Published" header line renders unconditionally regardless of whether the incident is actually resolved. This is recorded here as a control gap: a "published" post-mortem is not evidence that an incident was resolved, only that the endpoint was called.

---

## 3. Template Hydration Pipeline — `audits.py`

### 3.1 Invocation and Path Resolution

`REPO_ROOT` is computed once, at import time, as `Path(__file__).resolve().parents[4]` — four directory levels up from `backend/app/api/v1/audits.py` (`v1` → `api` → `app` → `backend` → repository root). From this, two fixed paths are derived:

- `TEMPLATE_PATH = REPO_ROOT / "audits" / "templates" / "post_mortem_template.md"` — the single, static source template (read fresh from disk on every request; never cached in memory).
- `REPORTS_DIR = REPO_ROOT / "audits" / "reports"` — the output directory (created on demand if absent, § 3.5).

A relocation of `audits.py` to a different directory depth relative to the repository root would silently break both paths (`parents[4]` would resolve to the wrong directory) with no runtime validation catching the misconfiguration until a `FileNotFoundError` is raised on the first template read.

### 3.2 Data Assembly

`generate_postmortem` opens a fresh SQLAlchemy session (`SessionLocal()`), independent of the engine's own in-memory state, and:

1. Loads the `Incident` row by primary key via `db.get(Incident, incident_id)`. A miss raises `HTTPException(404, "Incident not found in the compliance ledger")`.
2. Loads the parent `GameSession` row via `db.get(GameSession, incident.session_id)`. **This is not guarded** — if the session row were ever absent (it cannot be, in practice, given the cascade-delete relationship and the single-session deployment model documented in Document 01, § 5.2, but no defensive check exists), every `session.<field>` access in step 3 would raise `AttributeError` on `None` rather than a handled HTTP error.
3. Executes the mitigation-lookup query described in the Audit Ledger Data Dictionary, § 4 — a `LIKE`-based substring match against `details_json` for the most recent `RUNBOOK_EXECUTED` event whose payload mentions the incident's `service_id`, ordered by `tick` descending. If no such row exists, `mitigation_name` defaults to the literal string `"Manual remediation"` and `mitigation_tick` defaults to `incident.resolved_tick or incident.created_tick`.

### 3.3 The Fifteen Placeholder Substitutions

`_render_template` reads the template file as raw text and performs fifteen sequential, unconditional `str.replace()` calls — one per entry in a fixed `dict[str, str]`. This is **naive string substitution**, not a templating engine: there is no escaping, no conditional blocks, no loops, and no protection against a placeholder token accidentally appearing inside a data value (none currently do, given the fixed vocabularies involved, but nothing structurally prevents it). The complete, exhaustive mapping is reproduced below exactly as implemented:

| Placeholder | Value expression | Rendered meaning — **and, where it diverges, the actual meaning** |
|---|---|---|
| `{{INCIDENT_ID}}` | `incident.id` | The incident's own identifier. Accurate as labeled. |
| `{{ACTOR}}` | the literal string `"VP_OF_INFRA"` | **Hardcoded, not looked up.** The template's byline reads "Author: VP_OF_INFRA (VP of Infrastructure)" regardless of which actor value is actually recorded against the incident's `INCIDENT_ACKNOWLEDGED` audit event (which, per Document 03, is always `VP_OF_INFRA` in the current actor taxonomy in any case — so this hardcoding is currently harmless in practice, but it is not derived from the ledger; it would not update if the actor taxonomy were ever extended to include a second human-operator role). |
| `{{TIMESTAMP}}` | `str(incident.created_tick)` | **Not a timestamp.** Despite the template header rendering this next to the word "Date," the value is the simulation's integer tick counter at incident creation (e.g., `"47"`), not a wall-clock date or ISO-8601 string. No wall-clock time is captured anywhere on the `Incident` model. |
| `{{TICK}}` | `str(incident.resolved_tick or incident.created_tick)` | The resolution tick if resolved, otherwise falls back to the creation tick — meaning an unresolved incident's report header reads the *same* tick value for both "Date/Tick" fields as its creation, which can visually understate elapsed time to a reader who does not cross-reference § 3's MTTA/MTTR fields. |
| `{{SEVERITY}}` | `incident.severity` | `"P1_CRITICAL"` or `"P2_HIGH"`, verbatim. |
| `{{IMPACTED_SERVICES}}` | `incident.service_id` | A single service identifier (e.g., `"srv-payment"`), despite the plural template label "Impacted Services" — the data model has no concept of a multi-service blast radius per incident; each `Incident` row is scoped to exactly one `service_id`. |
| `{{MTTA}}` | `str(incident.mtta_seconds)` | The frozen (or, per § 2.6, still-live) tick count from creation to acknowledgment. Despite the field name's "seconds" suffix (inherited from the underlying column name), the unit is simulation **ticks**, not wall-clock seconds. |
| `{{ACTION_TICK}}` | `str(mitigation_tick)` | The tick of the matched `RUNBOOK_EXECUTED` event, or the resolution/creation-tick fallback described in § 3.2 item 3 if no matching mitigation event was found. |
| `{{MITIGATION_NAME}}` | `mitigation_name` | The matched runbook's display name (e.g., `"Rollback Canary"`), or the literal fallback string `"Manual remediation"` — which renders identically whether an incident was genuinely hand-resolved with no runbook call or whether the `LIKE` lookup simply failed to find a match for a reason unrelated to how it was actually resolved (e.g., a resolution that occurred via a runbook applied to the correct service but whose audit row's JSON happens not to contain the exact `service_id` substring due to a future schema change). |
| `{{MTTR}}` | `str(incident.mttr_seconds)` | The frozen (or, per § 2.6, still-live) tick count from creation to resolution. Same tick-not-seconds caveat as `{{MTTA}}`. |
| `{{ROOT_CAUSE}}` | `incident.root_cause` | Verbatim string from the fixed 8-entry `ROOT_CAUSE_POOL` (Audit Ledger Data Dictionary, § 5), chosen at random at incident-creation time — narrative flavor text, not a diagnosed root cause derived from telemetry. |
| `{{TECH_DEBT}}` | `str(session.tech_debt if session else "n/a")` | The **session's current, present-moment** Technical Debt Index at the time the report is generated — not the TDI value that was in effect when the incident occurred. Generating the same incident's report at two different later ticks can (and, in an active session, generally will) produce two different `{{TECH_DEBT}}` values for the identical, unchanged incident. |
| `{{TOTAL_COST}}` | `f"{total_cost:,.2f}"` where `total_cost = float(session.budget)` | **The session's current remaining budget, not this incident's cost.** Despite the template rendering this under the heading "Total Operational Expense Burn," the value is `GameSession.budget` — the money the organization has *left* — not any incident-attributable or cumulative expenditure figure. A well-resourced session with a high remaining budget will render a *large* dollar figure here even for a trivial, cheaply-resolved incident, which is the semantic inverse of what "Total Operational Expense Burn" implies to a reader. This is the single most significant data-provenance finding in this pipeline. |
| `{{SLA_DELTA}}` | `f"{100 - float(session.sla_percentage):.2f}"` (or `"n/a"` if no session) | **The session-wide cumulative SLA shortfall, not an incident-attributable delta.** This is `100 - sla_percentage` computed over the *entire session's* cumulative SLA integration (Document 02, § 1.3) at the moment of report generation — it is not the marginal SLA impact caused specifically by this incident. A session already carrying an 8% cumulative shortfall from unrelated prior incidents will show `{{SLA_DELTA}} = 8.00` on the report of a brand-new, barely-impactful incident. |
| `{{COMPLIANCE_STATUS}}` | `"Flagged" if incident.mtta_seconds >= 12 else "Clear"` | The one field in the mapping that is both incident-specific and correctly attributable: it reflects whether this incident's own acknowledgment time crossed the 12-tick regulatory threshold documented in Document 02, § 4.2 (the same threshold that triggers `UNATTENDED_ALERT_VIOLATION` fines). This is computed fresh at render time from the frozen `mtta_seconds` value, so it is stable across repeated generations once the incident has been acknowledged. |

### 3.4 Consolidated Data-Provenance Finding

Three of the fifteen fields (`{{TIMESTAMP}}`, `{{TOTAL_COST}}`, `{{SLA_DELTA}}`) render under labels that a reasonable reader — including an external auditor unfamiliar with the implementation — would interpret as incident-scoped, point-in-time facts, when they are in fact either non-temporal (a tick count, not a date) or session-scoped, present-moment aggregates (current budget; current cumulative SLA shortfall) rather than incident-attributable figures. This finding does not indicate data corruption or a defect in the simulation's gameplay logic — the values are exactly what the code intends to compute — but it is a material finding for any party intending to treat these generated post-mortem documents as literal, standalone financial or temporal records of a specific incident, and it should be disclosed as such wherever these reports are cited as audit evidence.

### 3.5 Persistence

`_persist_report` ensures `REPORTS_DIR` exists (`mkdir(parents=True, exist_ok=True)`) and writes the fully-rendered markdown to `audits/reports/{incident_id}.md` via `Path.write_text(..., encoding="utf-8")`. This call **unconditionally overwrites** any existing file at that path with no version suffix, no diff, and no archival of the prior render — calling the endpoint twice against the same incident (for example, once before and once after resolution, per § 2.6) silently destroys the earlier report with no trace that an earlier version ever existed, other than whatever record survives in external version control if the `audits/reports/` directory is tracked by git (it is not required to be, and is git-ignored in the current repository configuration per this task's own findings, meaning the prior render is typically unrecoverable once overwritten).

The endpoint's JSON response echoes both the rendered `markdown` string and the `saved_to` absolute filesystem path, giving the caller immediate confirmation of where the artifact was written without requiring a second round-trip to read it back.

---

## 4. Reviewer Checklist

An auditor validating a specific post-mortem report against ground truth should, at minimum:

1. Confirm the referenced `incident_id` exists in the `incidents` table and cross-check its `status` — a report for a non-`resolved` incident should be treated as provisional per § 2.6.
2. Re-derive `{{MTTA}}` / `{{MTTR}}` independently from the incident's `created_tick`, and (if resolved) its acknowledgment and resolution ticks recoverable from the corresponding `audit_logs` rows, rather than trusting the report's rendered figures in isolation.
3. Treat `{{TOTAL_COST}}` and `{{SLA_DELTA}}` as **session-level context at generation time**, not incident-attributable figures, per § 3.4 — do not cite them as "the cost of this incident" or "the SLA impact of this incident" without independently computing the incident-scoped delta from the audit ledger.
4. Verify `{{MITIGATION_NAME}}` against the actual `RUNBOOK_EXECUTED` audit row (Audit Ledger Data Dictionary, § 3.3) rather than accepting the report's fallback string at face value when no confident match exists.
5. Note the report's file-modification timestamp on disk (an OS-level filesystem fact, not a field the application itself records) as the only reliable indicator of *when* a given `audits/reports/{incident_id}.md` file was actually written, since the report's own `{{TIMESTAMP}}` field (§ 3.3) does not serve this purpose.
