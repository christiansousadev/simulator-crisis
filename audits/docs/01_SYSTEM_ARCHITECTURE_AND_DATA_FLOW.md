# System Architecture and Data Flow Specification

**Document ID:** IZ-ARCH-01  
**Classification:** Internal Architectural Reference / Compliance Package Exhibit A  
**System:** IncidentZero — SRE & IT Governance Crisis Simulator  
**Applies to:** `backend/app/` (FastAPI simulation service) and `frontend/src/` (React operations console)  
**Status:** Implementado (Revisão Técnica Atualizada)  
**Last Updated:** Outubro 2026  
**Verification note (Outubro 2026):** the REST/WebSocket surface (§ 4), the tick order (§ 3.1), the wire example (§ 3.3), the scenario and migration references (§ 2) and the security statements (§ 5) were re-derived by reading `backend/app/api/v1/*.py`, `backend/app/engine/simulator.py`, `backend/app/core/*.py` and `backend/alembic/versions/`. Frontend statements are limited to file locations and the data flow into the store; frontend runtime behaviour was not re-tested for this revision.

---

## 1. Executive Summary

IncidentZero is a real-time, server-authoritative simulation of an SRE/IT-governance operating environment. It models five interdependent microservices, a financial runway, a technical-debt index (TDI), customer satisfaction/user happiness, a 720-sample rolling-window SLA metric, error budget consumption, and an active governance reputation score, evolving that state on a configurable tick clock. The platform's mission is twofold:

1. **Operational simulation.** Reproduce, with mathematically defined fidelity, the causal chain between technical debt, cascading microservice failures, specialist on-call fatigue, incident triage latency, runbook mitigation effectiveness, and financial burn, evaluating operators under realistic crisis pressure.
2. **Governance modeling.** Treat every state-changing action — automated or human — as an auditable event captured in an append-only, queryable ledger (`AuditLog`), ensuring full traceability from alert generation through triage, mitigation, post-mortem generation, AI auditor examination, and career progression.

The core simulation loop is server-authoritative: the backend advances the world state once per tick, computes formulas defined in `backend/app/engine/formulas.py`, persists state snapshots to SQLite with thread synchronization (`_db_write_lock`), and broadcasts telemetry to connected clients via WebSocket (`TICK_BROADCAST`). The frontend is a presentation and interaction surface; it contains no independent simulation math and cannot alter world state or financial balances unilaterally.

Governance objectives realized by this architecture:

- **Non-repudiation of operator actions.** Every Acknowledge, Investigation Start (first triage submission), Runbook Execution, Upgrade Purchase, Infrastructure Node Placement/Removal, Engineer Hire/Shift Rotation, Cosmetic Unlock and CAB Dilemma Choice is attributed to a named actor and written synchronously to `audit_logs`. (A full session reset is *not* an audited event; see § 5.4.)
- **Deterministic, inspectable financial causality.** Every balance change flows through the central mutator `_apply_financial_event`, tracing directly to named formulas and categories (`operational_expense`, `incident_surcharge`, `regulatory_fine`, `mitigation_cost`, `hiring_cost`, `upgrade_purchase`, `infrastructure_purchase`, `dilemma_outcome`).
- **Regulatory-grade incident lifecycle tracking.** MTTA and MTTR are tracked in whole ticks from incident generation. Post-mortems, executive PDFs, and AI auditor interviews share a single factual dossier (`_build_incident_dossier()`) anchored to `incident_id`.

---

## 2. Component Inventory

