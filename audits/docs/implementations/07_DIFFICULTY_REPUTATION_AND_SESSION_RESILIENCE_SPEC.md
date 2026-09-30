# Difficulty, Governance Reputation, and Session Resilience — Implementation Specification

**Document ID:** IZ-IMPL-07  
**Classification:** Technical Specification / Resilience, Progression & Persistence  
**Status:** Implementado  
**Source of Truth:** `backend/app/engine/simulator.py`, `backend/app/engine/dilemmas.py`, `backend/app/models/session.py`, `backend/app/api/v1/sessions.py`

---

## 1. System Objective

This specification details four core resilience and progression systems:
1. **Difficulty presets** calibrating starting capital and failure hazard across sandbox and scenarios.
2. **Governance reputation** tracking organizational trust, feeding into failure hazard and CAB dilemma eligibility.
3. **Session resilience and snapshot recovery**, ensuring complete restoration of all simulation state after backend restarts without state loss or math drift.
4. **Schema versioning and quarantine**, preserving legacy or incompatible snapshots safely without silent data destruction.

---

## 2. Difficulty Presets

`DIFFICULTY_PRESETS` in `simulator.py` defines three operational tiers:

| Preset | Starting Budget | Hazard Multiplier | Description |
|---|---|---|---|
| `intern` | \$320,000 | $0.70\times$ | Relaxed failure frequency, generous operating runway |
| `standard` (default) | \$250,000 | $1.00\times$ | Baseline operational hazard and runway |
| `chaos` | \$180,000 | $1.40\times$ | Punishing failure cascades and tight budget runway |

- **API & Configuration:** `SimulationEngine.__init__` and `.reset()` accept an optional `difficulty` argument (falling back safely to `standard` if unrecognized). Handled through `SessionResetRequest.difficulty`.
- **Persistence & Telemetry:** Persisted in `GameSession.difficulty` column (via Alembic migration) and broadcast in real time via `TICK_BROADCAST.difficulty`.
- **UI:** Selectable in `ScenarioSelectModal` across all game modes.

---

## 3. Governance Reputation

`self.reputation` is a persistent continuous metric bounded in $[0.0, 100.0]$, initialized at $50.0$.

### 3.1 Reputation Mechanics
- **Dilemma Feedback:** Every `DilemmaChoice` in `dilemmas.py` includes a `reputation_delta`. Uncompromising, compliant decisions reward positive reputation; cutting corners for short-term runway imposes a penalty.
- **Audit Logging:** Every dilemma resolution logs `reputation_delta` and `reputation_after` in the `DILEMMA_RESOLVED` event.

### 3.2 Systemic Feedback Loops
1. **Hazard Multiplier:**
   - **Crisis ($< 25.0$):** Multiplies failure probability by $1.15\times$ (corner-cutting and low morale increase systemic fragility).
   - **Trusted ($> 75.0$):** Multiplies failure probability by $0.90\times$ (high-trust governance and rigorous operations buy resilience).
   - Neutral ($25.0 \le \text{reputation} \le 75.0$): Multiplier is $1.00\times$.
2. **Gated CAB Dilemmas:**
   - `board_intervention` (bailout/probation) only triggers when reputation collapses ($\le 24.0$).
   - `executive_promotion_offer` only triggers under sustained organizational trust ($\ge 76.0$).
- **UI:** Real-time visualization via `ReputationMeter.tsx` in HUD Topbar and impact indicators in `CABDilemmaModal`.

---

## 4. Crash & Restart Session Resilience

### 4.1 Snapshot Recovery Lifecycle (`_try_restore_from_snapshot`)

When `SimulationEngine.__init__` executes, it evaluates `_try_restore_from_snapshot()` before attempting any bootstrap:
- **Resumption Validation:** A snapshot is resumed if:
  1. A `GameSession` row exists for `self.session_id`.
  2. `status` is not terminal (`status not in ("bankrupted", "victory")`).
  3. `current_tick > 0` (preventing redundant restore of un-advanced sessions).
  4. `schema_version == CURRENT_SCHEMA_VERSION`.

### 4.2 Comprehensive State Restored

The snapshot recovery restores all game components without loss or artificial healing:

