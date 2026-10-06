# Governance and Compliance Controls

**Document ID:** IZ-GOV-03  
**Classification:** Internal Controls Framework / Compliance Package Exhibit C  
**Alignment claimed:** SOX-404 (Section 404 internal-control-over-financial-reporting principles, applied to simulated financial state), SOC 2 Type II (Trust Services Criteria: Processing Integrity, Availability), ISO/IEC 27001 (Annex A control themes: logging and monitoring, A.8.15)  
**Scope limitation:** This document evaluates the completeness, immutability, and traceability of the *action ledger*. It does not assert compliance with multi-tenant authentication, encryption-at-rest, or RBAC — those boundaries are recorded explicitly in Document 01, § 5.3, and are out of scope by design.  
**Status:** Implementado (Revisão Técnica Atualizada)  
**Last Updated:** Outubro 2026  
**Verification note (Outubro 2026):** the event table, actor taxonomy, reset behaviour and export surfaces below were re-checked against `backend/app/engine/simulator.py`, `backend/app/engine/scenarios/*`, `backend/app/api/v1/audits.py` and `backend/app/models/`. The authoritative field-level catalog of all 34 event types is `audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md`.  

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
| Operator resolves CAB dilemma (or the decision window expires and the default choice is applied, actor `BOARD_OF_DIRECTORS`) | `_apply_dilemma_choice()` | `DILEMMA_RESOLVED` | `choice["tech_debt_delta"] <= 5` |
| CAB dilemma choice opens a temporary hazard window | `_apply_dilemma_choice()` | `ELEVATED_RISK_WINDOW_OPENED` | `False` |
| Periodic CAB dilemma offered | `_evaluate_cab_dilemma()` | `DILEMMA_OFFERED` | `True` |
| Operator purchases tech-tree upgrade | `purchase_upgrade()` | `UPGRADE_PURCHASED` | `True` |
| Operator places infrastructure node | `place_infrastructure_node()` | `INFRASTRUCTURE_NODE_PLACED` | `True` |
| Operator removes infrastructure node | `remove_infrastructure_node()` | `INFRASTRUCTURE_NODE_REMOVED` | `True` |
| Operator hires an engineer | `hire_engineer()` | `ENGINEER_HIRED` | `True` |
| Operator rotates engineer shift | `rotate_shift()` | `SHIFT_ROTATED` | `True` |
| Scripted chaos drill injects failure | `ChaosEngineeringDrillScenario.on_tick()` | `CHAOS_STRIKE` | `True` |
| Ransomware initial entry point identified | `RansomwareInfiltrationScenario.on_start()` | `PATIENT_ZERO_IDENTIFIED` | `False` |
| DDoS attack detected at scenario start | `DdosGlobalScenario.on_start()` | `DDOS_ATTACK_DETECTED` | `True` |
| Bad deployment detected at scenario start | `DeploymentRollbackScenario.on_start()` | `DEPLOYMENT_REGRESSION_DETECTED` | `True` |
| Deployment scenario second wave (no triage by tick 20) | `DeploymentRollbackScenario.on_tick()` | `SECOND_REGRESSION_WAVE` | `True` |
| Third-party provider outage begins | `ThirdPartyOutageScenario.on_start()` | `THIRD_PARTY_PROVIDER_OUTAGE` | `False` |
| Third-party provider recovers | `ThirdPartyOutageScenario.on_tick()` | `THIRD_PARTY_PROVIDER_RECOVERED` | `True` |
| Scenario concludes (win or loss) | `_evaluate_session_status()` | `SCENARIO_CONCLUDED` | `outcome["compliant"]` |
| Quiet period refactor cycle completes | `_apply_quiet_period_refactor()` | `PROACTIVE_REFACTOR_CYCLE` | `True` |
| Monthly survival milestone reached | `_evaluate_session_status()` | `MONTHLY_AUDIT_CYCLE_SURVIVED` | `True` |
| Achievement unlock condition met | `_evaluate_achievements()` | `ACHIEVEMENT_UNLOCKED` | `True` |
| Operator spends prestige points on a cosmetic | `unlock_cosmetic()` | `COSMETIC_UNLOCKED` | `True` |
| Post-mortem interview turn completed | `_persist_interview_event()` | `AI_AUDITOR_INTERVIEW_TURN` | `verdict != "NON_COMPLIANT"` |
| AI auditor applies financial verdict | `apply_interview_verdict()` | `AI_AUDITOR_VERDICT_APPLIED` | `verdict != "NON_COMPLIANT"` |
| Error budget exhausted | `_evaluate_feature_freeze()` | `FEATURE_FREEZE_ENGAGED` | `False` |
| Error budget recovered | `_evaluate_feature_freeze()` | `FEATURE_FREEZE_LIFTED` | `True` |
| Effective MTTA of an unacknowledged incident reaches 12 ticks (every tick thereafter) | `_progress_incidents()` | `UNATTENDED_ALERT_VIOLATION` | `False` |
| Rolling window SLA falls below 99.00% (after 24-tick grace period) | `_evaluate_session_status()` | `SLA_BREACH_EMERGENCY_SANCTION` | `False` |
| Budget reaches zero | `_evaluate_session_status()` | `BANKRUPTCY_LIQUIDATION` | `False` |
| Session restored from snapshot | `_try_restore_from_snapshot()` | `SYSTEM_RESTORED` | `True` |
| Incompatible snapshot schema quarantined | `_try_restore_from_snapshot()` | `SNAPSHOT_VERSION_MISMATCH` | `False` |

