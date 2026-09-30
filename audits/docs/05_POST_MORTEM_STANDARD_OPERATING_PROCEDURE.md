# Post-Mortem Standard Operating Procedure

**Document ID:** IZ-SOP-05  
**Classification:** Operational Procedure / Compliance Package Exhibit F  
**Source of truth:** `backend/app/api/v1/audits.py` (`_build_incident_dossier`, `generate_postmortem`, `generate_postmortem_pdf`), `audits/templates/post_mortem_template.md`  
**Status:** Implementado (Revisão Técnica Atualizada)  
**Last Updated:** Setembro 2026  

---

## 1. Purpose and Scope

This Standard Operating Procedure (SOP) governs the complete incident response lifecycle from alert detection through triage, mitigation, resolution, and the automated generation of factual post-mortem documentation.

A single unified data abstraction — `_build_incident_dossier()` in `backend/app/api/v1/audits.py` — serves as the immutable factual source of truth for:
1. **Markdown Post-Mortem Reports:** Generated via `GET /api/audits/postmortem/{incident_id}` and persisted to `audits/reports/{incident_id}.md`.
2. **Executive PDF Reports:** Generated on demand via `GET /api/audits/postmortem/{incident_id}/pdf` with a 16-character content checksum.
3. **AI Auditor Interviews:** Context feed consumed by `POST /api/audits/interview/{incident_id}`.

All three presentation formats reflect the identical historical facts, guaranteeing total consistency across internal reviews, external audits, and executive briefings.

---

## 2. Incident Response Lifecycle

The incident lifecycle tracks the `Incident.status` state machine in `backend/app/models/incident.py`:

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
    │ Acknowledged  │ ◄────  MTTA clock freezes; MTTR continues
    └───────┬───────┘
            │
            ▼  POST /api/incidents/{id}/investigate (Log Triage)
    ┌───────────────┐        INVESTIGATION_STARTED & ROOT_CAUSE_IDENTIFIED
    │ Investigating │ ◄────  Reveals root cause; discounts mitigation cost
    └───────┬───────┘
            │
            ▼  POST /api/mitigations/execute (Matching Runbook)
    ┌───────────────┐        RUNBOOK_EXECUTED (VP_OF_INFRA)
    │ Status:       │ ◄────  MTTR freezes; tech_debt_at_resolution recorded
    │   resolved    │        Service restored to healthy (if score >= 0.70)
    └───────┬───────┘
            │
            ▼  GET /api/audits/postmortem/{id} & /pdf
    ┌───────────────────────────┐
    │ Incident Dossier Compiled │ ◄──── Immutable facts assembled from
    │   Markdown, PDF, AI Exam  │       incident fields and scoped audit events
    └───────────────────────────┘
