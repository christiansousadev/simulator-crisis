# System Architecture and Data Flow Specification

**Document ID:** IZ-ARCH-01
**Classification:** Internal Architectural Reference / Compliance Package Exhibit A
**System:** IncidentZero — SRE & IT Governance Crisis Simulator
**Applies to:** `backend/app/` (FastAPI simulation service) and `frontend/src/` (React operations console)

> **Staleness notice:** this document predates several engine subsystems added since it was
> written — difficulty presets and governance reputation, CAB dilemmas, the tech-tree/upgrade
> system, staff on-call and fatigue, achievements/cosmetics/Hall of Fame, build-mode
> infrastructure nodes, the scripted-scenario engine (including player-authored custom
> scenarios), the log-triage mini-game, and crash/restart snapshot-resume — and it claims (§3.1)
> that no migration framework exists, which is no longer true: `backend/app/main.py` now runs
> real Alembic migrations on startup. Treat this document as historical/architectural framing
> only; for current behavior see `audits/docs/implementations/*_SPEC.md` (07, 08 and 09 cover
> the most recent additions) and the source files each spec cites directly.

---

## 1. Executive Summary

IncidentZero is a real-time, single-tenant simulation of an SRE/IT-governance operating environment. It models five interdependent microservices, a financial runway, a technical-debt index, a customer-satisfaction score, and a cumulative SLA metric, and it evolves that state on a fixed tick clock. The platform's mission is twofold:

1. **Operational simulation.** Reproduce, with mathematically defined fidelity, the causal chain between technical debt, cascading failures, incident response latency, and financial burn, so that a Head of Infrastructure persona can be evaluated on triage and remediation decisions under pressure.
2. **Governance modeling.** Treat every state-changing action — automated or human — as a governable event that must be captured in an immutable, queryable ledger, so the same system that generates incidents also generates the audit trail a real compliance function would demand of it.

The core simulation loop is a server-authoritative tick: the backend advances the world state once per tick, computes SLA/financial/incident-response formulas defined in `backend/app/engine/formulas.py`, persists the resulting rows to SQLite, and broadcasts the full state snapshot to every connected browser over a single WebSocket channel. The frontend is a pure rendering and input surface; it holds no independent simulation logic and cannot advance the world clock itself.

Governance objectives realized by this architecture:

- **Non-repudiation of operator actions.** Every Acknowledge, Runbook Execution, and Session Reset is attributed to a named actor and written to `audit_logs` at the moment it occurs, not reconstructed after the fact.
- **Deterministic, inspectable financial causality.** Every dollar removed from the budget traces to a named formula (`effective_passive_burn`, `incident_surcharge`, `UNATTENDED_BREACH_FINE`) with no hidden or manually-adjustable ledger entries.
- **Regulatory-grade incident lifecycle tracking.** MTTA and MTTR are tracked in whole ticks from the moment an incident is system-generated, independent of when a human operator happens to view the dashboard.

---

## 2. Component Inventory

