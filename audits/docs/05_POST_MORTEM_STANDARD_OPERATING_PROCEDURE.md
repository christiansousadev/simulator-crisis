# Post-Mortem Standard Operating Procedure

**Document ID:** IZ-SOP-05  
**Classification:** Operational Procedure / Compliance Package Exhibit F  
**Source of truth:** `backend/app/api/v1/audits.py` (`_build_incident_dossier`, `generate_postmortem`, `export_postmortem_pdf`, `conduct_interview`, `apply_interview_verdict`), `audits/templates/post_mortem_template.md`  
**Status:** Implementado (Revisão Técnica Atualizada)  
**Last Updated:** Outubro 2026  
**Verification note (Outubro 2026):** endpoint paths, dossier fields, report/transcript locations and the checksum construction were re-read against `backend/app/api/v1/audits.py` and the engine methods that emit the scoped events. The PDF layout and the LLM interview were not re-run for this revision.

---

## 1. Purpose and Scope

This Standard Operating Procedure (SOP) governs the complete incident response lifecycle from alert detection through triage, mitigation, resolution, and the automated generation of factual post-mortem documentation.

A single unified data abstraction — `_build_incident_dossier()` in `backend/app/api/v1/audits.py` — serves as the factual source of truth for:
1. **Markdown Post-Mortem Reports:** Generated via `GET /api/audits/postmortem/{incident_id}` and persisted to `audits/reports/{incident_id}.md`.
2. **Executive PDF Reports:** Generated on demand via `GET /api/audits/postmortem/{incident_id}/export-pdf` with a 16-character content checksum.
3. **AI Auditor Interviews:** Context feed (dossier plus a clearly labelled session-wide snapshot) consumed by `POST /api/audits/postmortem/{incident_id}/interview`; its financial verdict is applied separately through `POST /api/audits/postmortem/{incident_id}/interview/apply-verdict`.

The three presentation formats read the same dossier function, so they report the same facts for the same incident (the PDF additionally prints the session SLA at export time, explicitly labelled as session-wide). The dossier is built only from the incident's own frozen columns and from audit events tagged with its exact `incident_id`, which is what makes repeated generation reproducible.

---

## 2. Incident Response Lifecycle

The incident lifecycle tracks the `Incident.status` values written by the engine (`active`, `acknowledged`, `resolved`) in `backend/app/models/incident.py`. Investigation is not a status: it is tracked by `triage_solved`, `triage_wrong_attempts` and `triage_accuracy` on an `active` or `acknowledged` incident.

```
 [Service Outage Detected]
            │
            ▼
    ┌───────────────┐        INCIDENT_RAISED (AUTOMATED_MONITOR)
    │ Status: active│ ◄────  MTTA & MTTR clocks start
    └───────┬───────┘
            │
            ▼  POST /api/incidents/{id}/acknowledge
    ┌───────────────┐        INCIDENT_ACKNOWLEDGED (VP_OF_INFRA)
    │ acknowledged  │ ◄────  MTTA clock freezes; MTTR continues
    └───────┬───────┘
            │
            ▼  POST /api/incidents/{id}/triage (Log Triage; may start while still active)
    ┌───────────────┐        INVESTIGATION_STARTED (first attempt)
    │ triage_solved │ ◄────  ROOT_CAUSE_IDENTIFIED reveals root cause;
    │   = true      │        discounts and boosts the next mitigation
    └───────┬───────┘
            │
            ▼  POST /api/mitigations/execute (Matching Runbook)
    ┌───────────────┐        RUNBOOK_EXECUTED (VP_OF_INFRA)
    │ Status:       │ ◄────  MTTR freezes; tech_debt_at_resolution recorded
    │   resolved    │        Service restored to healthy (if effectiveness >= 0.70)
    └───────┬───────┘
            │
            ▼  GET /api/audits/postmortem/{id}  |  .../{id}/export-pdf  |  POST .../{id}/interview
    ┌───────────────────────────┐
    │ Incident Dossier Compiled │ ◄──── Facts assembled from incident columns
    │   Markdown, PDF, AI Exam  │       and incident_id-scoped audit events
    └───────────────────────────┘
```

Triage and acknowledgement are independent: the engine allows a triage submission on any open incident, and a runbook may resolve an incident that was never acknowledged or investigated (the dossier then states what was not done).

### 2.1 Stage 1 — Detection (`status: active`)
- Generated when the cascading failure hazard roll succeeds (directly, or 5 ticks later when a `PRE_ALERT_WARNING` was issued), when a scripted/custom scenario injects a fault, or when the guided tutorial stages its deterministic incident (`POST /api/tutorial/incident`).
- Stamped with `created_tick`, `severity` (`P1_CRITICAL` for critical-tier services, `P2_HIGH` for standard-tier ones), `tech_debt_at_creation = self.tech_debt`, and `status = "active"`; the incident row and its `INCIDENT_RAISED` event are committed together.
- Root cause narrative is initialized internally but withheld from wire serialization (`public_incidents()`) until confirmed by investigation.
- MTTA (while `active`) and MTTR (while `active` or `acknowledged`) advance every tick.