```

### 2.1 Stage 1 — Detection (`status: active`)
- Generated when cascading failure hazard roll succeeds or when scripted scenario injects a fault.
- Stamped with `created_tick`, `severity` (`P1_CRITICAL` or `P2_HIGH`), `tech_debt_at_creation = self.tech_debt`, and `status = "active"`.
- Root cause narrative is initialized internally but withheld from wire serialization (`public_incidents()`) until confirmed by investigation.
- MTTA and MTTR advance every tick.

### 2.2 Stage 2 — Acknowledgment
- Triggered by `POST /api/incidents/{id}/acknowledge`.
- Freezes `mtta_seconds` at elapsed ticks; sets `acknowledged_tick`.
- Logs `INCIDENT_ACKNOWLEDGED` (`VP_OF_INFRA`).
- Halts progression toward the 12-tick `UNATTENDED_ALERT_VIOLATION` regulatory fine window.

### 2.3 Stage 3 — Investigation & Root Cause Triage
- Triggered by `POST /api/incidents/{id}/investigate` submitting a log line guess.
- Logs `INVESTIGATION_STARTED`.
- On correct diagnosis, logs `ROOT_CAUSE_IDENTIFIED`, sets `triage_solved = True`, stamps `triage_accuracy`, reveals `root_cause`, and grants cost discounts on subsequent runbooks.
- Wrong guesses inflict $+3.0$ engineer stress and erode triage accuracy.
- **Invariant:** MTTA and MTTR values are elapsed historical facts and are **never** reduced retroactively.

### 2.4 Stage 4 — Mitigation and Resolution (`status: resolved`)
- Triggered by `POST /api/mitigations/execute`.
- Evaluates effectiveness against root cause category.
- When $\text{Effectiveness} \ge 0.70$:
  - Incident transitions to `resolved`, setting `resolved_tick = self.current_tick`.
  - Freezes `mttr_seconds` at elapsed ticks.
  - Stamps `tech_debt_at_resolution = self.tech_debt`.
  - Emits `RUNBOOK_EXECUTED` carrying the specific `incident_id` reference.
  - Active incident surcharge accumulation stops.

---

## 3. Incident Dossier Architecture (`_build_incident_dossier`)

The post-mortem generator rejects the anti-pattern of using live session state (current budget, current global SLA, or current tech debt) to reconstruct an individual incident's past.

### 3.1 Data Provenance Guarantees

| Report Section | Dossier Data Source | Audit & Governance Property |
|---|---|---|
| **Incident Identity** | `incident.id`, `incident.service_id`, `incident.severity`, `incident.title` | Direct primary key and model fields. |
| **Response Timings** | `incident.created_tick`, `incident.acknowledged_tick`, `incident.resolved_tick`, `mtta_seconds`, `mttr_seconds` | Frozen tick counters. Never altered after resolution. |
| **Chronological Timeline** | Scoped `AuditLog` events matching `details_json.incident_id == incident.id` | Factual chronology: alert raised, acknowledged, investigation started, root cause confirmed, mitigations executed, and fines applied. |
| **Root Cause Assertion** | `incident.root_cause` gated by `incident.triage_solved` | **Fact-Gated:** Renders confirmed narrative only if investigation succeeded. If unsolved, states explicitly: *"Not confirmed. No root cause is asserted."* No fabricated 5-Whys. |
| **Financial Impact** | `incident.accrued_surcharge`, sum of scoped runbook costs, breach fines, and AI auditor adjustments | Exact summation of incident-attributable financial events. Explicitly excludes unrelated concurrent session expenses. |
| **Technical Debt Impact** | `tech_debt_at_creation`, `tech_debt_at_resolution`, `tech_debt_delta` | Point-in-time snapshots frozen at creation and resolution. Immune to subsequent session debt fluctuations. |
| **SLA Impact Statement** | Standardized explanatory disclaimer (`SLA_NOT_DETERMINED_NOTE`) | Clarifies that SLA is a topology-wide rolling metric and avoids attributing global SLA shortfall solely to one incident. |
| **Compliance Status** | `formulas.is_unattended_breach(incident.mtta_seconds)` | Deterministic flag: `"Flagged"` if MTTA $\ge 12$, else `"Clear"`. |

---

## 4. Markdown Hydration and PDF Generation

### 4.1 Markdown Report Generation
- **Endpoint:** `GET /api/audits/postmortem/{incident_id}`
- **Output:** Hydrates `audits/templates/post_mortem_template.md` with structured blocks (`{{TIMELINE_BLOCK}}`, `{{ROOT_CAUSE_BLOCK}}`, `{{FINANCIAL_BLOCK}}`, `{{TECH_DEBT_BLOCK}}`, `{{CONCURRENT_CONTEXT_BLOCK}}`).
- **Storage:** Persisted to `audits/reports/{incident_id}.md` (UTF-8).

### 4.2 Executive PDF Generation with Content Checksum
- **Endpoint:** `GET /api/audits/postmortem/{incident_id}/pdf`
- **Output:** Formatted PDF report built via ReportLab.
- **Content Checksum (Integrity Digest):**
  A 16-character SHA-256 digest is computed over the canonical serialized facts of the dossier:
  ```python
  content_checksum = hashlib.sha256(
      json.dumps(canonical_facts, sort_keys=True, default=str).encode("utf-8")
  ).hexdigest()[:16].upper()
  ```
- **Integrity Statement:** The PDF stamps this digest with the explicit disclosure:  
  *"Checksum of this report's own certified facts above — not a certification or cryptographic signature."*  
  This digest detects unauthorized manual modification of report values while avoiding false claims of asymmetric digital PKI signatures.

