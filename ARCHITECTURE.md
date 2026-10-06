# INCIDENTZERO: ARCHITECTURAL BLUEPRINT & SRE CRISIS SIMULATOR SPECIFICATION

**Status:** Implementado — blueprint reconciled with the code (Revisão Técnica Atualizada)  
**Last Updated:** Outubro 2026  
**Scope of this document:** a concise orientation map. The authoritative, line-by-line specifications live in [`audits/docs/`](./audits/docs/) (Documents 01-05), [`audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md`](./audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md) and [`audits/docs/implementations/`](./audits/docs/implementations/). Where this file and those documents disagree, the documents (which are checked against the code) win. This revision was written by reading `backend/app/**` and `frontend/src/**`; it was not machine-verified.

## 1. BRANDING & IDENTITY

- **Primary Project Name:** IncidentZero
- **Alternative Candidates:** OutageOps, SLA Breaker: Crisis War Room, StatusPage Zero
- **Tagline:** "Silence the alarms. Defend the SLA. Survive the audit."
- **Visual Motif:** Cyber-industrial mission control, SRE war room telemetry, glowing state nodes, crimson alert pulses, and audit trail ledgers.

### Minimalist SVG Favicon / Logo
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="shieldGrad" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="neonPulse" x1="16" y1="16" x2="48" y2="48" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="50%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#f43f5e" />
    </linearGradient>
  </defs>
  <!-- DEFENSIVE SHIELD CONTAINER -->
  <path d="M32 4L10 14V30C10 44 19 55 32 60C45 55 54 44 54 30V14L32 4Z" fill="url(#shieldGrad)" stroke="#38bdf8" stroke-width="2.5" stroke-linejoin="round" />
  <!-- RACK NODE CLUSTER -->
  <rect x="20" y="18" width="24" height="6" rx="2" fill="#1e293b" stroke="#64748b" stroke-width="1.5" />
  <circle cx="25" cy="21" r="1.5" fill="#10b981" />
  <circle cx="30" cy="21" r="1.5" fill="#38bdf8" />
  <rect x="20" y="28" width="24" height="6" rx="2" fill="#1e293b" stroke="#f43f5e" stroke-width="1.5" />
  <circle cx="25" cy="31" r="1.5" fill="#f43f5e" />
  <circle cx="30" cy="31" r="1.5" fill="#f59e0b" />
  <rect x="20" y="38" width="24" height="6" rx="2" fill="#1e293b" stroke="#64748b" stroke-width="1.5" />
  <circle cx="25" cy="41" r="1.5" fill="#10b981" />
  <circle cx="30" cy="41" r="1.5" fill="#10b981" />
  <!-- PULSE HEARTBEAT OVERLAY -->
  <path d="M16 48L24 48L28 42L33 52L37 45L40 48L48 48" stroke="url(#neonPulse)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>
