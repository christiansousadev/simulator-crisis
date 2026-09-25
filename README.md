# INCIDENTZERO: SRE & IT GOVERNANCE SIMULATOR

![IncidentZero Logo](./frontend/public/shield-alert.svg)

**Language:** 🇺🇸 **English** (default) · [🇧🇷 Português](./README.pt-BR.md)

> **"Silence the alarms. Defend the SLA. Survive the audit."**

IncidentZero is a real-time crisis and systems engineering simulation game. As Head of Infrastructure / VP of Engineering, balance high availability, latency, cascade failures, runbook mitigations, technical debt accumulation, staffing, and compliance audits under live on-call fire — all rendered as a living isometric office.

---

## Features

- **Live crisis simulation** — a deterministic tick loop (1 tick = 1 in-game hour) drives cascading service failures, MTTA/MTTR mechanics, error budgets, and feature freezes, all broadcast over WebSocket to an isometric office view.
- **Runbooks & tech tree** — execute SRE mitigations against failing services and purchase observability/resilience/facility upgrades (APM tracing, predictive anomaly detection, multi-AZ clusters, and more).
- **Staffing & on-call** — hire engineers with a core competency, rotate shifts, and manage stress/stamina under sustained incident load.
- **Governance & CAB dilemmas** — periodic Change Advisory Board trade-offs (budget vs. tech debt vs. morale vs. reputation) with lasting consequences: a persistent **Board Reputation** score shifts the incident hazard rate and unlocks reputation-gated "callback" dilemmas.
- **Difficulty presets** — Intern / Standard / Chaos, each with its own starting runway and hazard multiplier.
- **Compliance ledger & post-mortems** — every governance-relevant action is written to an audit log; conclude an incident into a Markdown or branded PDF post-mortem, complete with an AI-auditor interview and a fast-forward event **replay**.
- **Scripted scenarios & custom scenario builder** — Black Friday Rush, Ransomware Infiltration, Chaos Engineering Drill, plus a sandbox config editor for hazard multipliers, budget floors, and scripted chaos injections.
- **Achievements, cosmetics & career progression** — a 12-entry achievement catalog, prestige-point cosmetic unlocks, and a permanent Hall of Fame (per-player and global leaderboard) that survives every session reset.
- **Guided onboarding** — a spotlight tutorial that highlights the real UI element being explained, plus a contextual "what to do next" hint system for new players.
- **Settings & accessibility** — separate music/SFX volume, high-contrast mode, colorblind-safe palette, and full UI translation.
- **Internationalization** — English (default), Português (Brasil), and Español, with full parity across every UI string.
- **Installable PWA** — the app ships a web manifest and service worker; the app shell installs and loads offline, while every simulation call always hits the live backend (no stale cached game state).

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical blueprint, mathematical formulas, and SQL schemas, and [`audits/docs/`](./audits/docs/) for a per-feature implementation specification of everything above.

---

## Architecture Overview

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons, Zustand store, WebSocket client. Tested with Vitest + Testing Library.
- **Backend:** Python FastAPI, WebSocket telemetry broadcast, SQLAlchemy / SQLite, Pydantic v2. Tested with pytest.
- **Database migrations:** Alembic — the schema is version-controlled and upgraded automatically on every backend startup (`alembic upgrade head` runs inside the FastAPI lifespan). See [Database Migrations](#database-migrations) below.
- **Simulation Engine:** Deterministic tick loop, cascade failure probability, MTTA/MTTR penalty mechanics, SLA/budget/tech-debt formulas in `backend/app/engine/formulas.py`.
- **Governance & Compliance:** Real-time audit log streaming persisted to SQLite, with SOX-404 / SOC2 post-mortem generation (Markdown and PDF) into `audits/reports/`.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) runs the full backend and frontend test suites, a TypeScript type-check, and a production build on every push and pull request.

---

## Quickstart

### Option A — one-shot start scripts

```bash
# Windows PowerShell
.\start.ps1

# macOS/Linux/Git Bash
./start.sh
```

Both scripts create the backend virtual environment (if missing), install dependencies, and run the FastAPI and Vite dev servers concurrently.

### Option B — Docker Compose

```bash
docker compose up --build
```

### Option C — manual, two terminals

**Backend**
```bash
cd backend
python -m venv .venv
.\.venv\Scripts\activate        # Windows
# source .venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Database migrations run automatically on startup — you never need to delete the database file by hand when a model changes (see [Database Migrations](#database-migrations)).

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` to enter the War Room. Backend interactive API docs live at `http://localhost:8000/docs`.

---

## Database Migrations

Schema changes are managed with [Alembic](https://alembic.sqlalchemy.org/), not `Base.metadata.create_all()` — the latter only creates missing tables, it never alters an existing one to add a new column, which used to mean deleting the whole SQLite file every time a model changed. That's no longer necessary:

- On every backend startup, `app/main.py` runs `alembic upgrade head` automatically before the simulation engine starts.
- If you change a SQLAlchemy model, generate a new migration before restarting the backend:
  ```bash
  cd backend
  alembic revision --autogenerate -m "describe your change"
  ```
- If a database predates Alembic entirely (no `alembic_version` table), startup raises a clear error asking you to delete that one file and let migrations recreate it — a one-time-only step for a genuinely legacy database, not routine maintenance.

---

## Testing & CI

```bash
# backend — from backend/, with the virtualenv active
pytest tests/ -v

# frontend — from frontend/
npx tsc --noEmit     # type-check
npm test             # vitest unit suite
npm run build        # production build
```

All four checks run automatically in CI on every push and pull request (`.github/workflows/ci.yml`).

---

## Key API Endpoints

The backend exposes 30+ REST endpoints across 13 domain routers plus one WebSocket stream. The table below groups them by domain; the full request/response contract for every endpoint is available live at `http://localhost:8000/docs` (FastAPI's interactive Swagger UI).

| Router | Base path | Covers |
|---|---|---|
| Sessions | `/api/session/*`, `/api/health` | Lifecycle (start/pause/reset), speed control, full telemetry snapshot |
| Services | `/api/services` | Service mesh topology |
| Incidents | `/api/incidents/*` | Active incident stream, acknowledge, log-triage mini-game |
| Mitigations | `/api/mitigations/*` | Runbook catalog and execution |
| Audits | `/api/audits/*` | Compliance ledger, Markdown/PDF post-mortems, AI-auditor interview |
| Upgrades | `/api/upgrades/*` | Tech tree catalog and purchases |
| Dilemmas | `/api/dilemmas/*` | CAB dilemma resolution |
| Staff | `/api/staff/*` | Hiring and shift rotation |
| Scenarios | `/api/scenarios/*` | Scripted scenario catalog, active scenario state, custom scenario loader |
| Infrastructure | `/api/infrastructure/*` | Build-mode node catalog, placement, removal |
| Achievements | `/api/achievements/*` | Achievement catalog |
| Cosmetics | `/api/cosmetics/*` | Cosmetic catalog and prestige-point unlocks |
| Career | `/api/career/records` | Hall of Fame — per-player (`scope=mine`) or global (`scope=global`) |
| WebSocket | `/ws/telemetry` | Live tick broadcast stream |

---

## Project Structure

```
simulator-crisis/
├── backend/    FastAPI app: engine, models, schemas, api/v1 routers, alembic migrations, pytest suite
├── frontend/   React + Vite + TS war-room dashboard, i18n (en/pt-BR/es), vitest suite
├── audits/     Post-mortem template, generated reports, and per-feature implementation specs (audits/docs/)
└── .github/    CI workflow
```