| Component | Location | Responsibility | Technology |
|---|---|---|---|
| Simulation Engine | `backend/app/engine/simulator.py` | Owns mutable world state in-process; drives tick loop; acts as central coordinator for state mutation, persistence, and broadcasting. | Python 3.12, `asyncio` |
| Formula Library | `backend/app/engine/formulas.py` | Pure mathematical functions and constants (rolling SLA, error budget burn, cascading failure hazards, mitigation effectiveness matrix, burn rates, audit penalties). | Python 3.12 |
| Event Generator | `backend/app/engine/event_generator.py` | Builds structured incident models, log triage lines, root cause classifications, and audit entry payloads with generated identifiers. | Python 3.12, `uuid` |
| Subsystem Engines | `backend/app/engine/{dilemmas,infrastructure,log_generator,staff,upgrades,achievements,cosmetics}.py` | Modular domain logic for CAB governance dilemmas, infrastructure node catalog, log generation, engineer roster, tech-tree catalog, achievements and cosmetics. | Python 3.12 |
| Scripted Scenarios | `backend/app/engine/scenarios/*` | Six registered scenarios (`black_friday_rush`, `chaos_engineering_drill`, `ddos_global`, `deployment_rollback`, `ransomware_infiltration`, `third_party_outage`) plus the data-driven, unregistered `custom` scenario. Each scenario owns its clock hooks (`on_start`, `on_tick`), backend-computed objectives, victory evaluation and optional runbook veto (`mitigation_block_reason`). | Python 3.12 |
| REST API Surface | `backend/app/api/v1/*.py`, `backend/app/api/router.py` | 14 REST routers + 1 WebSocket router (37 REST routes, see § 4) delegating to `app.state.engine`. Handlers validate inputs via Pydantic schemas, check bounds, and return structured payloads. | FastAPI, Pydantic |
| State-Push Middleware | `backend/app/core/state_push.py` | Pure ASGI middleware: after any successful (`< 400`) `POST`/`DELETE` under `/api` except the auditor chat turn (`.../interview`), broadcasts the fresh state to WebSocket clients before the response headers are sent, also while the game is paused. Failed commands and zero connected clients broadcast nothing. | Starlette ASGI |
| WebSocket Broadcaster | `backend/app/api/v1/ws.py` + `SimulationEngine.broadcast_state` / `flush_pending_broadcasts` | Sends `TICK_BROADCAST` telemetry after every tick, on initial connection, and after every pushed command. Out-of-band event frames queued in `_pending_broadcasts` (`DILEMMA_OFFERED`, `PRE_ALERT_WARNING`, `ACHIEVEMENT_UNLOCKED`) are flushed right after the state frame. | FastAPI `WebSocket`, `asyncio` |
| Persistence & Migrations | `backend/app/core/database.py`, `backend/alembic/`, `backend/app/models/*.py` | SQLAlchemy 2.x ORM models and Alembic migrations (initial revision `8907816f55ab`; current merge head `fef99a15e754`, merging `a7d8e9f0b1c2` and `b7d4f8a2c1e6`) executed automatically on boot. | SQLAlchemy, Alembic, SQLite |
| Dossier & Audit Engine | `backend/app/api/v1/audits.py` | Central `_build_incident_dossier()` builder serving post-mortem Markdown, the executive PDF (with content checksum) and the AI auditor's grounding context. | FastAPI, ReportLab, SHA-256 |
| Frontend Store | `frontend/src/store/useGameStore.ts`, `frontend/src/store/useFlowStore.ts` | `useGameStore`: single Zustand store holding the latest telemetry snapshot (structurally shared between frames), selections, modal open-flags, floating combat text queues, KPI events, tutorial progress and accessibility/audio preferences. `useFlowStore`: small transient store for screen-flow presentation (deploy overlay, shift banner, office intro). | Zustand |
| WebSocket Hook | `frontend/src/hooks/useSimulationSocket.ts` | Maintains the connection to `/ws/telemetry` (reconnect delay 2000 ms), routes `TICK_BROADCAST` into the store and handles the `DILEMMA_OFFERED`, `PRE_ALERT_WARNING` and `ACHIEVEMENT_UNLOCKED` frames. Unknown frame types are ignored. | Native `WebSocket` |
| REST API Client | `frontend/src/services/api.ts` | Typed `fetch` client executing commands against the FastAPI backend (`VITE_API_URL`, `VITE_WS_URL`). | TypeScript, `fetch` |
| Audio Engine | `frontend/src/utils/audioEngine.ts` (shared Web Audio graph), `musicEngine.ts` (layered procedural music), `sound.ts` (effects and public API), `frontend/src/hooks/useGameAudio.ts`, `useBackgroundMusic.ts` | Synthesized Web Audio output (no external audio assets) with mute, SFX/music volume settings and mode/tension/DEFCON-driven music layers. | Web Audio API |
| Presentation Surfaces | `frontend/src/components/{common,dock,flow,layout,live-ops,modals,office,tutorial}/` | SVG isometric office scene with pan/zoom camera and time/DEFCON-driven lighting, Topbar HUD and KPI meters, bottom dock panels (incidents, directives, compliance ticker, upgrades tree, roster, achievements, metrics), lazy-loaded modals, guided tutorial overlay. | React 18, Tailwind CSS, SVG |
| Localization & Modal Layer | `frontend/src/i18n/`, `frontend/src/utils/modalStack.ts`, `frontend/src/components/common/Modal.tsx` | English ships in the main chunk; `pt-BR` and `es` are loaded as separate chunks on demand (`loadLanguage.ts`). A tiny external modal stack gives the top-most dialog Escape ownership and silences global shortcuts while a dialog is open. | TypeScript, React |
| Career & Replayability | `backend/app/api/v1/career.py`, `frontend/src/components/modals/{HallOfFameModal,PostMatchDebriefModal,ScenarioSelectModal}.tsx`, `frontend/src/components/dock/AchievementsPanel.tsx` | Career records, Operator Ranks, Hall of Fame benchmark comparisons, unlock requirements per scenario and a recommended next challenge (there is no `components/career/` directory; the career UI lives in the modals and dock listed here). | React, FastAPI |

---

## 3. Architectural Data Flow

### 3.1 Lifecycle, Crash Resilience, and Concurrency

