# System Architecture and Data Flow Specification

**Document ID:** IZ-ARCH-01  
**Classification:** Internal Architectural Reference / Compliance Package Exhibit A  
**System:** IncidentZero — SRE & IT Governance Crisis Simulator  
**Applies to:** `backend/app/` (FastAPI simulation service) and `frontend/src/` (React operations console)  
**Status:** Implementado (Revisão Técnica Atualizada)  
**Last Updated:** Setembro 2026  

---

## 1. Executive Summary

IncidentZero is a real-time, server-authoritative simulation of an SRE/IT-governance operating environment. It models five interdependent microservices, a financial runway, a technical-debt index (TDI), customer satisfaction/user happiness, a 720-sample rolling-window SLA metric, error budget consumption, and an active governance reputation score, evolving that state on a configurable tick clock. The platform's mission is twofold:

1. **Operational simulation.** Reproduce, with mathematically defined fidelity, the causal chain between technical debt, cascading microservice failures, specialist on-call fatigue, incident triage latency, runbook mitigation effectiveness, and financial burn, evaluating operators under realistic crisis pressure.
2. **Governance modeling.** Treat every state-changing action — automated or human — as an auditable event captured in an immutable, queryable ledger (`AuditLog`), ensuring full traceability from alert generation through triage, mitigation, post-mortem generation, AI auditor examination, and career progression.

The core simulation loop is server-authoritative: the backend advances the world state once per tick, computes formulas defined in `backend/app/engine/formulas.py`, persists state snapshots to SQLite with thread synchronization (`_db_write_lock`), and broadcasts telemetry to connected clients via WebSocket (`TICK_BROADCAST`). The frontend is a presentation and interaction surface; it contains no independent simulation math and cannot alter world state or financial balances unilaterally.

Governance objectives realized by this architecture:

- **Non-repudiation of operator actions.** Every Acknowledge, Investigation Attempt, Runbook Execution, Upgrade Purchase, Infrastructure Node Placement, CAB Dilemma Choice, and Session Reset is attributed to a named actor and written synchronously to `audit_logs`.
- **Deterministic, inspectable financial causality.** Every balance change flows through the central mutator `_apply_financial_event`, tracing directly to named formulas (`effective_passive_burn`, `incident_surcharge`, `regulatory_fine`, `mitigation_cost`, `hiring_cost`, `upgrade_purchase`, `infrastructure_purchase`, `dilemma_outcome`).
- **Regulatory-grade incident lifecycle tracking.** MTTA and MTTR are tracked in whole ticks from incident generation. Post-mortems, executive PDFs, and AI auditor interviews share a single immutable factual dossier (`_build_incident_dossier()`) anchored to `incident_id`.

---

## 2. Component Inventory

