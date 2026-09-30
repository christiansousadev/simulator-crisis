# Governance and Compliance Controls

**Document ID:** IZ-GOV-03  
**Classification:** Internal Controls Framework / Compliance Package Exhibit C  
**Alignment claimed:** SOX-404 (Section 404 internal-control-over-financial-reporting principles, applied to simulated financial state), SOC 2 Type II (Trust Services Criteria: Processing Integrity, Availability), ISO/IEC 27001 (Annex A control themes: logging and monitoring, A.8.15)  
**Scope limitation:** This document evaluates the completeness, immutability, and traceability of the *action ledger*. It does not assert compliance with multi-tenant authentication, encryption-at-rest, or RBAC — those boundaries are recorded explicitly in Document 01, § 5.2, and are out of scope by design.  
**Status:** Implementado (Revisão Técnica Atualizada)  
**Last Updated:** Setembro 2026  

---

## 1. Internal Controls Framework

### Control Objective 1 — Audit Trail Completeness

**Control statement:** Every operator-initiated or system-initiated action that changes the state of a game session, a service, staff assignments, infrastructure topology, governance reputation, or an incident must append an immutable record to `audit_logs` at the moment the action is executed.

**Design of the control.** `SimulationEngine._log_audit_event` is the single choke point through which every audit record is created. Every code path mutating governable state calls it synchronously and commits the resulting row within thread-safe transaction locks (`_db_write_lock`):

| Trigger | Call site | Event logged | Compliance Flag |
|---|---|---|---|
| Stochastic failure triggers outage | `_trigger_service_failure()` | `INCIDENT_RAISED` | `True` |
| Operator acknowledges incident | `acknowledge_incident()` | `INCIDENT_ACKNOWLEDGED` | `True` |
| Operator initiates investigation | `submit_triage()` | `INVESTIGATION_STARTED` | `True` |
| Log triage identifies correct root cause | `submit_triage()` | `ROOT_CAUSE_IDENTIFIED` | `True` |
| Operator executes runbook action | `apply_mitigation()` | `RUNBOOK_EXECUTED` | `True` |
| Operator resolves CAB dilemma | `resolve_dilemma()` | `DILEMMA_RESOLVED` | `choice["tech_debt_delta"] <= 5` |
| CAB dilemma triggers elevated risk | `resolve_dilemma()` | `ELEVATED_RISK_WINDOW_OPENED` | `False` |
| Periodic CAB dilemma offered | `_evaluate_cab_dilemma()` | `DILEMMA_OFFERED` | `True` |
| Operator purchases tech-tree upgrade | `purchase_upgrade()` | `UPGRADE_PURCHASED` | `True` |
| Operator places infrastructure node | `place_infrastructure_node()` | `INFRASTRUCTURE_NODE_PLACED` | `True` |
| Operator removes infrastructure node | `remove_infrastructure_node()` | `INFRASTRUCTURE_NODE_REMOVED` | `True` |
| Operator hires an engineer | `hire_engineer()` | `ENGINEER_HIRED` | `True` |
| Operator rotates engineer shift | `rotate_shift()` | `SHIFT_ROTATED` | `True` |
| Scripted chaos drill injects failure | `ChaosEngineeringDrillScenario.on_tick()` | `CHAOS_STRIKE` | `True` |
| Ransomware initial entry point identified | `RansomwareInfiltrationScenario.on_start()` | `PATIENT_ZERO_IDENTIFIED` | `False` |
| Scenario concludes (win or loss) | `_evaluate_session_status()` | `SCENARIO_CONCLUDED` | `outcome["compliant"]` |
| Quiet period refactor cycle completes | `_apply_quiet_period_refactor()` | `PROACTIVE_REFACTOR_CYCLE` | `True` |
| Monthly survival milestone reached | `_evaluate_session_status()` | `MONTHLY_AUDIT_CYCLE_SURVIVED` | `True` |
| Achievement unlock condition met | `_evaluate_achievements()` | `ACHIEVEMENT_UNLOCKED` | `True` |
| Cosmetic unlock condition met | `unlock_cosmetic()` | `COSMETIC_UNLOCKED` | `True` |
| Post-mortem interview turn completed | `_persist_interview_event()` | `AI_AUDITOR_INTERVIEW_TURN` | `verdict != "NON_COMPLIANT"` |
| AI auditor applies financial verdict | `apply_interview_verdict()` | `AI_AUDITOR_VERDICT_APPLIED` | `verdict != "NON_COMPLIANT"` |
| Error budget exhausted | `_evaluate_feature_freeze()` | `FEATURE_FREEZE_ENGAGED` | `False` |
| Error budget recovered | `_evaluate_feature_freeze()` | `FEATURE_FREEZE_LIFTED` | `True` |
| MTTA exceeds 12 ticks | `_progress_incidents()` | `UNATTENDED_ALERT_VIOLATION` | `False` |
| Rolling window SLA falls below 99.00% (after 24-tick grace period) | `_evaluate_session_status()` | `SLA_BREACH_EMERGENCY_SANCTION` | `False` |
| Budget reaches zero | `_evaluate_session_status()` | `BANKRUPTCY_LIQUIDATION` | `False` |
| Session restored from snapshot | `_try_restore_from_snapshot()` | `SYSTEM_RESTORED` | `True` |
| Incompatible snapshot schema quarantined | `_try_restore_from_snapshot()` | `SNAPSHOT_VERSION_MISMATCH` | `False` |

**Operating effectiveness evidence.** `_log_audit_event` appends to `self.audit_logs` in memory and commits a persistent SQLAlchemy `AuditLog` row in SQLite. In-memory live views (`GET /api/audits` and `TICK_BROADCAST`) remain strictly in sync with the persistent ledger.