### 2.2 Stage 2 — Acknowledgment
- Triggered by `POST /api/incidents/{id}/acknowledge` (only an `active` incident can be acknowledged).
- Freezes `mtta_seconds` at elapsed ticks; sets `acknowledged_tick`.
- Logs `INCIDENT_ACKNOWLEDGED` (`VP_OF_INFRA`).
- Halts progression toward the 12-tick `UNATTENDED_ALERT_VIOLATION` regulatory fine window (the engine tests an effective MTTA; see Document 02, § 0).

### 2.3 Stage 3 — Investigation & Root Cause Triage
- Triggered by `POST /api/incidents/{id}/triage` submitting a log line guess (`line_id`). The synthetic log stream is available from `GET /api/incidents/{id}/logs`.
- The first submission logs `INVESTIGATION_STARTED`.
- On correct diagnosis, logs `ROOT_CAUSE_IDENTIFIED`, sets `triage_solved = True`, stamps `triage_accuracy = max(0.15, 1 - 0.22 × wrong_attempts)`, reveals `root_cause`, and grants a cost discount of $\text{accuracy} \times 50\%$ plus an additive $+0.15 \times \text{accuracy}$ effectiveness bonus on the next runbook on that service.
- Wrong guesses inflict $+3.0$ stress on the engineer assigned to the service (if any) and erode triage accuracy.
- **Invariant:** MTTA and MTTR values are elapsed historical facts and are **never** reduced retroactively.