| Component | Location | Responsibility | Technology |
|---|---|---|---|
| Simulation Engine | `backend/app/engine/simulator.py` | Owns all mutable world state in-process; runs the tick loop; is the single writer to every database table. | Python 3.12, `asyncio` |
| Formula Library | `backend/app/engine/formulas.py` | Pure, stateless mathematical functions and constants (SLA weighting, cascading-failure hazard, financial burn, regulatory penalties, mitigation catalog). No I/O. | Python 3.12 |
| Event Generator | `backend/app/engine/event_generator.py` | Constructs incident and audit-log record shapes, including UUID-derived identifiers (`inc-xxxxxx`, `aud-xxxxxxxx`) and narrative text (root cause, title). | Python 3.12, `uuid` |
| REST API Surface | `backend/app/api/v1/{sessions,services,incidents,mitigations,audits}.py` | Stateless HTTP handlers that read or command the singleton `SimulationEngine` held on `app.state.engine`. No handler contains simulation logic of its own. | FastAPI |
| WebSocket Telemetry Broadcaster | `backend/app/api/v1/ws.py` + `SimulationEngine.broadcast_state` / `connect_client` | Maintains the set of connected sockets and pushes the full `TICK_BROADCAST` payload to all of them after every tick and on new-connection handshake. | FastAPI `WebSocket`, `asyncio` |
| Persistence Layer | `backend/app/core/database.py`, `backend/app/models/*.py` | SQLAlchemy engine/session factory and ORM models for `game_sessions`, `services`, `incidents`, `mitigation_actions`, `audit_logs`. | SQLAlchemy 2.x, SQLite |
| Post-Mortem Generator | `backend/app/api/v1/audits.py` | Reads persisted `Incident`/`GameSession`/`AuditLog` rows, hydrates `audits/templates/post_mortem_template.md`, and writes the artifact to `audits/reports/{incident_id}.md`. | FastAPI, `pathlib` |
| Frontend State Store | `frontend/src/store/useGameStore.ts` | Single Zustand store holding the last-received telemetry frame plus purely client-local UI state (selection, floating text, run animations, language, and — as of the Phase 2 War Room revision — screen-shake trauma sequencing (`screenShakeSeq` / `screenShakeMagnitude`) triggered on a newly-raised `P1_CRITICAL` incident, a `running → breached` transition, or bankruptcy). Contains no simulation math; the shake/flash sequence numbers are derived entirely from diffing the current telemetry frame against the previous one, never from an independent client-side calculation. | Zustand |
| WebSocket Client | `frontend/src/hooks/useSimulationSocket.ts` | Opens `ws://.../ws/telemetry`, parses `TICK_BROADCAST` frames, and calls `setTelemetry` on the store. Auto-reconnects after a 2000 ms backoff on close. **Fixed:** the connection effect previously listed the reactive `language` value in its dependency array (used only to localize one floating-text string), so every in-game language change tore the socket down and paid the full 2000 ms reconnect gap for no telemetry-related reason; it now reads the current language via a ref inside the message handler instead. | Native `WebSocket` |
| REST Client | `frontend/src/services/api.ts` | Thin `fetch` wrapper issuing the exact command set described in Section 4. | Native `fetch` |
| Audio System | `frontend/src/utils/sound.ts`, `frontend/src/hooks/useGameAudio.ts`, `frontend/src/hooks/useBackgroundMusic.ts` | Synthesized Web Audio API sound bank — no audio file assets are shipped with the client. As of the Phase 2 War Room revision this includes four additional store-reactive cues: `playRedAlertSiren` (looping rotary siren for as long as a `P1_CRITICAL` incident is active or `status === "breached"`), `playChaChing` (retro cash-register cue on a `MONTHLY_AUDIT_CYCLE_SURVIVED` audit entry), `playKeyboardClatter` (mechanical-keyboard clatter fired at runbook execution, alongside the existing `playCashSound`), and `playCriticalHeartbeat` (cardiac-monitor beep looping while `budget` is below the \$15,000 low-runway threshold). Each looping cue is gated in `useGameAudio.ts` on a stable derived boolean rather than the raw, every-tick-new-reference `active_incidents` array or `budget` number, so the underlying `setInterval` is not torn down and restarted on every tick. | Web Audio API (`AudioContext`) |
| Rendering Surface | `frontend/src/components/office/*`, `frontend/src/components/layout/*`, `frontend/src/components/dock/*`, `frontend/src/components/common/*` | Isometric SVG office visualization, topbar KPI gauges, and the tabbed action dock (Incidents / Directives / Compliance Ledger). As of the Phase 2 War Room revision, the console renders under a unified **Tactical War Room (dark glassmorphism)** visual register rather than the prior light-mode dock: the isometric scene now sits on a structural 3D foundation (`FoundationBlock`, an `IsoBox` slab spanning `z=-0.65` to `z=0` directly beneath the existing parquet floor, plus a wide diffuse `MasterGroundShadow`) instead of a flat, unsupported plane; the topbar carries a `DefconMeter` tactical threat-level indicator (levels 5→1, derived client-side and purely presentationally from `sla_percentage` and `active_incidents` severity — see `frontend/src/utils/defcon.ts`); and transient event feedback (`FloatingCombatText.tsx`) renders as high-contrast, neon-bordered arcade combat-text chips (`font-mono`, per-tone glow shadow) rather than the previous light-mode toast pills. Purely presentational; every mutating action calls back into `services/api.ts`. | React 18, Tailwind CSS, SVG |
| Localization Layer | `frontend/src/i18n/*` | Typed EN / PT-BR / ES dictionaries; selected language is stored in Zustand and persisted to `localStorage`. | TypeScript |