**Explicit exclusion.** Routine per-tick state snapshots (`_persist_snapshot`), passive operational burn, and tick-by-tick incident surcharges do **not** generate individual audit events. Routine burn and per-tick surcharges are accounted for in the durable session cash balance (`GameSession.budget`) and per-incident accruals (`Incident.accrued_surcharge`); recording every tick would flood the ledger with non-decisional noise.

### Control Objective 2 — Segregation of Duties and Traceability

**Actor taxonomy** (the authoritative set of roles emitted across the codebase):

| Actor | Nature | Scope of Authority |
|---|---|---|
| `VP_OF_INFRA` | Human operator | Operational commands: incident acknowledgment, investigation triage, runbook execution, tech upgrades, infrastructure placement/removal, engineer hiring/shift rotation, cosmetic unlocks, and CAB dilemma choices. |
| `AUTOMATED_MONITOR` | System telemetry | Automated alert generation (`INCIDENT_RAISED`), chaos strikes (`CHAOS_STRIKE`), and security detection (`PATIENT_ZERO_IDENTIFIED`). |
| `AUDIT_SYSTEM` | System compliance | Automated policy enforcement: MTTA unattended violations, SLA breach emergency sanctions, feature freeze triggers, risk windows, scenario outcomes, monthly survival, achievements, and AI auditor verdict enforcement. |
| `BOARD_OF_DIRECTORS` | Corporate authority | Financial liquidation (`BANKRUPTCY_LIQUIDATION`), offering CAB dilemmas (`DILEMMA_OFFERED`), and auto-resolving expired dilemmas. |
| `PLATFORM_TEAM` | Background engineering | Proactive technical debt refactoring cycles (`PROACTIVE_REFACTOR_CYCLE`). |
| `PLATFORM` | Core runtime platform | State restoration (`SYSTEM_RESTORED`) and incompatible snapshot quarantine (`SNAPSHOT_VERSION_MISMATCH`). |

**Traceability chain:** Every `AuditLog` row stores `session_id`, `tick`, `timestamp`, `actor`, `event_type`, `description`, `compliance_flag`, and a structured JSON payload (`details_json`). `tick` serves as the monotonic simulation sequencing key, completely immune to wall-clock drift.

### Control Objective 3 — Incident SLA Adherence & Non-Repudiation

**Enforcement:**
- `is_unattended_breach(mtta_ticks)` is checked every tick for all `active` (unacknowledged) incidents once MTTA reaches 12 ticks.
- Each unattended tick emits an `UNATTENDED_ALERT_VIOLATION` with `compliance_flag=False` and levies a \$4,500 fine.
- MTTA and MTTR advance in whole ticks. Acknowledging an incident freezes MTTA. Resolving an incident freezes MTTR and halts surcharge accumulation.

**Compliance Flag Semantics:**
- `compliance_flag=True`: Actions executed within compliance policy or positive system achievements.
- `compliance_flag=False`: Policy violations (unattended alerts, regulatory SLA breaches, bankruptcy, unmitigated AI auditor findings, incompatible snapshot schema mismatches).

---

## 2. Ledger Tamper-Evident Design

### 2.1 Append-Only Storage Analysis
The application issues only `INSERT` statements (`db.add()`) against `audit_logs`. No endpoint or background task issues `UPDATE` or `DELETE` against audit rows.
- **Session Reset:** Session resets perform an explicit cascade deletion of the prior run's rows via foreign keys, logging `SESSION_RESET`.
- **Incompatible Snapshot Quarantine:** If a snapshot from an incompatible schema version is encountered during boot (`_try_restore_from_snapshot()` detecting `schema_version != CURRENT_SCHEMA_VERSION`):
  1. The incompatible session and historical child records (`Incident`, `AuditLog`, `Engineer`, `PurchasedUpgrade`, `DilemmaEvent`, `InfrastructureNode`) have their primary/foreign keys re-keyed to a distinct quarantine identifier: `quarantine_id = f"{self.session_id}-incompatible-{uuid.uuid4().hex[:8]}"`.
  2. Fixed catalog `Service` rows are deleted to prevent catalog primary-key collisions with the replacement session.
  3. A `SNAPSHOT_VERSION_MISMATCH` audit event (`actor="PLATFORM"`, `compliance_flag=False`, detailing `found_version` and `expected_version`) is durably recorded and preserved with the quarantined session.
  4. The original `session_id` is thereby completely freed in the database.
  5. `_try_restore_from_snapshot()` returns `False`, causing `SimulationEngine.__init__` to invoke `_persist_bootstrap()`, which inserts a fresh `GameSession` row with default services and starting scalars under the original `session_id`.
  6. The client/frontend connects to the original `session_id` and seamlessly receives the clean bootstrap state and telemetry, without crashing or encountering data corruption, while historical forensic data remains preserved in SQLite under `quarantine_id`.

### 2.2 Audit Trail Export Surfaces

Four unified export surfaces exist:
1. **`GET /api/audits`:** Complete programmatic JSON export of the session audit ledger.
2. **`GET /api/audits/postmortem/{incident_id}`:** Incident-scoped post-mortem Markdown report constructed from the shared factual dossier (`_build_incident_dossier()`).
3. **`GET /api/audits/postmortem/{incident_id}/pdf`:** Formatted executive PDF report with content checksum (SHA-256 digest of core facts).
4. **`POST /api/audits/interview/{incident_id}`:** Interactive AI auditor examination session evaluating operator incident handling.

All export paths share the identical immutable facts from `_build_incident_dossier()`, ensuring cross-channel consistency.