### 2.4 Stage 4 — Mitigation and Resolution (`status: resolved`)
- Triggered by `POST /api/mitigations/execute`.
- Evaluates effectiveness against the root cause category (Document 04, § 3).
- When $\text{Effectiveness} \ge 0.70$:
  - Every `active`/`acknowledged` incident on the target service transitions to `resolved`, setting `resolved_tick = self.current_tick`.
  - Freezes `mttr_seconds` at elapsed ticks.
  - Stamps `tech_debt_at_resolution = self.tech_debt` (after the runbook's own TDI delta).
  - Emits `RUNBOOK_EXECUTED` carrying the specific `incident_id` reference (the first matching open incident on that service).
  - Active incident surcharge accumulation stops; the resolved incident leaves the live list but stays in the database for post-mortems.
- When $\text{Effectiveness} < 0.70$ the incident stays open, `RUNBOOK_EXECUTED` is still logged with `fully_resolved=false`, and a mismatch tech-debt tax applies.

---

## 3. Incident Dossier Architecture (`_build_incident_dossier`)

The post-mortem generator rejects the anti-pattern of using live session state (current budget, current global SLA, or current tech debt) to reconstruct an individual incident's past.

### 3.1 Data Provenance Guarantees

| Report Section | Dossier Data Source | Audit & Governance Property |
|---|---|---|
| **Incident Identity** | `incident.id`, `incident.service_id`, `incident.severity`, `incident.title`, `incident.status` | Direct primary key and model fields. |
| **Response Timings** | `incident.created_tick`, `incident.acknowledged_tick`, `incident.resolved_tick`, `mtta_seconds`, `mttr_seconds` | Frozen tick counters. Never altered after resolution. |
| **Chronological Timeline** | `created`, `acknowledged` and `resolved` entries come from the incident's own tick columns; `investigation_started`, `root_cause_confirmed`, `mitigation_executed`, `regulatory_breach` and `ai_auditor_verdict_applied` entries come from `AuditLog` events of types `INVESTIGATION_STARTED`, `ROOT_CAUSE_IDENTIFIED`, `RUNBOOK_EXECUTED`, `UNATTENDED_ALERT_VIOLATION`, `AI_AUDITOR_VERDICT_APPLIED` whose `details_json.incident_id == incident.id` (exact match, never a service-id guess) | Factual chronology sorted by tick. Absence of a phase means it never occurred or predates forensic tracking; nothing is inferred. |
| **Root Cause Assertion** | `incident.root_cause` gated by `incident.triage_solved` | **Fact-Gated:** Renders the confirmed narrative only if investigation succeeded. If unsolved, states explicitly that no root cause is asserted (*"Not confirmed. Either the service was restored before an investigation concluded, or no investigation was ever started for this incident. No root cause is asserted."*). No fabricated 5-Whys. |
| **Financial Impact** | `incident.accrued_surcharge`, sum of scoped `RUNBOOK_EXECUTED` costs, scoped `UNATTENDED_ALERT_VIOLATION` fines, scoped AI auditor adjustments | $\text{Total} = \text{surcharge} + \text{mitigation cost} + \text{regulatory fines} - \text{auditor credits}$. Explicitly excludes passive burn and the cost of other concurrent incidents. |
| **Technical Debt Impact** | `tech_debt_at_creation`, `tech_debt_at_resolution`, `tech_debt_delta` | Point-in-time snapshots frozen at creation and resolution. Immune to subsequent session debt fluctuations; rendered as "not yet resolved" or "not recorded" when a value is missing. |
| **SLA Impact Statement** | Standardized explanatory disclaimer (`SLA_NOT_DETERMINED_NOTE`) | Clarifies that SLA is a topology-wide rolling metric and avoids attributing global SLA shortfall solely to one incident. |
| **Concurrent Context** | Session-wide events of types `SLA_BREACH_EMERGENCY_SANCTION`, `FEATURE_FREEZE_ENGAGED`, `FEATURE_FREEZE_LIFTED`, `DILEMMA_OFFERED`, `DILEMMA_RESOLVED`, `ELEVATED_RISK_WINDOW_OPENED` with `created_tick <= tick <= resolved_tick` (or `created_tick + 50` while open) | Labelled as context only; never folded into the incident's own timeline or financial impact. |
| **Compliance Status** | `formulas.is_unattended_breach(incident.mtta_seconds)` | Deterministic flag on the raw MTTA counter: `"Flagged"` if MTTA $\ge 12$, else `"Clear"`. |

---

## 4. Markdown Hydration, PDF Generation and AI Interview

### 4.1 Markdown Report Generation
- **Endpoint:** `GET /api/audits/postmortem/{incident_id}` (`404` when the incident is not in the ledger).
- **Output:** Hydrates `audits/templates/post_mortem_template.md` by replacing the placeholders `{{INCIDENT_ID}}`, `{{REPORT_STATUS}}`, `{{ACTOR}}`, `{{GENERATED_TICK}}`, `{{SEVERITY}}`, `{{IMPACTED_SERVICES}}`, `{{INCIDENT_STATUS}}`, `{{EXECUTIVE_SUMMARY}}`, `{{TIMELINE_BLOCK}}`, `{{ROOT_CAUSE_BLOCK}}`, `{{FINANCIAL_BLOCK}}`, `{{SLA_NOTE}}`, `{{TECH_DEBT_BLOCK}}`, `{{CONCURRENT_CONTEXT_BLOCK}}` and `{{COMPLIANCE_STATUS}}`. `REPORT_STATUS` is `Published` for a resolved incident and `Draft (incident still open)` otherwise. Section 9 (preventative action items) is deliberately left for human judgment.
- **Response:** `{"incident_id", "markdown", "saved_to"}`.
- **Storage:** Persisted to `<repo root>/audits/reports/{incident_id}.md` (UTF-8, overwritten on every generation).

### 4.2 Executive PDF Generation with Content Checksum
- **Endpoint:** `GET /api/audits/postmortem/{incident_id}/export-pdf`; the response is `application/pdf` with `Content-Disposition: attachment; filename="postmortem_{incident_id}.pdf"`.
- **Output:** A single-page, Letter-size PDF built with ReportLab: executive summary, session SLA bar (labelled as session-wide, at export time), incident-scoped timeline (truncated to the page), financial cost accounting, and the checksum seal.
- **Content Checksum (Integrity Digest):**
  A 16-character hexadecimal (uppercase) SHA-256 prefix is computed over the canonical JSON (`sort_keys=True`) of 13 dossier facts: `incident_id`, `service_id`, `severity`, `status`, `root_cause_confirmed`, `root_cause`, `mtta_ticks`, `mttr_ticks`, `tech_debt_at_creation`, `tech_debt_at_resolution`, `financial_impact_total`, `mitigations` and `compliance_status`:
  ```python
  content_checksum = hashlib.sha256(
      json.dumps(canonical_facts, sort_keys=True, default=str).encode("utf-8")
  ).hexdigest()[:16].upper()
  ```
  The export timestamp and the session SLA are printed on the page but are **not** part of the digest.
- **Integrity Statement:** The PDF stamps the digest with the explicit disclosure:  
  *"Checksum of this report's own certified facts above -- not a certification or cryptographic signature."*  
  The digest is plain, unsalted and unkeyed, so anyone holding the same 13 visible facts can recompute it. It can only reveal an accidental mismatch between what is printed and what was claimed; it does **not** authenticate the issuer and does **not** resist a deliberate editor who recomputes the hash.

### 4.3 AI Auditor Interview
- **Turn endpoint:** `POST /api/audits/postmortem/{incident_id}/interview` with a `message` of 1-2000 characters. Answers `503` while `LLM_API_KEY` is empty and `429` after 10 calls within 60 seconds from the same client address (in-process limiter). The configured model (`LLM_API_BASE_URL`, `LLM_MODEL_ID`) receives the dossier plus the transcript; its JSON reply is validated (verdict in `PENDING | VALID | JUSTIFIED | NON_COMPLIANT`, reply truncated to 4,000 characters) and any malformed or failed call degrades to a neutral `PENDING` reply.
- **Persistence:** the transcript is written to `audits/interviews/{incident_id}.json` and the latest verdict to `audits/interviews/{incident_id}.verdict.json` (both created on demand); each turn also appends an `AI_AUDITOR_INTERVIEW_TURN` audit row.
- **Applying a verdict:** `POST .../interview/apply-verdict` refuses (`400`) when the incident belongs to a different session than the live one, when no concluded (non-`PENDING`) verdict exists, or when that verdict was already applied (checked both in the cache file and against `AI_AUDITOR_VERDICT_APPLIED` rows). The amount is re-derived with `formulas.eligible_audit_adjustment` against a severity ceiling and routed through `_apply_financial_event`.