---

## 3. Architectural Data Flow

### 3.1 Narrative Description

1. **Boot.** `backend/app/main.py`'s `lifespan` context calls `Base.metadata.create_all(bind=db_engine)` to ensure every table exists, then instantiates exactly one `SimulationEngine(session_id="incidentzero-alpha")` and stores it on `app.state.engine`. The engine's constructor immediately calls `_persist_bootstrap()`, which deletes any pre-existing `GameSession` row for that session id (cascading to its `services`/`incidents`/`audit_logs` via the ORM relationship `cascade="all, delete-orphan"`) and inserts a fresh session plus the five hardcoded services. The engine then calls `start()`, scheduling `_run_loop()` as an `asyncio.Task`.
2. **Tick advancement.** `_run_loop` sleeps for `tick_rate_seconds` (1.0s at 1x, 0.2s at 5x, or indefinitely paused at 0x), increments `current_tick`, and calls `_update_simulation_tick()`, which in strict order: computes instantaneous SLA (§ Formula 1 in Document 02), applies budget burn, applies happiness drift, advances every active incident's MTTA/MTTR, grants ambient tech-debt relief during quiet periods, rolls the stochastic cascading-failure check across all healthy services, and evaluates session-status transitions (running → breached / victory / bankrupted).
3. **Persistence.** Immediately after the tick mutation, `await asyncio.to_thread(self._persist_snapshot)` upserts (via `Session.merge`) the `GameSession` row, all five `Service` rows, and every in-memory `Incident` row. This runs on a worker thread so the synchronous SQLAlchemy session session does not block the asyncio event loop. Audit-log rows are **not** batched here — they are written synchronously, one row at a time, at the exact moment `_log_audit_event` is called (see § 3.3), so the ledger reflects the precise tick of occurrence even if the broadcast that follows is delayed.
4. **Broadcast.** `await self.broadcast_state()` serializes `get_state_payload()` to JSON once and sends the identical byte string to every socket in `active_websockets`, removing any socket whose `send_text` raises. Because a single serialization is shared across all clients, all connected browsers observe the same tick simultaneously.
5. **Frontend ingestion.** `useSimulationSocket` receives the `TICK_BROADCAST` message, and if `data.type === "TICK_BROADCAST"` calls `setTelemetry(data)`. The Zustand store's `setTelemetry` reducer performs a diff against the *previous* telemetry frame (not against any independent frontend calculation) to derive purely presentational side effects: newly-raised incidents and newly-resolved incidents drive `floatingTexts` and `resolvedHistory`, and a `running → breached` status transition emits an SLA-warning toast. The store never recomputes SLA, budget, or incident state — it is a passive mirror of the server's payload.
6. **Operator command.** A click on "Acknowledge" or a runbook card issues an HTTP POST through `services/api.ts` (`POST /api/incidents/{id}/acknowledge` or `POST /api/mitigations/execute`). The handler in `app/api/v1/*.py` calls the corresponding synchronous method on `app.state.engine` (`acknowledge_incident` / `apply_mitigation`), which mutates in-memory state, immediately persists the affected `Incident` row via `_persist_incident`, and immediately writes an `AuditLog` row via `_log_audit_event` — independent of the tick loop's own persistence cadence. The next scheduled tick's broadcast (or, if the simulation is paused, no broadcast at all until it is resumed) is what actually informs other connected clients of the new state; the acting client typically also learns synchronously from the HTTP response body.