1. **Session Core Scalars:** `current_tick`, `budget`, `tech_debt`, `user_happiness`, `sla_percentage`, `prestige_points`, `quiet_ticks`, `difficulty`, and `reputation`.
2. **Rolling SLA Window:** Deserializes `sla_window_json` (up to 720 historical samples). The moving average calculation on the next tick resumes seamlessly without mathematical drift.
3. **Error Budget & Feature Freeze:** Deserializes `error_budget_history_json` and evaluates burn ratios. Feature freeze state is accurately reinstated.
4. **Mitigation Cooldowns:** Restores `mitigation_last_fired_tick` from `mitigation_cooldowns_json`. Runbook cooldowns enforce absolute tick values across restarts.
5. **Active Incidents & Investigation Progress:** All `active` and `acknowledged` incidents are restored in full:
   - Investigation state (`triage_solved`, `triage_wrong_attempts`, `triage_accuracy`, `log_lines_json`, `root_cause_line_id`).
   - Incident snapshots (`tech_debt_at_creation`, `accrued_surcharge`).
   - **Active incidents are NOT cured on restart.** Service health is derived directly from open incidents (`down` if P1, `degraded` if open incident).
6. **Scenario & Special States:**
   - Restores active scenario (`ScenarioEngine`), `elapsed_ticks`, `completed`, `outcome`, and scenario-specific state via `restore_extra()` (e.g. ransomware's `infected_service_ids` and `quarantined_service_ids`, custom scenario injection timelines).
7. **RNG Determinism:** Restores Python `random.setstate()` from `random_state_json`.
8. **Infrastructure & Upgrades:** Restores all `PurchasedUpgrade` records and placed `InfrastructureNode` records (grid positions, statuses, node configs).
9. **Engineers & On-Call:** Restores complete engineering roster: `stress_index`, `stamina`, `core_competency`, `on_call_status`, `assigned_service_id`.
10. **In-Flight Dilemmas:** Pending `DilemmaEvent` records are resumed with exact remaining expiration ticks and re-queued into `_pending_broadcasts` so the player can resolve them.
11. **Audit & Financial History:** Reloads the last 1,000 audit log rows and reconstructs the active financial ledger.
12. **Audit Event:** Emits `SYSTEM_RESTORED` (`actor="PLATFORM"`, `compliance_flag=True`).

---

## 5. Concurrency, Atomic Writes & Schema Versioning

### 5.1 Concurrency Lock (`_db_write_lock`)
- Periodic background persistence (`_persist_snapshot`) and synchronous user-driven writes (`apply_mitigation`, `acknowledge_incident`, `dilemmas`, `buy_upgrade`) synchronize through `_db_write_lock`.
- Prevents database lock contention, dirty reads, and partially materialized session snapshots.

### 5.2 Schema Versioning & Quarantine (`_quarantine_incompatible_snapshot`)
- Each snapshot is stamped with `schema_version` (currently `1`).
- If a snapshot's version does not match `CURRENT_SCHEMA_VERSION`:
  1. An audit event `SNAPSHOT_VERSION_MISMATCH` is logged (`actor="PLATFORM"`, `compliance_flag=False`, with `found_version` and `expected_version`).
  2. The incompatible session and associated historical child records (`Incident`, `AuditLog`, `Engineer`, `PurchasedUpgrade`, `DilemmaEvent`, `InfrastructureNode`) are safely re-keyed and isolated under a distinct quarantine identifier (`quarantine_id = f"{self.session_id}-incompatible-{uuid.uuid4().hex[:8]}"`).
  3. `Service` rows associated with the incompatible session are deleted from the database to avoid primary-key collisions with fixed catalog IDs (`srv-auth`, etc.) upon bootstrap.
  4. The original `session_id` is thereby completely freed in SQLite.
  5. `_try_restore_from_snapshot()` returns `False`, causing `SimulationEngine.__init__` to invoke `_persist_bootstrap()`, which inserts a clean `GameSession` row and canonical services under the requested `session_id`.
  6. The frontend receives clean bootstrap telemetry under the original `session_id`, while all prior historical rows remain durably quarantined under `quarantine_id` without silent overwriting or loss.

---

## 6. Documented Limitations Preserved

1. **Ledger Routine Expense Granularity After Restart:**
   - Routine per-tick `operational_expense` and `incident_surcharge` line items are not reconstructed individually after restart. The current cash balance is durably stored in `GameSession.budget`, per-incident aggregate surcharges are durably stored in `Incident.accrued_surcharge`, and discrete financial events are preserved in `AuditLog`. Only the individual tick-by-tick routine line items in the in-memory `financial_ledger` cache are dropped after a restart (as no application consumer or UI component requires routine historical line items).
2. **Incompatible Snapshot Recovery UX:**
   - Incompatible snapshots are safely quarantined in the database with audit records (`SNAPSHOT_VERSION_MISMATCH` under `quarantine_id`). Currently, there is no specialized frontend modal for interacting with or migrating quarantined snapshots; the frontend receives and displays the freshly bootstrapped session under the original `session_id`.
3. **Player Identity:**
   - Player identification relies on anonymous, persistent local browser IDs (`player_id`) rather than full user authentication.

---

## 7. Quality Gates

*Implementation present in the codebase; validation of execution outside the scope of this documentary update.*