```

---

## 2. DIRECTORY TREE (CONDENSED, AS IMPLEMENTED)

```text
simulator-crisis/
├── .env.example               # template only: the backend does not auto-load a .env file
├── .github/                   # CI workflow (ruff + pytest; eslint + tsc + vitest + build), issue/PR templates
├── docker-compose.yml, Makefile, start.sh, start.ps1
├── README.md, README.pt-BR.md, ARCHITECTURE.md, SECURITY.md, CHANGELOG.md
├── audits/
│   ├── docs/                  # IZ-ARCH-01 .. IZ-SOP-05 + implementations/ (feature specs 01-10)
│   ├── specs/                 # AUDIT_LEDGER_DATA_DICTIONARY.md
│   ├── templates/             # post_mortem_template.md
│   └── reports/               # generated post-mortems (created on demand); interviews/ is created on demand too
├── docs/screenshots/
├── backend/
│   ├── pyproject.toml, requirements.txt, Dockerfile, alembic.ini
│   ├── alembic/versions/      # 7 revisions, merge head fef99a15e754
│   ├── tests/                 # pytest: formulas, engine features, scenarios, API smoke, migrations
│   └── app/
│       ├── main.py            # FastAPI app, lifespan (migrate -> engine -> start), CORS, state-push middleware
│       ├── core/              # config.py, database.py, state_push.py, version.py
│       ├── engine/            # simulator.py, formulas.py, event_generator.py, log_generator.py,
│       │                      # dilemmas.py, infrastructure.py, staff.py, upgrades.py, achievements.py,
│       │                      # cosmetics.py, scenarios/ (6 registered + custom)
│       ├── models/            # SQLAlchemy tables (see section 4)
│       ├── schemas/           # Pydantic request/response models
│       └── api/
│           ├── router.py      # aggregates 14 REST routers + the WebSocket router
│           └── v1/            # sessions, services, incidents, mitigations, audits, upgrades, dilemmas, staff,
│                              # scenarios, infrastructure, tutorial, achievements, cosmetics, career, ws
└── frontend/
    ├── index.html, package.json, vite.config.ts (PWA + manual chunks), tailwind.config.js, playwright.config.ts
    ├── e2e/                   # Playwright specs
    └── src/
        ├── main.tsx, App.tsx  # path branch: /live-ops spectator view, otherwise the game
        ├── types/game.ts      # wire types mirroring the backend payloads
        ├── services/api.ts    # typed fetch client + WS_URL
        ├── store/             # useGameStore.ts (game + UI state), useFlowStore.ts (screen-flow presentation)
        ├── hooks/             # socket, audio, shortcuts, tutorial engine, catalogs, objectives, presence ...
        ├── i18n/              # en in main chunk; locales/{pt-BR,es} lazy chunks via loadLanguage.ts
        ├── utils/             # audioEngine/musicEngine/sound, modalStack, kpi bands, DEFCON, office clock ...
        └── components/
            ├── layout/        # Topbar, BottomDock, CorporateNewsTicker, ScreenTransition
            ├── office/        # isometric SVG scene, camera, lighting, engineers, build mode
            ├── dock/          # incidents, directives (runbooks), compliance ticker, upgrades tree, roster, achievements, metrics
            ├── modals/        # title, scenario select/builder/briefing, incident detail, triage, post-mortem, CAB, debrief ...
            ├── common/        # meters, Modal, toasts, floating combat text, shared widgets
            ├── flow/          # lazy modal host/loader, menu navigation
            ├── tutorial/      # guided tutorial overlay and steps
            └── live-ops/      # read-only second-monitor dashboard