### 3.2 Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND PROCESS (single)                         │
│                                                                                │
│   asyncio tick loop (SimulationEngine._run_loop)                              │
│   ┌────────────────────────────────────────────────────────────────────┐     │
│   │ sleep(tick_rate_seconds)                                            │     │
│   │        │                                                            │     │
│   │        ▼                                                            │     │
│   │ current_tick += 1                                                   │     │
│   │        │                                                            │     │
│   │        ▼                                                            │     │
│   │ _update_simulation_tick()                                           │     │
│   │   ├─ formulas.instant_sla_percentage(services)  ──► sla_percentage  │     │
│   │   ├─ _apply_budget_burn()          ──► formulas.effective_passive_  │     │
│   │   │                                    burn / incident_surcharge    │     │
│   │   ├─ _apply_happiness_drift()      ──► formulas.alert_fatigue_      │     │
│   │   │                                    penalty                     │     │
│   │   ├─ _progress_incidents()         ──► formulas.is_unattended_      │     │
│   │   │                                    breach → UNATTENDED_ALERT_   │     │
│   │   │                                    VIOLATION audit event        │     │
│   │   ├─ _apply_quiet_period_refactor()──► PROACTIVE_REFACTOR_CYCLE     │     │
│   │   ├─ _evaluate_random_failures()   ──► formulas.cascading_failure_  │     │
│   │   │                                    probability → INCIDENT_      │     │
│   │   │                                    RAISED                      │     │
│   │   └─ _evaluate_session_status()    ──► BANKRUPTCY_LIQUIDATION /     │     │
│   │                                        SLA_BREACH_EMERGENCY_        │     │
│   │                                        SANCTION /                  │     │
│   │                                        MONTHLY_AUDIT_CYCLE_SURVIVED │     │
│   │        │                                                            │     │
│   │        ▼                                                            │     │
│   │ await to_thread(_persist_snapshot)  ──► SQLite: game_sessions,      │     │
│   │                                          services, incidents        │     │
│   │        │                                  (merge/upsert)            │     │
│   │        ▼                                                            │     │
│   │ await broadcast_state()             ──► WebSocket fan-out to every  │     │
│   │                                          connected client            │     │
│   └────────────────────────────────────────────────────────────────────┘     │
│                                                                                │
│   Out-of-band writer (fires immediately, independent of tick cadence):        │
│   _log_audit_event(...)  ──►  SQLite: audit_logs  (single-row INSERT,         │
│                                committed synchronously at call time)          │
│                                                                                │
│   REST command surface (app/api/v1/*):                                       │
│   POST /api/incidents/{id}/acknowledge  ──► engine.acknowledge_incident()     │
│   POST /api/mitigations/execute         ──► engine.apply_mitigation()        │
│   POST /api/session/{start,pause,speed,reset} ──► engine lifecycle control   │
│   GET  /api/audits/postmortem/{incident_id}   ──► reads SQLite, renders      │
│                                                    audits/templates/*.md,     │
│                                                    writes audits/reports/*.md │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │  ws://.../ws/telemetry  (TICK_BROADCAST JSON)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (React SPA)                             │
│                                                                                │
│  useSimulationSocket ──► useGameStore.setTelemetry(payload)                  │
│                              │                                                │
│                              ▼                                                │
│                    Zustand store (single source of truth on the client)      │
│                              │                                                │
│              ┌───────────────┼────────────────────────────┐                  │
│              ▼               ▼                             ▼                 │
│         Topbar gauges   IsometricOffice canvas        BottomDock tabs        │
│         (SLA / Runway / (racks, desks, tooltips,      (Incidents /           │
│          Tech Debt /     hover selection)              Directives /          │
│          Morale)                                        Compliance Ledger)    │
│                                                                                │
│  Operator click ──► services/api.ts (fetch) ──► backend REST endpoint        │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 The `TICK_BROADCAST` Contract

Every WebSocket frame and the response of `GET /api/session/state` share one payload shape, produced by `SimulationEngine.get_state_payload()`:

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
  "services": [ { "id": "srv-auth", "session_id": "...", "name": "Identity & Auth Service", "tier": "critical", "status": "healthy", "latency_ms": 32, "error_rate": 0.0001, "dependencies": [] }, "... four more services ..." ],
  "active_incidents": [ { "id": "inc-a1b2c3", "session_id": "...", "service_id": "srv-payment", "severity": "P1_CRITICAL", "title": "Service disruption detected on Payment Gateway Core", "root_cause": "Memory leak in connection pooling thread", "mtta_seconds": 4, "mttr_seconds": 4, "status": "active", "created_tick": 138, "acknowledged_tick": null, "resolved_tick": null } ],
  "recent_audits": [ "... last 15 audit_logs entries, most-recent-last ..." ]
}
```

`recent_audits` is explicitly capped to the last 15 entries (`self.audit_logs[-15:]`) to bound WebSocket frame size; the full, unbounded ledger is only ever available by querying SQLite directly or via the post-mortem generation pipeline described in Document 05.

---

## 4. REST and WebSocket Surface (Authoritative List)

| Method | Path | Handler | Effect |
|---|---|---|---|
| `GET` | `/api/health` | `sessions.health_check` | Liveness probe; returns `engine_active`, `current_tick`, `active_clients`. No state mutation. |
| `GET` | `/api/session/state` | `sessions.get_state` | Returns the current `TICK_BROADCAST`-shaped snapshot on demand (poll fallback). |
| `POST` | `/api/session/start` | `sessions.start_simulation` | Resumes the tick loop if not already running and not in a terminal status. |
| `POST` | `/api/session/pause` | `sessions.pause_simulation` | Sets `is_running = False` and cancels the loop task. |
| `POST` | `/api/session/speed` | `sessions.set_speed` | Body `{ "multiplier": number }`; sets `tick_rate_seconds = 1 / multiplier`; `multiplier <= 0` is treated as pause. |
| `POST` | `/api/session/reset` | `sessions.reset_simulation` | Restores all initial constants, wipes and re-seeds the database via `_persist_bootstrap`, restarts the loop. |
| `GET` | `/api/services` | `services.list_services` | Returns the live in-memory service array. |
| `GET` | `/api/incidents` | `incidents.list_incidents` | Returns the live in-memory active-incident array. |
| `POST` | `/api/incidents/{incident_id}/acknowledge` | `incidents.acknowledge_incident` | `404` if the incident does not exist or is not `active`; otherwise transitions it to `acknowledged` and logs `INCIDENT_ACKNOWLEDGED`. |
| `GET` | `/api/mitigations/catalog` | `mitigations.get_catalog` | Returns `formulas.MITIGATION_CATALOG` verbatim (see Document 04). |
| `POST` | `/api/mitigations/execute` | `mitigations.execute_mitigation` | Body `{ "action_id": string, "service_id": string }`; `400` on unknown action, unknown service, or insufficient budget; otherwise deducts cost, applies TDI delta, heals the service, resolves matching incidents, logs `RUNBOOK_EXECUTED`. |
| `GET` | `/api/audits` | `audits.list_audits` | Returns the live in-memory audit-log array (unbounded, unlike the 15-entry WebSocket slice). |
| `GET` | `/api/audits/postmortem/{incident_id}` | `audits.generate_postmortem` | `404` if the incident row cannot be found in SQLite; otherwise renders and persists the Markdown report (Document 05). |
| `WS` | `/ws/telemetry` | `ws.websocket_telemetry_endpoint` | On connect: `accept()` then immediately send one `TICK_BROADCAST` snapshot. Thereafter: passive `receive_text()` loop purely to detect `WebSocketDisconnect`; the server does not currently interpret any inbound client message. |

---

## 5. Security & Isolation Boundaries

This section documents the **as-implemented** security posture. Where a control is not present, it is stated plainly rather than implied, consistent with the audit standard of reporting findings faithfully.

### 5.1 CORS Policy

`backend/app/main.py` configures `CORSMiddleware` with:

```python
allow_origins=["*"]
allow_credentials=True
allow_methods=["*"]
allow_headers=["*"]
```

**Finding:** This is a fully permissive cross-origin policy appropriate for local development and single-operator demo deployment. Combining `allow_origins=["*"]` with `allow_credentials=True` is flagged by browsers and by CORS best practice as unsafe for any deployment that relies on cookies or HTTP auth for session integrity; this system does not use cookie-based auth (see § 5.2), which limits the practical exposure, but the configuration should be narrowed to an explicit origin allow-list (driven by the existing `VITE_API_URL` / `FRONTEND_PORT` environment variables) before any multi-tenant or public deployment.

### 5.2 Session Token Integrity

**Finding — no authentication layer exists.** `backend/app/core/config.py`'s `Settings` class exposes only `PROJECT_NAME`, `PORT`, `DATABASE_URL`, and `ENVIRONMENT`. The `.env.example` file at the repository root defines a `SESSION_SECRET` value, but no module in `backend/app/` reads, signs, or verifies anything with it — it is present as a placeholder for future work and is not part of the current control surface. The application:

- Runs exactly one `SimulationEngine` instance per process, keyed to the hardcoded session id `"incidentzero-alpha"` (set in `main.py`'s `lifespan`).
- Accepts every REST call and every WebSocket connection unauthenticated; there is no per-user identity, no bearer token, and no session cookie.
- Attributes every audit-log actor string (`VP_OF_INFRA`, `AUTOMATED_MONITOR`, `AUDIT_SYSTEM`, `BOARD_OF_DIRECTORS`, `PLATFORM_TEAM`) to a **role**, not an authenticated principal. Any client that can reach the HTTP surface can act as `VP_OF_INFRA`.

This is an accepted design boundary for a single-operator simulation and is explicitly out of scope for the SOX-404/SOC 2/ISO 27001 alignment claimed elsewhere in this package with respect to *access control*; the alignment claimed by Document 03 is narrower and pertains specifically to audit-trail completeness and traceability of *actions*, not to authentication or authorization of *actors*.

### 5.3 Environment Configuration

| Variable | Source | Consumed By | Purpose |
|---|---|---|---|
| `PORT` | `.env` / OS environment | `Settings.PORT` | Uvicorn bind port (default `8000`). |
| `DATABASE_URL` | `.env` / OS environment | `Settings.DATABASE_URL`, `core/database.py` | SQLAlchemy connection string; defaults to `sqlite:///./incidentzero.db` (a file relative to the backend working directory). |
| `ENVIRONMENT` | `.env` / OS environment | `Settings.ENVIRONMENT` | Advisory only; no branch in the codebase currently changes behavior based on this value. |
| `VITE_API_URL` / `VITE_WS_URL` | `.env` (frontend, read via `envDir`) | `frontend/src/services/api.ts` | Base URL for REST calls and the WebSocket URL; both default to `http://localhost:8000` / `ws://localhost:8000/ws/telemetry` if unset. |

The SQLite connection is opened with `connect_args={"check_same_thread": False}`, which is required because tick-loop persistence runs on a worker thread via `asyncio.to_thread` while request-handling persistence runs on the event-loop thread; SQLAlchemy's `SessionLocal` sessionmaker creates a short-lived `Session` per call site (each `_persist_snapshot`, `_persist_incident`, and `_log_audit_event` invocation opens and closes its own session), so there is no long-lived cross-thread session object in play.

### 5.4 State Immutability Safeguards

- **Formula purity.** Every function in `formulas.py` is a pure function of its arguments with no reference to engine state, which makes the mathematical layer independently unit-testable and prevents order-of-evaluation bugs from silently altering constants.
- **Single writer.** `SimulationEngine` is the only component in the codebase that opens a SQLAlchemy `Session` for writing; no API handler constructs its own database session or bypasses the engine to mutate rows directly. This guarantees that every write to `services`, `incidents`, or `audit_logs` passed through the tick-evolution or player-action code paths documented in Section 3.
- **Audit rows are never updated or deleted by application code.** The ORM model `AuditLog` (`backend/app/models/audit.py`) is only ever the target of `db.add(...)` calls in `_log_audit_event`; no code path in the repository issues an `UPDATE` or `DELETE` against `audit_logs`. The only way an audit row disappears is the cascade delete triggered by `_persist_bootstrap()` deleting the parent `GameSession` on session reset — an explicit, logged operational reset, not silent tampering (see Document 03, § Ledger Tamper-Evident Design, for the full analysis of this boundary).
- **Idempotent upserts for mutable rows.** `services` and `incidents` are persisted via `Session.merge()`, which is safe to call repeatedly with the same primary key and cannot create duplicate rows; `audit_logs` is persisted via `db.add()` with a freshly generated UUID-derived id (`aud-{uuid4().hex[:6..8]}`) per call, which cannot collide with a prior row's id in a way that would overwrite it.