1. **Boot and Migration Sequence.** On application startup (`lifespan` in `backend/app/main.py`), Alembic migrations are invoked via `command.upgrade(alembic_cfg, "head")`. This verifies or migrates the SQLite schema through all migration revisions (`8907816f55ab` through the merge head `fef99a15e754`). Then `SimulationEngine(session_id="incidentzero-alpha")` is created and started. There is exactly one engine and one live session per backend process.
2. **Snapshot Resume vs Bootstrap:**
   - The engine attempts `_try_restore_from_snapshot()` for the target session (`incidentzero-alpha`).
   - A persisted run that already reached a terminal status (`victory`, `bankrupted`) or has `current_tick <= 0` is not resumed; the engine bootstraps a fresh session instead.
   - If an existing session snapshot is found and its `schema_version` matches `CURRENT_SCHEMA_VERSION`, the engine rehydrates session scalars, difficulty, scenario state, reputation, rolling 720-sample SLA window (`sla_window_json`), error budget history, active incidents (including triage state and logs), purchased tech upgrades, placed infrastructure nodes, engineers, the in-flight CAB dilemma, mitigation cooldowns, temporary hazard windows, and RNG state. Service health is re-derived from the still-open incidents rather than trusted from a possibly stale service row. A `SYSTEM_RESTORED` audit event is then logged.
   - If the snapshot's `schema_version` is incompatible, the engine isolates and preserves the outdated data via `_quarantine_incompatible_snapshot()`. Specifically, `GameSession.id` and all session-scoped child rows (`Incident`, `AuditLog`, `Engineer`, `PurchasedUpgrade`, `DilemmaEvent`, `InfrastructureNode`) are re-keyed to a distinct quarantine identifier (`f"{self.session_id}-incompatible-{uuid[:8]}"`), while `Service` rows are dropped to avoid catalog primary-key collisions. A `SNAPSHOT_VERSION_MISMATCH` audit event (`actor="PLATFORM"`, `compliance_flag=False`) is logged (and travels with the quarantined rows). The original `session_id` is thereby freed, `_try_restore_from_snapshot()` returns `False`, and `_persist_bootstrap()` creates a fresh session with default services under the original `session_id`. The frontend connects to the requested `session_id` and receives clean bootstrap telemetry.
   - If no prior session exists, `_persist_bootstrap()` initializes default services, budget, and starting state under the requested `session_id`.
3. **Tick Advancement Loop:**
   - In `_run_loop()`, the engine waits `tick_rate_seconds` (1.0 s at 1x, 0.5 s at 2x, 0.2 s at 5x; `POST /api/session/speed` accepts any multiplier in `(0, 10]`, the UI offers 1x/2x/5x), increments `current_tick`, and calls `_update_simulation_tick()`. Pausing cancels the loop task.
   - In `_update_simulation_tick()`, the sequence is strictly ordered:
     a. Measure the instantaneous SLA (`formulas.instant_sla_percentage`), append it to the 720-sample window and recompute the rolling SLA.
     b. Update error-budget tracking (burn ratio, remaining ratio, burn rate over the last 10 samples).
     c. Apply operational burn: passive burn (`effective_passive_burn`) and per-incident surcharges (`incident_surcharge`, specialist-adjusted) via `_apply_budget_burn()`.
     d. Drift user happiness (`_apply_happiness_drift`: outage drift plus alert-fatigue penalties).
     e. Advance incident MTTA/MTTR counters; emit `UNATTENDED_ALERT_VIOLATION` (and its fine) when the effective MTTA reaches the breach threshold (`_progress_incidents`).
     f. Grant quiet-period technical debt relief when no incident exists (`_apply_quiet_period_refactor`).
     g. Roll random failures per healthy service through the hazard chain (`_evaluate_random_failures`, throttled at 4 concurrent incidents); with `predictive_anomaly_detection` a hit queues a pre-alert instead.
     h. Advance the active scenario clock (`elapsed_ticks += 1`) and run its `on_tick()` (skipped once completed).
     i. Evaluate session status (`_evaluate_session_status`): bankruptcy, the active scenario's own victory/defeat, the sandbox survival victory (no scenario active, tick >= 720, rolling SLA >= 99.00%), then the non-terminal `breached` warning state. **If the run ended on this tick (`is_running` is now false), `_evaluate_achievements()` runs one last time and the tick returns early** — nothing below executes on a terminal tick.
     j. Engage or lift the feature freeze (`_evaluate_feature_freeze`).
     k. Advance engineer stress and stamina (`_progress_staff_fatigue`).
     l. Materialize pre-alerted failures whose delay elapsed (`_progress_pre_alerts`).
     m. Offer or auto-resolve a CAB dilemma (`_evaluate_cab_dilemma`).
     n. Evaluate achievements (`_evaluate_achievements`; also run on the terminal tick, see i).