**Operating effectiveness evidence.** `_log_audit_event` appends to `self.audit_logs` in memory and commits a persistent SQLAlchemy `AuditLog` row in SQLite. In-memory live views (`GET /api/audits` and `TICK_BROADCAST`) remain strictly in sync with the persistent ledger.

**Explicit exclusion.** Routine per-tick state snapshots (`_persist_snapshot_data`), passive operational burn, and tick-by-tick incident surcharges do **not** generate individual audit events. Routine burn and per-tick surcharges are accounted for in the durable session cash balance (`GameSession.budget`) and per-incident accruals (`Incident.accrued_surcharge`); recording every tick would flood the ledger with non-decisional noise.

### Control Objective 2 — Segregation of Duties and Traceability

**Actor taxonomy** (the authoritative set of 9 roles emitted across the codebase; no audit row is ever written under an `AI_GOVERNANCE_AUDITOR` or similar principal):

| Actor | Nature | Scope of Authority |
|---|---|---|
| `VP_OF_INFRA` | Human operator | Operational commands: incident acknowledgment, investigation triage, runbook execution, tech upgrades, infrastructure placement/removal, engineer hiring/shift rotation, cosmetic unlocks, and CAB dilemma choices. |
| `AUTOMATED_MONITOR` | System telemetry | Automated alert generation (`INCIDENT_RAISED`), chaos strikes (`CHAOS_STRIKE`), security detection (`PATIENT_ZERO_IDENTIFIED`) and the deployment scenario's `SECOND_REGRESSION_WAVE`. |
| `AUDIT_SYSTEM` | System compliance | Automated policy enforcement: MTTA unattended violations, SLA breach emergency sanctions, feature freeze triggers, risk windows, scenario outcomes, monthly survival, achievements, and the AI auditor's interview turns and verdict enforcement. |
| `BOARD_OF_DIRECTORS` | Corporate authority | Financial liquidation (`BANKRUPTCY_LIQUIDATION`), offering CAB dilemmas (`DILEMMA_OFFERED`), and auto-resolving expired dilemmas (`DILEMMA_RESOLVED` with `auto_resolved=true`). |
| `PLATFORM_TEAM` | Background engineering | Proactive technical debt refactoring cycles (`PROACTIVE_REFACTOR_CYCLE`). |
| `PLATFORM` | Core runtime platform | State restoration (`SYSTEM_RESTORED`) and incompatible snapshot quarantine (`SNAPSHOT_VERSION_MISMATCH`). |
| `EXTERNAL_MONITOR` | Simulated vendor/status-page monitor | Third-party provider outage and recovery notices (`THIRD_PARTY_PROVIDER_OUTAGE`, `THIRD_PARTY_PROVIDER_RECOVERED`). |
| `CI_PIPELINE` | Simulated CI/CD system | Bad-deployment detection at the start of the Deployment Rollback scenario (`DEPLOYMENT_REGRESSION_DETECTED`). |
| `BORDER_FIREWALL` | Simulated perimeter defence | DDoS detection at the start of the DDoS Global scenario (`DDOS_ATTACK_DETECTED`). |

**Traceability chain:** Every `AuditLog` row stores `id`, `session_id`, `tick`, `timestamp` (UTC wall clock at insert), `actor`, `event_type`, `compliance_flag`, and a structured JSON payload (`details_json`); there is no free-text `description` column. `tick` serves as the simulation sequencing key, independent of wall-clock drift. One exception: `AI_AUDITOR_INTERVIEW_TURN` rows are written post hoc by the API layer with `tick = 0`, so their position in the ledger is given by `timestamp`, not `tick`.

### Control Objective 3 — Incident SLA Adherence & Non-Repudiation

**Enforcement:**
- `is_unattended_breach(mtta_ticks)` is checked every tick for all `active` (unacknowledged) incidents once MTTA reaches 12 ticks.
- Each unattended tick emits an `UNATTENDED_ALERT_VIOLATION` with `compliance_flag=False` and levies a \$4,500 fine. The tested MTTA is the *effective* MTTA (reduced by 2 with `apm_tracing` and by a further 1 with a specialist of quality $\ge 0.70$ on the service; see Document 02, § 0).
- MTTA and MTTR advance in whole ticks. Acknowledging an incident freezes MTTA. Resolving an incident freezes MTTR and halts surcharge accumulation.