| Component | Location | Responsibility | Technology |
|---|---|---|---|
| Simulation Engine | `backend/app/engine/simulator.py` | Owns mutable world state in-process; drives tick loop; acts as central coordinator for state mutation, persistence, and broadcasting. | Python 3.12, `asyncio` |
| Formula Library | `backend/app/engine/formulas.py` | Pure mathematical functions and constants (rolling SLA, error budget burn, cascading failure hazards, mitigation effectiveness matrix, burn rates, audit penalties). | Python 3.12 |
| Event Generator | `backend/app/engine/event_generator.py` | Builds structured incident models, log triage lines, root cause classifications, and audit entry payloads with deterministic identifiers. | Python 3.12, `uuid` |
| Subsystem Engines | `backend/app/engine/{dilemmas,infrastructure,log_generator,staff,upgrades,achievements,cosmetics}.py` | Modular domain logic for CAB governance dilemmas, physical topology nodes, log generation, engineer stamina/fatigue, tech-tree unlocks, and career progression. | Python 3.12 |
| Scripted Scenarios | `backend/app/engine/scenarios/*` | Scenario definitions (Black Friday, Ransomware Infiltration, Chaos Week, Custom Scenario) managing stage progression, dynamic objectives, and lateral threat movements. | Python 3.12 |
| REST API Surface | `backend/app/api/v1/*.py` | Stateless HTTP endpoints delegating to `app.state.engine`. Handlers validate inputs, check bounds, and return structured schemas. | FastAPI, Pydantic |
| WebSocket Broadcaster | `backend/app/api/v1/ws.py` + `SimulationEngine.broadcast_state` | Broadcasts `TICK_BROADCAST` telemetry to active clients after every tick and upon initial connection handshake. | FastAPI `WebSocket`, `asyncio` |
| Persistence & Migrations | `backend/app/core/database.py`, `backend/alembic/`, `backend/app/models/*.py` | SQLAlchemy 2.x ORM models and Alembic migrations (`8907816f55ab` through `a7d8e9f0b1c2`) executed automatically on boot. | SQLAlchemy, Alembic, SQLite |
| Dossier & Audit Engine | `backend/app/api/v1/audits.py` | Central `_build_incident_dossier()` builder serving post-mortem Markdown, executive PDF generator, and AI auditor LLM evaluations with content checksums. | FastAPI, ReportLab, SHA-256 |
| Frontend Store | `frontend/src/store/useGameStore.ts` | Single Zustand store holding the latest telemetry snapshot, client-side UI states, active modals, floating combat text queues, and audio preferences. | Zustand |
| WebSocket Hook | `frontend/src/hooks/useSimulationSocket.ts` | Maintains connection to `/ws/telemetry`, handles reconnection backoff (2000ms), and updates store telemetry. | Native `WebSocket` |
| REST API Client | `frontend/src/services/api.ts` | Typed `fetch` client executing commands against the FastAPI backend. | TypeScript, `fetch` |
| Audio Engine | `frontend/src/utils/sound.ts`, `frontend/src/hooks/useGameAudio.ts`, `frontend/src/hooks/useBackgroundMusic.ts` | Synthesized Web Audio API sound generator (no external audio assets). Supports mute, SFX/music volume sliders, and `prefers-reduced-motion` suppression. | Web Audio API |
| Presentation Surfaces | `frontend/src/components/*` | Isometric SVG office canvas, Tactical HUD, StatusPill indicators, 3-block incident modals, ObjectiveTracker, ScenarioBriefingModal, and PostMatchDebriefModal. | React 18, Tailwind CSS, SVG |
| Career & Replayability | `frontend/src/components/career/*`, `backend/app/api/v1/career.py` | Career records, Operator Ranks, Hall of Fame benchmark comparisons, unlock trackers, and dynamic Next Challenge recommendations. | React, FastAPI |

---

## 3. Architectural Data Flow

### 3.1 Lifecycle, Crash Resilience, and Concurrency

1. **Boot and Migration Sequence.** On application startup (`lifespan` in `backend/app/main.py`), Alembic migrations are invoked via `command.upgrade(alembic_cfg, "head")`. This verifies or migrates the SQLite schema through all migration revisions (`8907816f55ab` to `a7d8e9f0b1c2`).
2. **Snapshot Resume vs Bootstrap:**
   - The engine attempts `_try_restore_from_snapshot()` for the target session (`incidentzero-alpha`).
   - If an existing session snapshot is found and its `schema_version` matches `CURRENT_SCHEMA_VERSION`, the engine rehydrates session scalars, difficulty, scenario state, reputation, rolling 720-sample SLA window (`sla_window_json`), error budget history, active incidents (including triage state and logs), purchased tech upgrades, placed infrastructure nodes, in-flight CAB dilemma, mitigation cooldowns, and RNG state.
   - If the snapshot's `schema_version` is incompatible, the engine isolates and preserves the outdated data via `_quarantine_incompatible_snapshot()`. Specifically, `GameSession.id` and all session-scoped child rows (`Incident`, `AuditLog`, `Engineer`, `PurchasedUpgrade`, `DilemmaEvent`, `InfrastructureNode`) are re-keyed to a distinct quarantine identifier (`f"{self.session_id}-incompatible-{uuid[:8]}"`), while `Service` rows are dropped to avoid catalog primary-key collisions. A `SNAPSHOT_VERSION_MISMATCH` audit event (`actor="PLATFORM"`, `compliance_flag=False`) is logged. The original `session_id` is thereby freed, `_try_restore_from_snapshot()` returns `False`, and `_persist_bootstrap()` creates a fresh session with default services under the original `session_id`. The frontend connects to the requested `session_id` and receives clean bootstrap telemetry.
   - If no prior session exists, `_persist_bootstrap()` initializes default services, budget, and starting state under the requested `session_id`.