4. **Thread-Safe Snapshot Persistence:**
   - The tick loop materializes plain-value kwargs on the main thread (`_build_snapshot_kwargs()`) and then writes them with `await asyncio.to_thread(self._persist_snapshot_data, ...)`, so a background thread never iterates live engine dicts.
   - `self._db_write_lock` (a `threading.Lock`) protects all database writes, ensuring background snapshot flushes and synchronous REST mutations never collide or interleave corrupt state.
   - Critical operations (such as incident creation + its audit event, acknowledgement, triage submission, and a runbook's incident resolution + financial debit) execute within unified, atomic database transactions held under the lock.
5. **Telemetry Broadcast:**
   - `await self.broadcast_state()` serializes the state dictionary from `get_state_payload()` into a JSON wire frame (`TICK_BROADCAST`) sent to all connected WebSockets (a no-op with zero clients).
   - Any out-of-band frames queued during the tick or command (`DILEMMA_OFFERED`, `PRE_ALERT_WARNING`, `ACHIEVEMENT_UNLOCKED`) are flushed immediately after (`flush_pending_broadcasts`).
   - Between ticks (and while paused), `PushStateAfterCommandMiddleware` triggers the same two calls after every successful state-changing REST command.

### 3.2 Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND PROCESS                                 │
│                                                                              │
│   asyncio tick loop (SimulationEngine._run_loop)                             │
│   ┌────────────────────────────────────────────────────────────────────┐     │
│   │ sleep(tick_rate_seconds); current_tick += 1                        │     │
│   │        │                                                           │     │
│   │        ▼                                                           │     │
│   │ _update_simulation_tick()   (strict order, see 3.1 step 3)         │     │
│   │   ├─ SLA sample ──► rolling window (720) ──► error budget tracking │     │
│   │   ├─ _apply_budget_burn()      passive burn + incident surcharges  │     │
│   │   ├─ _apply_happiness_drift()  outage drift + alert fatigue        │     │
│   │   ├─ _progress_incidents()     MTTA/MTTR, UNATTENDED_ALERT fines   │     │
│   │   ├─ _apply_quiet_period_refactor()                                │     │
│   │   ├─ _evaluate_random_failures() ──► hazard chain, pre-alert queue │     │
│   │   ├─ active_scenario.on_tick()                                     │     │
│   │   ├─ _evaluate_session_status()  ──► run ended? (early return)     │     │
│   │   └─ freeze ► fatigue ► pre-alerts ► CAB dilemma ► achievements    │     │
│   │        │                                                           │     │
│   │        ▼                                                           │     │
│   │ _build_snapshot_kwargs() (main thread)                             │     │
│   │ await to_thread(_persist_snapshot_data)   [holds _db_write_lock]   │     │
│   │   └──► SQLite: game_sessions, services, incidents, engineers       │     │
│   │        │                                                           │     │
│   │        ▼                                                           │     │
│   │ await broadcast_state() ──► WebSocket TICK_BROADCAST               │     │
│   │ await flush_pending_broadcasts() ──► DILEMMA_OFFERED,              │     │
│   │                PRE_ALERT_WARNING, ACHIEVEMENT_UNLOCKED             │     │
│   └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│   Out-of-band synchronous handlers (with _db_write_lock):                    │
│   _apply_financial_event() ──► AuditLog INSERT + runtime ledger cache        │
│                                                                              │
│   REST command surface (app/api/v1/*), each followed by a state push:        │
│   POST /api/incidents/{id}/acknowledge   ──► acknowledge_incident()          │
│   POST /api/incidents/{id}/triage        ──► submit_triage()                 │
│   POST /api/mitigations/execute          ──► apply_mitigation()              │
│   POST /api/upgrades/{id}/purchase       ──► purchase_upgrade()              │
│   POST /api/infrastructure/nodes         ──► place_infrastructure_node()     │
│   POST /api/dilemmas/{id}/resolve        ──► resolve_dilemma()               │
│   POST /api/staff/hire | /{id}/rotate-shift ► hire_engineer()/rotate_shift() │
│   POST .../postmortem/{id}/interview     ──► AI auditor turn (no state push) │
│   GET  .../postmortem/{id}/export-pdf    ──► Executive PDF generation        │
│  (each successful POST/DELETE ► PushStateAfterCommandMiddleware ► broadcast) │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ /ws/telemetry (TICK_BROADCAST + events)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React SPA)                            │
│                                                                              │
│  useSimulationSocket ──► useGameStore.setTelemetry(payload)                  │
│                              │                                               │
│                              ▼                                               │
│                    Zustand store (client UI/view state + latest snapshot)    │
│                              │                                               │
│         ┌────────────────────┼───────────────────────┐                       │
│         ▼                    ▼                       ▼                       │
│    Topbar / HUD         Isometric Office        Bottom Dock / Modals         │
│    (SLA, runway,        (SVG scene, racks,      (incidents, directives,      │
│     TDI, happiness,      desks, engineers,       compliance, upgrades,       │
│     reputation,          pan/zoom camera,        roster, achievements,       │
│     DEFCON meter)        lighting, floating      metrics; incident, triage,  │
│                          combat text)            CAB, debrief modals)        │
│                                                                              │
│  User Interaction ──► services/api.ts (fetch) ──► Backend REST endpoint      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 The `TICK_BROADCAST` Contract

Every WebSocket broadcast payload matches the shape produced by `SimulationEngine.get_state_payload()` (the same dictionary `GET /api/session/state` returns). The example below uses real identifiers from the code catalogs; values are illustrative.

```json
{
  "type": "TICK_BROADCAST",
  "session_id": "incidentzero-alpha",
  "tick": 142,
  "budget": 187342.55,
  "sla_percentage": 99.96,
  "tech_debt": 31,
  "user_happiness": 95.3,
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
    },
    {
      "id": "srv-notify",
      "session_id": "incidentzero-alpha",
      "name": "Notification Dispatcher",
      "tier": "standard",
      "status": "degraded",
      "latency_ms": 1120,
      "error_rate": 0.31,
      "dependencies": ["srv-api-gw"]
    }
  ],
  "active_incidents": [
    {
      "id": "inc-a1b2c3",
      "session_id": "incidentzero-alpha",
      "service_id": "srv-notify",
      "severity": "P2_HIGH",
      "title": "Elevated error rate on Notification Dispatcher",
      "root_cause": null,
      "mtta_seconds": 1,
      "mttr_seconds": 1,
      "status": "active",
      "created_tick": 141,
      "acknowledged_tick": null,
      "resolved_tick": null,
      "triage_solved": false,
      "tech_debt_at_creation": 31,
      "tech_debt_at_resolution": null,
      "accrued_surcharge": 276.31
    }
  ],
  "recent_audits": [
    {
      "id": "aud-3f9c1a7e",
      "session_id": "incidentzero-alpha",
      "timestamp": "2026-10-06T14:02:11.482913+00:00",
      "tick": 141,
      "event_type": "INCIDENT_RAISED",
      "actor": "AUTOMATED_MONITOR",
      "details": { "service_id": "srv-notify", "severity": "P2_HIGH", "incident_id": "inc-a1b2c3" },
      "compliance_flag": true
    }
  ],
  "purchased_upgrades": ["apm_tracing", "automated_cicd"],
  "mitigation_cooldowns": { "rollback": 138 },
  "error_budget_remaining_ratio": 0.6,
  "feature_freeze_active": false,
  "engineers": [
    {
      "id": "eng-9d2e41",
      "session_id": "incidentzero-alpha",
      "name": "Priya Nair",
      "assigned_service_id": "srv-payment",
      "core_competency": "payments",
      "stress_index": 12.4,
      "stamina": 93,
      "on_call_status": "on_duty",
      "hired_at_tick": 60
    }
  ],
  "infrastructure_nodes": [
    {
      "id": "infra-5c0a77de",
      "session_id": "incidentzero-alpha",
      "node_type": "redis_cache",
      "grid_x": 2.0,
      "grid_y": 1.0,
      "status": "active",
      "config_json": "{\"target_service_id\": \"srv-search\", \"producer_service_id\": null}"
    }
  ],
  "achievements_unlocked": ["first_response", "century_club"],
  "prestige_points": 50,
  "unlocked_cosmetics": [],
  "difficulty": "standard",
  "reputation": 57.5,
  "active_scenario": {
    "scenario_id": "black_friday_rush",
    "elapsed_ticks": 42,
    "duration_ticks": 48,
    "completed": false,
    "outcome": null,
    "objectives": [
      { "id": "maintain_sla", "description": "Keep SLA at or above 99% through the surge", "done": true, "failed": false },
      { "id": "survive_surge", "description": "Survive the 48-tick traffic surge", "done": false }
    ]
  }
}
```

Notes on the contract:

- `recent_audits` is the last 15 entries of the in-memory ledger (`audit_logs[-15:]`).
- `mitigation_cooldowns` maps a runbook id (`rollback`, `scale_replicas`, `circuit_breaker`, `emergency_patch`) to the **tick it was last fired**; remaining cooldown is `cooldown_ticks - (tick - last_fired)`. Cooldowns are per runbook, not per service.
- `active_scenario` is `null` in the sandbox. `objectives[].failed` is optional: only maintenance-style objectives carry it. `active_scenario.scenario_id` is `"custom"` for a player-configured scenario.
- `tick_rate_seconds` reflects the current speed; `is_running` is `false` while paused or after a terminal status (`victory`, `bankrupted`).
- `triage_accuracy` and `triage_wrong_attempts` appear on an incident only after a triage attempt exists.
- `unlocked_cosmetics` ids come from `engine/cosmetics.py` (`golden_coffee_machine`, `executive_leather_sofa`, `marble_reception_desk`); upgrade ids from `engine/upgrades.py` (`apm_tracing`, `predictive_anomaly_detection`, `multi_az_clusters`, `automated_cicd`, `espresso_machine`, `ergonomic_chairs`); achievement ids from `engine/achievements.py` (12 entries).

*Note on Wire Security:* `public_incidents()` strips the triage answer key (`log_lines` and `root_cause_line_id`) and withholds `root_cause` until `triage_solved == True`. The log lines themselves are served on demand by `GET /api/incidents/{id}/logs`; the answer key (which line is the root cause) is never sent.

---

## 4. REST and WebSocket Surface (Authoritative List)

Derived from the route decorators in `backend/app/api/v1/*.py` (14 REST routers, 37 REST routes, plus the WebSocket route). All `POST`/`DELETE` routes except `.../interview` are followed by a state push (see § 2, State-Push Middleware).

| Method | Path | Handler | Description |
|---|---|---|---|
| `GET` | `/api/health` | `sessions.health_check` | Liveness probe; returns `status`, `version` (from `backend/pyproject.toml`, used by the title screen's build line), `engine_active`, `current_tick`, `active_clients`. |
| `GET` | `/api/difficulty/presets` | `sessions.get_difficulty_presets` | Lists the three difficulty presets (`intern`, `standard`, `chaos`) with starting budget and hazard multiplier. |
| `GET` | `/api/session/state` | `sessions.get_state` | Returns the current state snapshot on demand (same shape as `TICK_BROADCAST`). |
| `POST` | `/api/session/start` | `sessions.start_simulation` | Starts or resumes the simulation loop (a no-op in a terminal state). |
| `POST` | `/api/session/pause` | `sessions.pause_simulation` | Pauses simulation clock execution. |
| `POST` | `/api/session/speed` | `sessions.set_speed` | Sets the tick speed multiplier (`0 < multiplier <= 10`; the UI offers `1`, `2`, `5`). Auto-resumes if paused. |
| `POST` | `/api/session/reset` | `sessions.reset_simulation` | Resets the session (optional `scenario_id` validated against the registry, `player_id`, `difficulty`), re-seeds the database rows of the session, restarts the loop. |
| `GET` | `/api/services` | `services.list_services` | Returns the current services collection. |
| `GET` | `/api/incidents` | `incidents.list_incidents` | Returns open incidents with the answer key stripped and `root_cause` redacted until triage is solved. |
| `POST` | `/api/incidents/{id}/acknowledge` | `incidents.acknowledge_incident` | Acknowledges an `active` incident; logs `INCIDENT_ACKNOWLEDGED`. `404` if unknown or already acknowledged. |
| `GET` | `/api/incidents/{id}/logs` | `incidents.get_incident_logs` | Returns the synthetic log stream for the triage terminal (`{"lines": [...]}`); `404` if the incident is not open. |
| `POST` | `/api/incidents/{id}/triage` | `incidents.submit_triage` | Submits a root-cause log-line guess (`line_id`). Logs `INVESTIGATION_STARTED` on the first attempt; a wrong guess adds stress to the assigned engineer and erodes accuracy; a correct guess logs `ROOT_CAUSE_IDENTIFIED` and unlocks the root cause text and runbook bonuses. |
| `POST` | `/api/tutorial/incident` | `tutorial.spawn_tutorial_incident` | Guided tutorial: if no incident is open, raises a deterministic P2 incident on `srv-notify` (root cause `Memory leak in connection pooling thread`, a `deploy_regression`, so `rollback` fully resolves it) through the normal incident pipeline. Works while paused. Returns `{"success": true, "incident": <public incident>}` (answer key withheld); `409` if an incident is open, `srv-notify` is not healthy, or the run is terminal. |
| `GET` | `/api/mitigations/catalog` | `mitigations.get_catalog` | Returns the mitigation action catalog and baseline parameters. |
| `POST` | `/api/mitigations/execute` | `mitigations.execute_mitigation` | Executes a runbook (`action_id`, `service_id`) against a service. Applies cooldown, scenario veto, "open incident" check, feature-freeze rule, effectiveness matrix, partial recovery and costs; `400` with the engine's error text on refusal. |
| `GET` | `/api/audits` | `audits.list_audits` | Returns the engine's in-memory audit ledger mirror (`engine.audit_logs`). |
| `GET` | `/api/audits/postmortem/{id}` | `audits.generate_postmortem` | Builds the post-mortem Markdown report from the factual dossier and persists it to `audits/reports/{id}.md`; `404` if the incident is not in the ledger. |
| `GET` | `/api/audits/postmortem/{id}/export-pdf` | `audits.export_postmortem_pdf` | Generates the executive PDF report with a content checksum (attachment `postmortem_{id}.pdf`). |
| `POST` | `/api/audits/postmortem/{id}/interview` | `audits.conduct_interview` | One turn of the AI auditor interview. `503` when `LLM_API_KEY` is empty; `429` above 10 calls/60 s per client IP; message length 1-2000 characters. Does not mutate engine state (no state push). The `429` carries a `Retry-After` header; the response also returns the verdict ceiling (`adjustment_cap`) and `applied`. |
| `GET` | `/api/audits/postmortem/{id}/interview` | `audits.get_interview` | Read-only: the saved interview turns plus the latest verdict state (`verdict`, backend-clamped `regulatory_fine_adjustment`, `adjustment_cap`, `applied`). Does not need `LLM_API_KEY` and never calls the LLM; `404` for a malformed or unknown incident id or when no interview exists yet. |
| `POST` | `/api/audits/postmortem/{id}/interview/apply-verdict` | `audits.apply_interview_verdict` | Applies the latest concluded verdict's backend-clamped fine/credit once (idempotent); `400` if the incident belongs to another session, no concluded verdict exists, or it was already applied. Success returns `{success, budget, verdict, applied_amount}` (positive fine, negative credit). |
| `GET` | `/api/upgrades/catalog` | `upgrades.get_catalog` | Returns the tech tree upgrades catalog with costs and prerequisites. |
| `POST` | `/api/upgrades/{id}/purchase` | `upgrades.purchase_upgrade` | Purchases a tech upgrade; applies the immediate effect and logs `UPGRADE_PURCHASED`; `400` on unknown id, duplicate, missing prerequisite or insufficient budget. |
| `GET` | `/api/infrastructure/catalog` | `infrastructure.get_infrastructure_catalog` | Returns the build-mode hardware catalog (`redis_cache`, `kafka_queue`, `db_read_replica`, `nginx_lb`). |
| `POST` | `/api/infrastructure/nodes` | `infrastructure.place_infrastructure_node` | Places a node (`node_type`, `grid_x`, `grid_y`, `target_service_id`, optional `producer_service_id`); validates catalog entry, target/producer service and budget; `400` on refusal. Placed nodes are read from telemetry (`infrastructure_nodes`). |
| `DELETE` | `/api/infrastructure/nodes/{id}` | `infrastructure.remove_infrastructure_node` | Removes a placed node (no refund); logs `INFRASTRUCTURE_NODE_REMOVED`; `404` if unknown. |
| `POST` | `/api/staff/hire` | `staff.hire_engineer` | Hires an engineer (`core_competency` one of `auth`, `payments`, `gateway`, `db`; optional `assigned_service_id`) for a flat \$15,000; `400` on refusal. The roster is read from telemetry (`engineers`). |
| `POST` | `/api/staff/{id}/rotate-shift` | `staff.rotate_shift` | Toggles an engineer between on-duty and resting (returning to duty requires stamina >= 40); `404` if unknown. |
| `POST` | `/api/dilemmas/{id}/resolve` | `dilemmas.resolve_dilemma` | Submits the choice (`choice_id`) for the active CAB dilemma; applies budget/TDI/happiness/reputation deltas and any risk window; `400` if the dilemma is not the active one. Offers arrive as `DILEMMA_OFFERED` frames (there is no "get active dilemma" route). |
| `GET` | `/api/scenarios/catalog` | `scenarios.get_scenario_catalog` | Lists the registered scenarios with duration, conditions, objectives, unlock requirement and (for a `player_id` query) unlock state and best run. |
| `GET` | `/api/scenarios/active` | `scenarios.get_active_scenario` | Returns active scenario progress and backend-computed objectives, or `{"active": false}`. |
| `POST` | `/api/scenarios/custom/load` | `scenarios.load_custom_scenario` | Validates a custom scenario config (`CustomScenarioConfig`), resets the session and attaches the custom scenario. |
| `GET` | `/api/achievements/catalog` | `achievements.get_achievement_catalog` | Returns the 12-achievement catalog (unlock state is in telemetry `achievements_unlocked`). |
| `GET` | `/api/cosmetics/catalog` | `cosmetics.get_cosmetic_catalog` | Returns the prestige-cost cosmetic catalog. |
| `POST` | `/api/cosmetics/{id}/unlock` | `cosmetics.unlock_cosmetic` | Spends prestige points to unlock a cosmetic; logs `COSMETIC_UNLOCKED`; `400` on unknown id, duplicate or insufficient prestige. |
| `GET` | `/api/career/records` | `career.list_career_records` | Hall-of-Fame runs (filters `player_id`, `scope`, `order_by`, `scenario_id`, `difficulty`; at most 50 rows). |
| `GET` | `/api/career/summary` | `career.get_career_summary` | Consolidated career progression: totals, best runs per scenario, lifetime prestige, Operator Rank and recommended next challenge. |
| `WS` | `/ws/telemetry` | `ws.websocket_telemetry_endpoint` | Telemetry stream for the live HUD and scene (accepts an optional `player_id` query parameter). Sends the full state on connect, then `TICK_BROADCAST` and event frames. |

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
- **Speed Multiplier:** `SpeedRequest.multiplier` must satisfy `0 < multiplier <= 10`; anything else is rejected with `422`. The UI only offers `1x`, `2x` and `5x`.
- **Topology Grid Coordinates:** `PlaceInfrastructureNodeRequest` bounds `grid_x` and `grid_y` to the float range `[-100.0, 100.0]` (rejecting NaN/Infinity and absurd values). There is **no 8x8 grid, occupancy or collision check** on the backend: coordinates are stored verbatim and the build-mode UI decides where nodes may be placed. The engine additionally validates the node type against the catalog, that `target_service_id` (and, for `kafka_queue`, `producer_service_id`) exist, and that the budget covers the node's cost.
- **Custom Scenarios:** `CustomScenarioConfig` enforces `duration_ticks` 10-100,000, `hazard_multiplier` 0-20, `budget_floor` in `[0, 250,000)`, at most 50 `chaos_injections` (each `at_tick` before `duration_ticks`, `service_id` in `CANONICAL_SERVICE_IDS`), optional `starting_budget` 1,000-2,000,000 (above the floor) and `starting_tech_debt` 0-100, all before any session reset.
- **Other request bounds:** `scenario_id` must exist in the scenario registry; `player_id` matches `^[A-Za-z0-9_-]+$` (max 64); `core_competency` is a closed literal; the interview `message` is 1-2000 characters.
- **AI Auditor Outputs:** Treated as untrusted external text. The verdict is restricted to `PENDING | VALID | JUSTIFIED | NON_COMPLIANT` (anything else becomes `PENDING`), the reply is truncated, and a malformed or unreachable model response fails into a neutral `PENDING` holding reply. The actual financial adjustment is computed deterministically by `formulas.eligible_audit_adjustment`, bounded by a severity-scaled ceiling, and applied at most once per verdict.

### 5.3 Player Identification & Authentication Posture
- **Identity Model:** The application operates with an anonymous player identity. The backend's default is `DEFAULT_PLAYER_ID = "local-player"`; the frontend generates a random `player_id` (`frontend/src/utils/playerId.ts`) and sends it on reset and as the WebSocket `player_id` query parameter. Nothing proves ownership of a `player_id`.
- **Single shared session:** there is one engine and one live session (`incidentzero-alpha`) per backend process. Every connected client observes and commands the same world, and a WebSocket connection with a different `player_id` re-points the engine's career attribution (`engine.player_id`) for everybody.
- **Limitation (Documented Design Boundary):** No multi-tenant user authentication (OAuth2/JWT) or per-operator cryptographic signatures are implemented. Role strings in audit records (`VP_OF_INFRA`, `AUTOMATED_MONITOR`, `AUDIT_SYSTEM`, `BOARD_OF_DIRECTORS`, `PLATFORM_TEAM`, `PLATFORM`, `EXTERNAL_MONITOR`, `CI_PIPELINE`, `BORDER_FIREWALL`) identify system roles, not authenticated human principals. Any client reaching the REST surface can trigger actions. This design is appropriate for a single-operator crisis simulation console.
- **CORS:** `backend/app/main.py` configures `allow_origins=["*"]` with `allow_credentials=True`, appropriate for local development only.
- **Metered endpoint:** the only rate limiter is the in-process sliding window (10 calls / 60 s per client IP, resets on restart) in front of the LLM-backed interview endpoint; the endpoint answers `503` until `LLM_API_KEY` is configured.

### 5.4 Database Concurrency & Immutability
- **Write Serialization:** Background snapshot commits execute via `asyncio.to_thread` protected by `_db_write_lock`, eliminating race conditions against concurrent synchronous API writes.
- **Audit Immutability:** `AuditLog` records are strictly append-only (`db.add()`). The application provides no update or delete routes for audit records. A full session reset (`POST /api/session/reset`, which calls `_persist_bootstrap()`) deletes the parent `GameSession` row and, through the ORM relationship cascade (`cascade="all, delete-orphan"`; SQLite's `foreign_keys` pragma is off, so the database-level `ON DELETE CASCADE` hint is not what does the work), removes that session's services, incidents, audit logs, upgrades, dilemma events, engineers and infrastructure nodes. **No audit event is written for the reset itself** (there is no `SESSION_RESET` event type). Permanent career rows (`achievements`, `unlocked_cosmetics`, `career_records`) are not part of that cascade and survive a reset, as do post-mortem files written under `audits/`.
- **Durable Persistence vs Runtime Cache:** `AuditLog` is the permanent, durable ledger for discrete financial and operational transactions (`RUNBOOK_EXECUTED`, `UNATTENDED_ALERT_VIOLATION`, `AI_AUDITOR_VERDICT_APPLIED`, `DILEMMA_RESOLVED`, `ENGINEER_HIRED`, `UPGRADE_PURCHASED`, `INFRASTRUCTURE_NODE_PLACED`). The current cash balance is durably stored in `GameSession.budget`, and incident-specific cumulative financial impacts are durably stored in `Incident.accrued_surcharge`. In-memory `financial_ledger` is a bounded (500 entries) runtime cache reconstructed upon session restore from `AuditLog` via `_LEDGER_RECONSTRUCTION_MAP`. Routine per-tick cloud burn (`operational_expense`) and per-tick incident surcharges (`incident_surcharge`) are debited directly from `budget` without creating per-tick `AuditLog` rows; hence, only their individual line items in the in-memory cache are lost upon restart, while the resulting session balance in `GameSession.budget` and incident surcharges in `Incident.accrued_surcharge` remain completely durable in SQLite.
- **Mathematical Purity.** Every function in `formulas.py` is a pure function of its arguments with no reference to engine state, which makes the mathematical layer independently unit-testable and prevents order-of-evaluation bugs from silently altering constants.
- **Single writer for game state.** `SimulationEngine` is the component that mutates `services`, `incidents`, engineers and `audit_logs` rows during play; no API handler mutates those rows directly. The two documented exceptions are the post-mortem pipeline (`audits.py`), which reads the ledger and appends `AI_AUDITOR_INTERVIEW_TURN` rows with its own session, and the career/achievement read routes, which only query. The AI auditor's financial effect is routed through `engine._apply_financial_event`, never by writing the budget directly.
- **Audit rows are never updated or deleted by application code.** The ORM model `AuditLog` (`backend/app/models/audit.py`) is only ever the target of `db.add(...)` calls (`_log_audit_event` and the interview-turn writer in `audits.py`); no code path in the repository issues an `UPDATE` or `DELETE` against `audit_logs`. The only way audit rows disappear is the ORM cascade triggered by `_persist_bootstrap()` deleting the parent `GameSession` on session reset — an explicit operational reset, which as stated above is itself not recorded in the ledger (see Document 03, § Ledger Tamper-Evident Design, for the analysis of this boundary).
- **Idempotent upserts for mutable rows.** `services` and `incidents` are persisted via `Session.merge()`, which is safe to call repeatedly with the same primary key and cannot create duplicate rows; `audit_logs` is persisted via `db.add()` with a freshly generated UUID-derived id (`aud-{uuid4().hex[:8]}`, 12 characters) per call, which cannot realistically collide with a prior row's id in a way that would overwrite it.
