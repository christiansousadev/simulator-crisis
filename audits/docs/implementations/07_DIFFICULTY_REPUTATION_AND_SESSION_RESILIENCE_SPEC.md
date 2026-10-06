# Difficulty, Governance Reputation, and Session Resilience — Implementation Specification

**Document ID:** IZ-IMPL-07  
**Classification:** Technical Specification / Resilience, Progression & Persistence  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `backend/app/engine/simulator.py`, `backend/app/engine/dilemmas.py`, `backend/app/models/session.py`, `backend/app/api/v1/sessions.py`, `backend/alembic/versions/`, `backend/tests/test_migrations.py`

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

- **API & Configuration:** `SimulationEngine.__init__` and `.reset()` accept an optional `difficulty` argument (falling back safely to `standard` if unrecognized). Handled through `SessionResetRequest.difficulty` on `POST /api/session/reset`; the presets are listed by `GET /api/difficulty/presets`. The starting budget is applied at reset; the hazard multiplier is a factor in `_evaluate_random_failures` for the whole run. A custom scenario starts from the `standard` preset (its own optional `starting_budget` overrides it).
- **Persistence & Telemetry:** Persisted in the `GameSession.difficulty` column (Alembic revision `c4a7e91f3b2d_persistence_resilience`), copied onto each `CareerRecord` (revision `a7d8e9f0b1c2_add_difficulty_to_career_records`), and broadcast in real time via `TICK_BROADCAST.difficulty`.
- **UI:** Selectable in `ScenarioSelectModal` across all game modes.

---

## 3. Governance Reputation

`self.reputation` is a persistent continuous metric bounded in $[0.0, 100.0]$, initialized at $50.0$.

### 3.1 Reputation Mechanics
- **Dilemma Feedback:** Every choice in `dilemmas.py` includes a `reputation_delta` (the full table is in `02_ERROR_BUDGET_AND_CAB_GOVERNANCE_SPEC.md` § 3.2). The cautious option of each base dilemma earns +3 to +5; the corner-cutting option costs -4 to -6 and also opens a temporary elevated-hazard window. `board_intervention` offers +10 (accept) or -3 (reject); `executive_promotion_offer` +2 or +1. The new value passes through `clamp_percentage` (0 to 100).
- **Audit Logging:** Every dilemma resolution logs `reputation_delta` and `reputation_after` in the `DILEMMA_RESOLVED` event.
- **Persistence:** `reputation` is a `GameSession` column (`Numeric(5,2)`), restored with the snapshot, reset to 50.0 by `reset()`, and recorded on the career record as `final_reputation`.

### 3.2 Systemic Feedback Loops
1. **Hazard Multiplier:**
   - **Crisis ($< 25.0$):** Multiplies failure probability by $1.15\times$ (corner-cutting and low morale increase systemic fragility).
   - **Trusted ($> 75.0$):** Multiplies failure probability by $0.90\times$ (high-trust governance and rigorous operations buy resilience).
   - Neutral ($25.0 \le \text{reputation} \le 75.0$): Multiplier is $1.00\times$.
2. **Gated CAB Dilemmas:**
   - `board_intervention` (bailout/probation) is only in the eligible pool when `reputation <= 24` (`max_reputation`).
   - `executive_promotion_offer` is only in the eligible pool when `reputation >= 76` (`min_reputation`).
   - Eligibility is evaluated when a dilemma is built, and the four base dilemmas are always eligible, so a gated one is a possibility, not a guarantee. The hazard thresholds (< 25, > 75) and the gate thresholds (<= 24, >= 76) are deliberately close but not identical: a reputation of, say, 24.5 already carries the crisis hazard penalty but does not yet qualify for the board intervention.
- **UI:** `ReputationMeter.tsx` is one of the Topbar's secondary indicators (inline at >= 1720 px, inside the labelled "Indicators" popover below that), and `CABDilemmaModal` shows each choice's reputation delta and a live projection of the meter.

---

## 4. Crash & Restart Session Resilience

### 4.1 Snapshot Recovery Lifecycle (`_try_restore_from_snapshot`)

When `SimulationEngine.__init__` executes, it evaluates `_try_restore_from_snapshot()` before attempting any bootstrap:
- **Resumption Validation:** A snapshot is resumed if:
  1. A `GameSession` row exists for `self.session_id`.
  2. `status` is not terminal (`status not in ("bankrupted", "victory")`).
  3. `current_tick > 0` (preventing redundant restore of un-advanced sessions).
  4. `schema_version == CURRENT_SCHEMA_VERSION` (currently `1`, defined in `backend/app/models/session.py`).
- The snapshot itself is written after **every tick** (`_persist_snapshot_data`, handed plain value copies and executed on a worker thread under `_db_write_lock`), and incidents, engineer changes, upgrade purchases and dilemma events are also persisted at the moment they happen, so a crash loses at most the tick in flight.

### 4.2 Comprehensive State Restored

The snapshot recovery restores all game components without loss or artificial healing:

1. **Session Core Scalars:** `current_tick`, `budget`, `tech_debt`, `user_happiness`, `sla_percentage`, `prestige_points`, `quiet_ticks`, `difficulty`, and `reputation`.
2. **Rolling SLA Window:** Deserializes `sla_window_json` (up to 720 historical samples). The moving average calculation on the next tick resumes seamlessly without mathematical drift.
3. **Error Budget, Feature Freeze & Temporary Hazard Windows:** Deserializes `error_budget_history_json` and re-derives the burn ratio, remaining ratio and `feature_freeze_active` from the restored `sla_percentage`. Open elevated-risk windows from CAB choices (`temporary_hazard_effects_json`) are restored with their original expiry ticks.
4. **Mitigation Cooldowns:** Restores `mitigation_last_fired_tick` from `mitigation_cooldowns_json`. Runbook cooldowns enforce absolute tick values across restarts.
5. **Active Incidents & Investigation Progress:** All `active` and `acknowledged` incidents are restored in full:
   - Investigation state (`triage_solved`, `triage_wrong_attempts`, `triage_accuracy`, `log_lines_json`, `root_cause_line_id`).
   - Incident snapshots (`tech_debt_at_creation`, `accrued_surcharge`).
   - **Active incidents are NOT cured on restart.** Service health is derived directly from open incidents (`down` if P1, `degraded` if open incident).
6. **Scenario & Special States:**
   - Restores active scenario (`ScenarioEngine`), `elapsed_ticks`, `completed`, `outcome`, and scenario-specific state via `restore_extra()` (e.g. ransomware's `infected_service_ids` and `quarantined_service_ids`, custom scenario injection timelines).
7. **RNG State:** Restores Python `random.setstate()` from `random_state_json` (a corrupt blob is ignored and the fresh OS-seeded state is kept). The third-party-outage scenario's own RNG is intentionally unseeded and is not part of this.
8. **Infrastructure & Upgrades:** Restores all `PurchasedUpgrade` records and placed `InfrastructureNode` records (grid positions, statuses, node configs).
9. **Engineers & On-Call:** Restores complete engineering roster: `stress_index`, `stamina`, `core_competency`, `on_call_status`, `assigned_service_id`.
10. **In-Flight Dilemmas:** Pending `DilemmaEvent` records are resumed with exact remaining expiration ticks and re-queued into `_pending_broadcasts` so the player can resolve them.
11. **Audit & Financial History:** Reloads the last 1,000 audit log rows and reconstructs the in-memory financial ledger from the durable financial events (`_LEDGER_RECONSTRUCTION_MAP`).
12. **Audit Event:** Emits `SYSTEM_RESTORED` (`actor="PLATFORM"`, `compliance_flag=True`, payload with `restored_tick` and the resumed incident/upgrade/infrastructure/dilemma counts).

Not restored: the pre-alert queue of the `predictive_anomaly_detection` upgrade (`pending_pre_alerts`) is in-memory only, so a warning queued but not yet materialized at the moment of a crash is lost.

---

## 5. Concurrency, Atomic Writes & Schema Versioning

### 5.1 Concurrency Lock (`_db_write_lock`)
- Periodic background persistence (`_persist_snapshot`) and synchronous user-driven writes (`apply_mitigation`, `acknowledge_incident`, `resolve_dilemma`, `purchase_upgrade`, hiring and infrastructure placement) synchronize through `_db_write_lock`.
- Prevents database lock contention, dirty reads, and partially materialized session snapshots.

### 5.2 Schema Versioning & Quarantine (`_quarantine_incompatible_snapshot`)
- **Two distinct versioning layers.** The *database schema* is managed by Alembic (`backend/alembic/`: seven revisions at the time of this update: the initial schema, difficulty on career records, SLA-window persistence, persistence resilience, incident forensic facts, career-record consolidation and a merge of heads). `run_database_migrations()` runs `upgrade head` on every boot; a legacy SQLite file created before Alembic fails with an explicit `RuntimeError` telling the operator to delete the regenerable database file. `tests/test_migrations.py` runs the real `upgrade head` against a fresh file and checks the expected tables. The *snapshot payload* version (`schema_version`) is a separate, application-level stamp, described below.
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

Results observed while preparing the October 2026 documentation update (working tree with the uncommitted UX overhaul, not a tagged release):

| Gate | Command | Result |
|---|---|---|
| Backend tests | `python -m pytest` in `backend/` | 93 passed (about 6 s), with deprecation warnings only (`datetime.utcnow()`) |
| Frontend unit tests | `npx vitest run` in `frontend/` | 354 tests in 52 files, all passing |
| End-to-end | `npm run test:e2e` (Playwright, Chromium, real backend + frontend) | 8 tests in 6 spec files; reported green at the time of the update (not re-run while this document was verified) |
| Backend lint | `python -m ruff check .` in `backend/` | clean ("All checks passed"). The 12 older findings (import order and unused imports in two Alembic revisions, `api/v1/career.py`, `api/v1/scenarios.py`, `schemas/career.py`, `tests/test_new_scenarios.py`) were fixed, so the CI backend job passes this step |
| Frontend lint | `npm run lint` | no findings reported |

The CI workflow that runs these gates is described in `08_QUALITY_GATES_AND_INSTALLABILITY_SPEC.md` § 3. Restart-resilience behaviour in this document is covered by the engine and migration tests; no coverage percentage is claimed here.