3. **Tick Advancement Loop:**
   - In `_run_loop()`, the engine ticks at `tick_rate_seconds` (1.0s at 1x, 0.5s at 2x, 0.2s at 5x; paused at 0x).
   - In `_update_simulation_tick()`, the sequence is strictly ordered:
     a. Compute instantaneous and rolling 720-sample SLA (`formulas.instant_sla_percentage`).
     b. Compute error budget burn ratio and burn rate.
     c. Deduct operational burn (`effective_passive_burn`) and incident surcharges (`incident_surcharge`).
     d. Update engineer stamina, fatigue, on-call status, and user happiness.
     e. Progress active incident MTTA/MTTR; trigger `UNATTENDED_ALERT_VIOLATION` if MTTA exceeds threshold.
     f. Evaluate scenario hooks (`on_tick`) and scripted stage transitions.
     g. Grant quiet-period technical debt relief if no incidents are active.
     h. Evaluate cascading failure checks (`formulas.cascading_failure_probability`).
     i. Evaluate session status (`_evaluate_session_status`), checking bankruptcy, scenario victory/defeat, or sandbox survival.
4. **Thread-Safe Snapshot Persistence:**
   - Snapshot persistence runs asynchronously (`await asyncio.to_thread(self._persist_snapshot)`).
   - `self._db_write_lock` (a `threading.Lock`) protects all database writes, ensuring background snapshot flushes and synchronous REST mutations never collide or interleave corrupt state.
   - Critical operations (such as incident creation, resolution, and associated financial deductions) execute within unified, atomic database transactions.
5. **Telemetry Broadcast:**
   - `await self.broadcast_state()` serializes the state dictionary from `get_state_payload()` into a JSON wire frame (`TICK_BROADCAST`) sent to all connected WebSockets.
   - Any out-of-band frames queued during the tick (e.g., immediate audit events or toasts) are flushed immediately after.