**Compliance Flag Semantics:**
- `compliance_flag=True`: Actions executed within compliance policy or positive system achievements.
- `compliance_flag=False`: Policy violations and adverse events (unattended alerts, regulatory SLA breaches, feature freezes, elevated-risk windows, bankruptcy, `NON_COMPLIANT` AI auditor findings, incompatible snapshot schema mismatches, a ransomware patient zero, a vendor outage, CAB choices that add more than 5 TDI, and scenario conclusions whose outcome is not compliant).

---

## 2. Ledger Tamper-Evident Design

### 2.1 Append-Only Storage Analysis
The application issues only `INSERT` statements (`db.add()`) against `audit_logs`. No endpoint or background task issues `UPDATE` or `DELETE` against audit rows.
- **Session Reset:** `POST /api/session/reset` calls `_persist_bootstrap()`, which deletes the parent `GameSession` row; the ORM relationship cascade (`cascade="all, delete-orphan"` on `GameSession`; SQLite's `foreign_keys` pragma is off, so the database-level `ON DELETE CASCADE` hint is not what removes the rows) deletes that session's services, incidents, audit logs, purchased upgrades, dilemma events, engineers and infrastructure nodes. **No audit event records the reset** (the code never emits a `SESSION_RESET` event), so the ledger of a reset session is gone without a trace in the ledger itself. Permanent career data (`achievements`, `unlocked_cosmetics`, `career_records`) is not part of the cascade, and post-mortem files already written under `audits/reports/` and `audits/interviews/` are not touched. This is a known limit of the append-only claim: it holds for every code path *except* an explicit operator reset.
- **Incompatible Snapshot Quarantine:** If a snapshot from an incompatible schema version is encountered during boot (`_try_restore_from_snapshot()` detecting `schema_version != CURRENT_SCHEMA_VERSION`):
  1. The incompatible session and historical child records (`Incident`, `AuditLog`, `Engineer`, `PurchasedUpgrade`, `DilemmaEvent`, `InfrastructureNode`) have their primary/foreign keys re-keyed to a distinct quarantine identifier: `quarantine_id = f"{self.session_id}-incompatible-{uuid.uuid4().hex[:8]}"`.
  2. Fixed catalog `Service` rows are deleted to prevent catalog primary-key collisions with the replacement session.
  3. A `SNAPSHOT_VERSION_MISMATCH` audit event (`actor="PLATFORM"`, `compliance_flag=False`, detailing `found_version` and `expected_version`) is durably recorded and preserved with the quarantined session.
  4. The original `session_id` is thereby completely freed in the database.
  5. `_try_restore_from_snapshot()` returns `False`, causing `SimulationEngine.__init__` to invoke `_persist_bootstrap()`, which inserts a fresh `GameSession` row with default services and starting scalars under the original `session_id`.
  6. The client/frontend connects to the original `session_id` and seamlessly receives the clean bootstrap state and telemetry, without crashing or encountering data corruption, while historical forensic data remains preserved in SQLite under `quarantine_id`.

### 2.2 Audit Trail Export and Examination Surfaces

Five endpoints expose the ledger or facts derived from it:
1. **`GET /api/audits`:** JSON dump of the engine's in-memory ledger mirror (`engine.audit_logs`): every entry of the live run, and after a process restart the most recent 1,000 persisted rows plus everything since.
2. **`GET /api/audits/postmortem/{incident_id}`:** Incident-scoped post-mortem Markdown report constructed from the shared factual dossier (`_build_incident_dossier()`), also saved to `audits/reports/{incident_id}.md`.
3. **`GET /api/audits/postmortem/{incident_id}/export-pdf`:** Formatted executive PDF report with a 16-character content checksum (truncated SHA-256 of the report's own facts; an integrity aid, not a signature).
4. **`POST /api/audits/postmortem/{incident_id}/interview`:** One turn of the AI auditor examination of the operator's handling of the incident (`503` until `LLM_API_KEY` is configured, rate-limited, logged as `AI_AUDITOR_INTERVIEW_TURN`).
5. **`POST /api/audits/postmortem/{incident_id}/interview/apply-verdict`:** Applies the backend-clamped fine or credit of the latest concluded verdict once (`AI_AUDITOR_VERDICT_APPLIED`).

Surfaces 2, 3 and 4 are grounded in the identical dossier from `_build_incident_dossier()`, ensuring cross-channel consistency. The raw SQLite file is the only complete, queryable form of the persisted ledger.