```

---

## 3. GAME MECHANICS & SIMULATION ENGINE (FORMULAS & STATE)

The exact constants and the full hazard chain are specified in [Document 02](./audits/docs/02_MATHEMATICAL_ENGINE_AND_SLA_SPECIFICATION.md) and [Document 04](./audits/docs/04_RUNBOOK_CATALOG_AND_MITIGATION_MATRIX.md); the summary below is for orientation.

### 3.1 Game Loop & Time Scale
- **Base Simulation Tick:** $1.0\text{ second (real-time)} = 1\text{ game hour}$ at 1x.
- **Day / Month:** $24\text{ ticks} = 1\text{ game day}$; $720\text{ ticks} = 1\text{ audit month}$ (the rolling SLA window and the sandbox victory threshold).
- **Speed Multipliers:** paused (loop cancelled), `1x` (1.0 s/tick), `2x` (0.5 s/tick), `5x` (0.2 s/tick); the API accepts any multiplier in $(0, 10]$.
- **Tick order** (strict, in `SimulationEngine._update_simulation_tick`): SLA window and error budget, budget burn, happiness drift, incident MTTA/MTTR, quiet-period refactor, random failures, scenario hook, session status (early exit on a terminal tick), feature freeze, staff fatigue, pre-alerts, CAB dilemma, achievements.

### 3.2 Core Variables
1. **Budget / Runway ($ USD):**
   - Initial depends on difficulty: `intern` $320,000, `standard` $250,000, `chaos` $180,000.
   - Passive burn: `Cloud ($200/tick) + Payroll ($450/tick) = $650/tick`, multiplied by 1.5 while user happiness is below 40%.
   - Outage surcharge: per open incident, $\text{SeverityBase} \times (1 + 0.08 t)^{1.3}$ per tick (P1 800, P2 250, P3 100, P4 40).
   - Failure condition: `budget <= 0` (bankruptcy, run ends).
2. **Global SLA %:**
   - Rolling mean of the last 720 per-tick weighted availability samples (critical services weigh 3, standard 1).
   - Target `99.90%` (error budget `0.10%`); exhausting it engages a **feature freeze** that blocks discretionary hotfixes.
   - Rolling SLA `< 99.00%` after a 24-tick grace period flips the status to `breached` and logs `SLA_BREACH_EMERGENCY_SANCTION` (a status/compliance signal; no cash penalty).
3. **User Happiness (0.0 to 100.0%):** drifts down while any service is unhealthy, recovers slowly otherwise, and is hit by alert fatigue on unacknowledged incidents; below 40% it accelerates the passive burn.
4. **Technical Debt Index (TDI) (0 to 100 points):**
   - Baseline start: `25`.
   - Raised by quick-and-dirty runbooks (hotfix +8, circuit breaker +3, scale replicas +1) and mismatch taxes; lowered by rollbacks (-2), quiet-period refactors (-1 per 20 incident-free ticks) and some CAB choices.
   - Raises the stochastic failure hazard of every service.
5. **Governance Reputation (0-100, starts at 50):** shaped by CAB dilemma choices; below 25 it multiplies hazard by 1.15, above 75 by 0.90.

### 3.3 Mathematical Formulas (summary)

#### Formula 1: SLA Availability
Each service has weight $w_i = 3.0$ (critical: `srv-auth`, `srv-payment`, `srv-api-gw`) or $1.0$ (standard: `srv-search`, `srv-notify`). Unavailability $U_i(t)$:

$$U_i(t) = \begin{cases}
0.0 & \text{healthy} \\
\min\left(1.0,\; 0.5\cdot\max\left(0, \frac{\text{latency\_ms} - 100}{1000}\right) + 0.5\cdot\text{error\_rate}\right) & \text{degraded} \\
1.0 & \text{down}
\end{cases}$$

$$SLA_{tick}(t) = 100 \times \left(1 - \frac{\sum_i w_i \cdot U_i(t)}{\sum_i w_i}\right), \qquad SLA_{rolling}(t) = \frac{1}{|W_t|}\sum_{s\in W_t} SLA_{tick}(s), \quad |W_t| \le 720$$

#### Formula 2: Outage Cascading Probability
Per healthy service per tick, before the call-site multipliers (fan-in exposure, specialist coverage, decision windows, upgrades, infrastructure nodes, scenario, difficulty, reputation):

$$P_{raw}(i) = 0.015 \cdot \left(1 + \frac{\text{TDI}}{35}\right)^{1.8} \cdot \prod_{d \in \text{Deps}(i)} \begin{cases} 4.5 & d \text{ down} \\ 2.8 & d \text{ degraded} \\ 1 & \text{otherwise}\end{cases}$$

The product of all multipliers is clamped once, at the end, to $[0, 0.65]$.

#### Formula 3: MTTA & MTTR Penalty Impact
- **MTTA** (ticks an incident stays unacknowledged): ticks 5-11 drain $1.5$ happiness per tick; from tick 12 each tick logs `UNATTENDED_ALERT_VIOLATION` and fines `$4,500`. MTTR and MTTA are elapsed counts and never rewritten.
- **MTTR cost:** surcharge per tick as above, with the elapsed time scaled by the assigned specialist's recovery multiplier.

---

## 4. DATABASE SCHEMA & DATA CONTRACTS

### 4.1 Persistence (SQLite via SQLAlchemy 2.x, Alembic migrations applied on boot)

| Table | Purpose |
|---|---|
| `game_sessions` | One live session row (`incidentzero-alpha`): budget, SLA, TDI, happiness, status, tick, difficulty, reputation, scenario state, cooldowns, hazard windows, RNG state, the 720-sample SLA window and the error-budget history (full crash-resume snapshot, `schema_version`). |
| `services` | The five fixed microservices and their live health. |
| `incidents` | Incident lifecycle plus frozen forensic facts (`tech_debt_at_creation/resolution`, `accrued_surcharge`, triage state, the log stream and its answer key). |
| `audit_logs` | Append-only governance ledger (34 event types; see the data dictionary). |
| `engineers`, `purchased_upgrades`, `dilemma_events`, `infrastructure_nodes` | Session-scoped roster, tech-tree purchases, CAB history and placed build-mode nodes. |
| `achievements`, `unlocked_cosmetics`, `career_records` | Permanent career progression; **not** deleted by a session reset. |
| `mitigation_actions` | Declared by the initial migration but unused: the runbook catalog is served from `formulas.MITIGATION_CATALOG`. |

Session-scoped rows are removed with their session by the ORM cascade on reset (SQLite's `foreign_keys` pragma is off). Routine per-tick burn and surcharges are not written to the ledger; discrete financial events are (see Document 01, § 5.4).

### 4.2 Wire Contracts
- **REST:** 37 routes under `/api/**` in 14 routers (the authoritative table is Document 01, § 4). Request bodies are Pydantic models in `backend/app/schemas/`; refusals return `400`/`404`/`409` (plus `422` validation, `429` and `503` on the AI interview route) with an engine error text.
- **WebSocket `/ws/telemetry`:** one `TICK_BROADCAST` frame per tick, on connect and after every successful state-changing command (`app/core/state_push.py`), plus event frames `DILEMMA_OFFERED`, `PRE_ALERT_WARNING`, `ACHIEVEMENT_UNLOCKED`. The `TICK_BROADCAST` shape is `SimulationEngine.get_state_payload()` (annotated example in Document 01, § 3.3; TypeScript mirror in `frontend/src/types/game.ts`). The triage answer key (`log_lines`, `root_cause_line_id`) is stripped and `root_cause` is withheld until triage is solved.
- **Runbook, upgrade, achievement and cosmetic catalogs:** served from code (`GET /api/*/catalog`); the engine ships 4 runbooks, 6 upgrades, 4 infrastructure node types, 12 achievements and 3 cosmetics.
- **Scenarios:** six registered (`black_friday_rush`, `chaos_engineering_drill`, `ddos_global`, `deployment_rollback`, `ransomware_infiltration`, `third_party_outage`) plus the player-configured `custom` scenario, plus the sandbox (no scenario).

---

## 5. UI/UX WAR-ROOM LAYOUT

```
+----------------------------------------------------------------------------------------------------+
| TOPBAR: identity + office clock | SLA shield | error budget | runway | TDI | morale | reputation |   |
|         DEFCON meter | speed controls (1x 2x 5x, pause) | help / hall of fame / settings buttons    |
+----------------------------------------------------------------------------------------------------+
| CORPORATE NEWS TICKER                                                                              |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|   ISOMETRIC OFFICE (SVG scene, pan / zoom camera, day-night + DEFCON lighting)                      |
|   server racks per service, engineers, build-mode overlay, floating combat text, minimap           |
|                                                                                                    |
+----------------------------------------------------------------------------------------------------+
| BOTTOM DOCK (collapsible tabs): Incidents | Directives (runbooks) | Compliance (audit ticker) |    |
|                                 Upgrades | Roster | Achievements | Metrics                          |
+----------------------------------------------------------------------------------------------------+
| Overlays: title screen, scenario select/builder/briefing, incident detail + log-triage terminal,    |
| CAB dilemma, post-mortem, debrief, hall of fame, settings, tutorial coach cards                     |
+----------------------------------------------------------------------------------------------------+
```

- The layout is a full-screen office scene with a HUD on top (`Topbar`) and a tabbed dock at the bottom (`BottomDock`); there are no fixed left/right side panels.
- Styling is Tailwind CSS with design tokens in `tailwind.config.js` and `index.css`; keyboard shortcuts are routed through `useGameShortcuts`, which stays quiet while a modal is open.
- The same telemetry also drives a read-only spectator dashboard at `/live-ops` for a second monitor.

### 5.1 Frontend runtime architecture

The frontend holds no simulation math: it renders the latest backend snapshot and adds client-only presentation state.

- **Data flow:** `useSimulationSocket` receives frames and calls `useGameStore.setTelemetry`, which structurally shares unchanged arrays/objects between frames so selectors only re-render on real changes. Commands go through `services/api.ts`; the backend answers the REST call and pushes the new state frame, so the UI converges without waiting for the next tick.
- **State:** `useGameStore` (telemetry, selections, modal flags, floating text / KPI event queues, tutorial progress, accessibility and audio preferences) and the small `useFlowStore` (deploy overlay, shift banner, office intro). Derived values (DEFCON level, KPI bands, incident impact) live in `utils/`.
- **Localization:** English is bundled; `pt-BR` and `es` are separate chunks (`i18n/locales/*`) fetched by `i18n/loadLanguage.ts` before first render or on language change, with dynamic game content (`dynamicContent.ts`) registered alongside the dictionary.
- **Audio:** a single lazily created Web Audio graph (`utils/audioEngine.ts`) feeds procedural effects (`utils/sound.ts`) and layered music (`utils/musicEngine.ts`); no audio files. Hooks (`useGameAudio`, `useBackgroundMusic`) translate game state (incidents, DEFCON, pause, terminal status) into sound.
- **Camera and lighting:** `components/office/cameraController.ts` (spring-damped pan/zoom, published through `cameraBus` so the minimap never causes React renders) and `lighting.ts` + `lightingBus.ts` (tick-hour and DEFCON targets eased by a rAF driver and written as CSS custom properties).
- **Modals:** `components/common/Modal.tsx` registers each open dialog in `utils/modalStack.ts` (Escape ownership, shortcut suppression); non-critical dialogs are code-split in `components/flow/lazyModals.ts` and warmed while the title screen is idle, while the timed CAB dialog stays eager.
- **Further detail:** the interaction, motion and feedback layer (screen-flow transitions, KPI events, presence animations, reduced-motion handling) is specified in [`audits/docs/implementations/10_UX_INTERACTION_AND_MOTION_LAYER_SPEC.md`](./audits/docs/implementations/10_UX_INTERACTION_AND_MOTION_LAYER_SPEC.md).

---

## 6. BACKEND & FRONTEND IMPLEMENTATION MAP

- **Backend entry:** `backend/app/main.py` runs Alembic to `head`, creates the single `SimulationEngine`, starts the tick loop and mounts the 14 REST routers and the WebSocket router. A pure ASGI middleware re-broadcasts state after each successful `POST`/`DELETE`. CORS is wide open by design (local demo; see [`SECURITY.md`](./SECURITY.md)).
- **Engine authority:** `SimulationEngine` owns all mutable game state and is the only place `budget` changes (`_apply_financial_event`); `formulas.py` is pure; scenarios plug in through `ScenarioEngine` hooks.
- **Optional AI auditor:** `audits.py` calls an OpenAI-compatible chat-completions endpoint configured by `LLM_API_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL_ID`; with an empty key the interview route answers `503` and the rest of the game is unaffected.
- **Frontend entry:** `main.tsx` loads the stored language, then renders `App` (or `LiveOpsView` for `/live-ops`). Production build is Vite with a PWA shell (`vite-plugin-pwa`) and stable `vendor-react` / `locale-*` chunks.

---

## 7. QUALITY GATES & OPERATIONS

- **CI** (`.github/workflows/ci.yml`): backend `ruff` + `pytest --cov`; frontend `eslint`, `tsc`, `vitest --coverage` and `vite build`. Local equivalents: `make lint`, `make test`.
- **End-to-end:** Playwright specs in `frontend/e2e/` (`npm run test:e2e`).
- **Run:** `./start.sh` / `start.ps1` for local development, `make dev`, or `docker compose up --build`. Environment variables are documented in [`.env.example`](./.env.example).
- **Detailed specs:** quality gates and installability are in [`audits/docs/implementations/08_QUALITY_GATES_AND_INSTALLABILITY_SPEC.md`](./audits/docs/implementations/08_QUALITY_GATES_AND_INSTALLABILITY_SPEC.md).