### 3.2 Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND PROCESS                                 │
│                                                                              │
│   asyncio tick loop (SimulationEngine._run_loop)                             │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │ sleep(tick_rate_seconds)                                           │    │
│   │        │                                                           │    │
│   │        ▼                                                           │    │
│   │ current_tick += 1                                                  │    │
│   │        │                                                           │    │
│   │        ▼                                                           │    │
│   │ _update_simulation_tick()                                          │    │
│   │   ├─ formulas.instant_sla_percentage(services) ──► sla_window (720)│    │
│   │   ├─ _apply_budget_burn() ──► passive burn & incident surcharge    │    │
│   │   ├─ _update_engineers()  ──► stamina, fatigue, on-call drift      │    │
│   │   ├─ _progress_incidents()──► MTTA/MTTR & UNATTENDED_ALERT         │    │
│   │   ├─ active_scenario.on_tick() ──► stages, dynamic objectives      │    │
│   │   ├─ _evaluate_random_failures() ──► cascading failure hazard      │    │
│   │   └─ _evaluate_session_status()  ──► victory, defeat, bankruptcy   │    │
│   │        │                                                           │    │
│   │        ▼                                                           │    │
│   │ with _db_write_lock: await to_thread(_persist_snapshot)            │    │
│   │   └──► SQLite: game_sessions, services, incidents, nodes, upgrades │    │
│   │        │                                                           │    │
│   │        ▼                                                           │    │
│   │ await broadcast_state() ──► WebSocket broadcast (TICK_BROADCAST)    │    │
│   └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│   Out-of-band Synchronous Handlers (with _db_write_lock):                    │
│   _apply_financial_event() ──► AuditLog INSERT + Runtime ledger cache        │
│                                                                              │
│   REST Command Surface (app/api/v1/*):                                       │
│   POST /api/incidents/{id}/acknowledge   ──► engine.acknowledge_incident()   │
│   POST /api/incidents/{id}/investigate   ──► engine.investigate_incident()   │
│   POST /api/mitigations/execute          ──► engine.apply_mitigation()       │
│   POST /api/upgrades/purchase            ──► engine.purchase_upgrade()       │
│   POST /api/infrastructure/place         ──► engine.place_infrastructure()   │
│   POST /api/dilemmas/{id}/choose         ──► engine.resolve_dilemma()        │
│   POST /api/audits/interview/{id}        ──► AI auditor LLM verification     │
│   GET  /api/audits/postmortem/{id}/pdf   ──► Executive PDF generation        │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ ws://.../ws/telemetry (TICK_BROADCAST)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React SPA)                            │
│                                                                              │
│  useSimulationSocket ──► useGameStore.setTelemetry(payload)                  │
│                              │                                               │
│                              ▼                                               │
│                    Zustand store (client single source of truth)             │
│                              │                                               │
│         ┌────────────────────┼───────────────────────┐                       │
│         ▼                    ▼                       ▼                       │
│    Tactical HUD       Isometric Scene         Bottom Dock / Modals           │
│    (SLA, Runway,      (3D Foundation, Racks,  (Incident Modal 3-Blocks,      │
│     TDI, Happiness,    Desks, Real Engineer    Mitigation Panel,             │
│     Reputation,        States, Pan/Zoom,       Directives, CAB Dilemmas,     │
│     Defcon Meter)      Floating Combat Text)   PostMatchDebriefModal)        │
│                                                                              │
│  User Interaction ──► services/api.ts (fetch) ──► Backend REST Endpoint      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 The `TICK_BROADCAST` Contract

Every WebSocket broadcast payload matches the shape produced by `SimulationEngine.get_state_payload()`:

```json
{
  "type": "TICK_BROADCAST",
  "session_id": "incidentzero-alpha",
  "tick": 142,
  "budget": 187342.55,
  "sla_percentage": 99.41,
  "tech_debt": 31,
  "user_happiness": 78.4,
  "status": "running",
  "is_running": true,
  "tick_rate_seconds": 1.0,
  "services": [
    {
      "id": "srv-auth",
      "session_id": "incidentzero-alpha",
      "name": "Identity & Auth Service",
      "tier": "critical",
      "status": "healthy",
      "latency_ms": 32,
      "error_rate": 0.0001,
      "dependencies": []
    }
  ],
  "active_incidents": [
    {
      "id": "inc-a1b2c3",
      "session_id": "incidentzero-alpha",
      "service_id": "srv-payment",
      "severity": "P1_CRITICAL",
      "title": "Service disruption detected on Payment Gateway Core",
      "root_cause": null,
      "mtta_seconds": 4,
      "mttr_seconds": 4,
      "status": "active",
      "triage_solved": false,
      "triage_attempts": 0,
      "created_tick": 138,
      "acknowledged_tick": null,
      "resolved_tick": null
    }
  ],
  "recent_audits": [ /* last 15 audit_logs rows */ ],
  "purchased_upgrades": ["ci_cd_pipeline", "automated_testing"],
  "mitigation_cooldowns": { "srv-payment:restart_service": 130 },
  "error_budget_remaining_ratio": 0.8421,
  "feature_freeze_active": false,
  "engineers": [ /* staff models with stamina, fatigue, on-call assignment */ ],
  "infrastructure_nodes": [ /* placed infrastructure nodes */ ],
  "achievements_unlocked": ["first_responder"],
  "prestige_points": 150,
  "unlocked_cosmetics": ["theme_midnight"],
  "difficulty": "standard",
  "reputation": 72.5,
  "active_scenario": {
    "scenario_id": "black_friday_surge",
    "elapsed_ticks": 42,
    "duration_ticks": 180,
    "completed": false,
    "outcome": null
  }
}
```

*Note on Wire Security:* `public_incidents()` strips the triage answer key (`log_lines` and `root_cause_line_id`) and withholds `root_cause` until `triage_solved == True`.

---

## 4. REST and WebSocket Surface (Authoritative List)

| Method | Path | Handler | Description |
|---|---|---|---|
| `GET` | `/api/health` | `sessions.health_check` | Liveness probe; returns engine status, current tick, active clients. |
| `GET` | `/api/session/state` | `sessions.get_state` | Returns the current state snapshot on demand. |
| `POST` | `/api/session/start` | `sessions.start_simulation` | Starts or resumes the simulation loop. |
| `POST` | `/api/session/pause` | `sessions.pause_simulation` | Pauses simulation clock execution. |
| `POST` | `/api/session/speed` | `sessions.set_speed` | Sets tick speed multiplier (`1.0`, `2.0`, `5.0`). Auto-unpauses if paused. |
| `POST` | `/api/session/reset` | `sessions.reset_simulation` | Resets session, re-seeds database, resets timers, restarts loop. |
| `GET` | `/api/services` | `services.list_services` | Returns the current services collection. |
| `GET` | `/api/incidents` | `incidents.list_incidents` | Returns active incidents with redacted root cause for unsolved triage. |
| `POST` | `/api/incidents/{id}/acknowledge` | `incidents.acknowledge_incident` | Acknowledges an active incident; logs `INCIDENT_ACKNOWLEDGED`. |
| `POST` | `/api/incidents/{id}/investigate` | `incidents.investigate_incident` | Submits a triage line guess. Validates guess, manages stress, updates accuracy, reveals cause on match. |
| `GET` | `/api/mitigations/catalog` | `mitigations.get_catalog` | Returns the mitigation action catalog and baseline parameters. |
| `POST` | `/api/mitigations/execute` | `mitigations.execute_mitigation` | Executes runbook against service. Applies effectiveness matrix, partial recovery, cooldowns, and costs. |
| `GET` | `/api/audits` | `audits.list_audits` | Returns persisted audit log history from SQLite. |
| `GET` | `/api/audits/postmortem/{id}` | `audits.generate_postmortem` | Builds post-mortem Markdown report from factual dossier. |
| `GET` | `/api/audits/postmortem/{id}/pdf` | `audits.generate_postmortem_pdf` | Generates official executive PDF report with content checksum. |
| `POST` | `/api/audits/interview/{id}` | `audits.conduct_auditor_interview` | Submits post-mortem interview to AI auditor; verifies verdict and applies fine deterministically. |
| `GET` | `/api/upgrades/catalog` | `upgrades.get_catalog` | Returns tech tree upgrades catalog with costs and requirements. |
| `POST` | `/api/upgrades/purchase` | `upgrades.purchase_upgrade` | Purchases tech upgrade; applies immediate effect and logs audit event. |
| `GET` | `/api/infrastructure/nodes` | `infrastructure.list_nodes` | Lists deployed infrastructure topology nodes. |
| `POST` | `/api/infrastructure/place` | `infrastructure.place_node` | Places topology node in grid; validates bounds and deducts funds. |
| `GET` | `/api/staff` | `staff.list_engineers` | Returns engineer roster with fatigue, stamina, on-call assignments. |
| `POST` | `/api/staff/{id}/assign` | `staff.assign_engineer` | Assigns engineer to service or standby. Validates `service_id`. |
| `GET` | `/api/dilemmas/active` | `dilemmas.get_active_dilemma` | Returns currently pending CAB governance dilemma, if any. |
| `POST` | `/api/dilemmas/{id}/choose` | `dilemmas.choose_option` | Submits choice for CAB dilemma; applies operational/reputation deltas. |
| `GET` | `/api/scenarios` | `scenarios.list_scenarios` | Lists available standard and custom scenarios. |
| `GET` | `/api/scenarios/active` | `scenarios.get_active_scenario` | Returns active scenario state and backend-computed dynamic objectives. |
| `POST` | `/api/scenarios/start` | `scenarios.start_scenario` | Initializes and starts a scenario run. |
| `POST` | `/api/scenarios/custom` | `scenarios.create_custom_scenario` | Validates and registers custom scenario payload before session reset. |
| `GET` | `/api/career/summary` | `career.get_career_summary` | Returns career records, Operator Rank, personal bests, and recommended next challenge. |
| `GET` | `/api/achievements` | `achievements.list_achievements` | Returns 12 achievements catalog with unlock statuses. |
| `GET` | `/api/cosmetics` | `cosmetics.list_cosmetics` | Returns office cosmetic themes and unlocked states. |
| `WS` | `/ws/telemetry` | `ws.websocket_telemetry_endpoint` | Telemetry streaming connection for live HUD and scene synchronization. |

---

## 5. Security & Isolation Boundaries

This section documents the **as-implemented** security and authority boundaries.

### 5.1 Backend Authority Architecture
The backend is the sole authority for:
- Financial ledger balances, budget deductions, and audit fines;
- Incident generation, severity assignment, cascading failure probabilities, and resolution statuses;
- SLA calculations, rolling window tracking, and error budget exhaustion;
- Technical debt accumulation and quiet-period relief;
- Runbook cooldown enforcement and feature freeze restrictions;
- Scenario completion, victory/defeat evaluation, and career progression records.

The client cannot fabricate financial credit, force incident resolution without runbook execution, or bypass mitigation cooldowns.

### 5.2 Input Validation and Bounds Enforcement
- **Speed Multiplier:** Clamped to positive finite values (`1.0`, `2.0`, `5.0`). Non-numeric or negative values are rejected.
- **Topology Grid Coordinates:** Infrastructure placement strictly validates grid bounds (`0 <= x < 8`, `0 <= y < 8`).
- **Custom Scenarios:** Validated against `CANONICAL_SERVICE_IDS` and bounded ranges (duration, budget, hazard multiplier) prior to applying any session reset.
- **AI Auditor Outputs:** Treated as untrusted external text. Schema fields (`verdict`, `score`, `penalties`) are parsed and clamped; the actual financial penalty is computed deterministically by backend formula (`formulas.eligible_audit_adjustment`), bounded by a severity-scaled ceiling.

### 5.3 Player Identification & Authentication Posture
- **Identity Model:** The application operates with an anonymous local player identity (`DEFAULT_PLAYER_ID = "local-player"`).
- **Limitation (Documented Design Boundary):** No multi-tenant user authentication (OAuth2/JWT) or per-operator cryptographic signatures are implemented. Role strings in audit records (`VP_OF_INFRA`, `PLATFORM_TEAM`, `AUDIT_SYSTEM`, `AI_GOVERNANCE_AUDITOR`) identify system roles, not authenticated human principals. Any client reaching the REST surface can trigger actions. This design is appropriate for a single-operator crisis simulation console.

### 5.4 Database Concurrency & Immutability
- **Write Serialization:** Background snapshot commits execute via `asyncio.to_thread` protected by `_db_write_lock`, eliminating race conditions against concurrent synchronous API writes.
- **Audit Immutability:** `AuditLog` records are strictly append-only (`db.add()`). The application provides no update or delete routes for audit records. Full session reset performs an intentional cascaded cleanup of the session, logged with `SESSION_RESET`.
- **Durable Persistence vs Runtime Cache:** `AuditLog` is the permanent, durable ledger for discrete financial and operational transactions (`RUNBOOK_EXECUTED`, `UNATTENDED_ALERT_VIOLATION`, `AI_AUDITOR_VERDICT_APPLIED`, `DILEMMA_RESOLVED`, `ENGINEER_HIRED`, `UPGRADE_PURCHASED`, `INFRASTRUCTURE_NODE_PLACED`). The current cash balance is durably stored in `GameSession.budget`, and incident-specific cumulative financial impacts are durably stored in `Incident.accrued_surcharge`. In-memory `financial_ledger` is a bounded (500 entries) runtime cache reconstructed upon session restore from `AuditLog` via `_LEDGER_RECONSTRUCTION_MAP`. Routine per-tick cloud burn (`operational_expense`) and per-tick incident surcharges (`incident_surcharge`) are debited directly from `budget` without creating per-tick `AuditLog` rows; hence, only their individual line items in the in-memory cache are lost upon restart, while the resulting session balance in `GameSession.budget` and incident surcharges in `Incident.accrued_surcharge` remain completely durable in SQLite.
- **Mathematical Purity.** Every function in `formulas.py` is a pure function of its arguments with no reference to engine state, which makes the mathematical layer independently unit-testable and prevents order-of-evaluation bugs from silently altering constants.
- **Single writer.** `SimulationEngine` is the only component in the codebase that opens a SQLAlchemy `Session` for writing; no API handler constructs its own database session or bypasses the engine to mutate rows directly. This guarantees that every write to `services`, `incidents`, or `audit_logs` passed through the tick-evolution or player-action code paths documented in Section 3.
- **Audit rows are never updated or deleted by application code.** The ORM model `AuditLog` (`backend/app/models/audit.py`) is only ever the target of `db.add(...)` calls in `_log_audit_event`; no code path in the repository issues an `UPDATE` or `DELETE` against `audit_logs`. The only way an audit row disappears is the cascade delete triggered by `_persist_bootstrap()` deleting the parent `GameSession` on session reset — an explicit, logged operational reset, not silent tampering (see Document 03, § Ledger Tamper-Evident Design, for the full analysis of this boundary).
- **Idempotent upserts for mutable rows.** `services` and `incidents` are persisted via `Session.merge()`, which is safe to call repeatedly with the same primary key and cannot create duplicate rows; `audit_logs` is persisted via `db.add()` with a freshly generated UUID-derived id (`aud-{uuid4().hex[:6..8]}`) per call, which cannot collide with a prior row's id in a way that would overwrite it.
