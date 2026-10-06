# Quality Gates and Installability — Implementation Specification

**Document ID:** IZ-IMPL-08  
**Classification:** Technical Specification / Quality Gates & Tooling  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `frontend/vite.config.ts`, `frontend/playwright.config.ts`, `frontend/src/test/setup.ts`, `.github/workflows/ci.yml`, `backend/pyproject.toml`, `frontend/src/components/layout/Topbar.tsx`, `frontend/src/components/layout/BottomDock.tsx`, `frontend/src/components/common/Modal.tsx`

---

## 1. System Objective

Three gaps unrelated to gameplay but load-bearing for the project's ability to keep changing safely, all of which this document records as closed: the frontend had zero automated tests (originally `backend/tests/` held 32 pytest cases and nothing under `frontend/src` was exercised outside manual play), there was no CI pipeline of any kind, and the app was not installable as a PWA nor safe to use below roughly 700px wide. The suites have since grown to 93 backend tests, 354 frontend unit tests and 8 end-to-end tests (§ 2, § 3). None of these are player-visible features; all three exist to catch the class of regression this project has already hit by hand in production (a stale WS payload shape, a missing DB column) before it reaches a running instance.

---

## 2. Test Suites

### 2.1 Frontend Unit Tests (Vitest)

`vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event` and `jsdom` are dev dependencies. `vite.config.ts` carries a `test` block (`environment: "jsdom"`, `setupFiles: ["./src/test/setup.ts"]` which loads `@testing-library/jest-dom/vitest`, `globals: true`, `css: false`) guarded by a `/// <reference types="vitest/config" />` directive, and **excludes `e2e/**`**, because the Playwright specs use a different `test` API and would otherwise be picked up by Vitest's default `**/*.spec.ts` glob. Scripts: `npm test` (`vitest run`, used in CI), `test:watch`, `test:coverage` (`@vitest/coverage-v8`, used in CI), `lint` (`eslint .`) and `test:e2e`.

At the time of this update the suite is **354 tests in 52 files**, colocated with the code they cover: the store (`src/store/`), pure utilities such as the CAB countdown math, KPI bands, replay events and debrief timeline (`src/utils/`, the largest group), office-scene logic (waypoint graph, roster plan and stage, lighting, camera math, scene layout), flow/menu navigation, the tutorial overlay, hooks, i18n locale loading, and component render tests (`ReputationMeter`, `CreditCounter`, `LiveSparkline`, `ObjectiveHint`, gameplay modals). The original three suites remain the regression anchors: the store test guards the "stale backend frame omits a newer field" crash class (`setTelemetry` must fill every absent field from `INITIAL_TELEMETRY`), `ObjectiveHint.test.tsx` covers the objective-priority hook, and `ReputationMeter.test.tsx` covers the meter's clamping at both ends of 0–100. Test files compile under the project-wide `tsconfig` and are not part of the production bundle.

### 2.2 Backend Tests (pytest)

`backend/tests/` holds **93 tests** (`test_formulas.py`, `test_engine_features.py`, `test_api_smoke.py`, `test_ux_backend.py`, `test_new_scenarios.py`, `test_log_generator.py`, `test_migrations.py`); `test_migrations.py` runs the real Alembic `upgrade head` against a fresh SQLite file. pytest and coverage are configured in `backend/pyproject.toml` (`testpaths = ["tests"]`, coverage source `app`).

### 2.3 End-to-End Tests (Playwright)

`frontend/e2e/` holds **8 tests in 6 spec files** (incident card click, mitigation cooldown toast, ping-pong ball sync, smoke, wandering employee movement, wheel zoom) plus a shared `helpers.ts`. `playwright.config.ts` runs Chromium at a 1600x1000 viewport, one worker and no parallelism (the specs share one live backend session and each resets it in `beforeEach`), one retry on CI, and its `webServer` block starts both servers itself (`npm run dev` on 5173 and `python -m uvicorn app.main:app` on 8000, with `reuseExistingServer` only outside CI). The suite drives the real app end to end (a real WebSocket and SQLite session), which is exactly the class of bug unit tests cannot see.

Gate results observed during the October 2026 update are listed in `07_DIFFICULTY_REPUTATION_AND_SESSION_RESILIENCE_SPEC.md` § 7.

---

## 3. Continuous Integration

`.github/workflows/ci.yml`, triggered on every push to `main`/`master` and on every pull request, runs three independent jobs on `ubuntu-latest`:

- **Backend (ruff, pytest + coverage)** — Python 3.12 with pip caching, `pip install -r requirements.txt`, `python -m ruff check .`, then `python -m pytest tests/ -v --cov=app --cov-report=term-missing`.
- **Frontend (eslint, typecheck, unit tests + coverage, build)** — Node 20 with npm caching, `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm run test:coverage`, `npm run build` (`tsc && vite build`).
- **End-to-end (Playwright, real backend + frontend)** — installs both toolchains, `npx playwright install --with-deps chromium`, then `npm run test:e2e`; on failure it uploads `frontend/playwright-report/` as an artifact (7-day retention).

`.github/dependabot.yml` keeps dependencies current. Nothing in the toolchain is Windows-specific (SQLite, FastAPI, Vite and Node run identically on Linux), so CI on Linux does not hide a platform gap from the Windows-based local dev loop. Lint is part of the same jobs as the tests it annotates rather than a separate job, so a lint regression fails the same check a reviewer is already looking at; at the time of this update the ruff step passes with no findings (see `07_...` § 7).

---

## 4. PWA Installability

`vite-plugin-pwa` is configured in `vite.config.ts` with `registerType: "autoUpdate"`. The manifest reuses the project's branded `shield-alert.svg` as its sole icon (`sizes: "any"`, `purpose: "any"`) rather than generating binary PNG assets; a dedicated maskable 512x512 PNG would be a worthwhile follow-up for installers that still require one. The Workbox `globPatterns` (`**/*.{js,css,html,svg}`) precache the built app shell, **including the lazily loaded chunks** (feature code and the per-locale bundles), so the installed app works with those chunks available offline: the `sw.js` generated by the current build lists 31 precache entries (the exact number changes whenever chunks are added). **No runtime caching is registered**, so every `/api/*` REST call and the `/ws/telemetry` WebSocket always reach the live simulation backend — a stale cached game-state response would be actively harmful for a real-time simulation. `index.html` carries a `theme-color` meta tag matching the manifest's `#0f172a`. A production build emits `dist/manifest.webmanifest`, `dist/sw.js`, `dist/workbox-*.js` and `dist/registerSW.js`.

The build's chunking strategy (stable `vendor-react` and per-locale chunk names via `manualChunks`, lazy loading) is summarized in `09_VISUAL_POLISH_AND_HUD_CONSISTENCY_SPEC.md` § 12 and is not repeated here.

---

## 5. Mobile/Narrow-Viewport Responsiveness

The two chrome bars visible on every screen, `Topbar.tsx` and `BottomDock.tsx`, handle narrow viewports as follows (verified against the current components):

- **Topbar:**
  - **Company identity (left, `shrink-0`):** the title and the office clock hide below `md`; the connection pill collapses to a status dot below `sm`.
  - **Primary status cluster (centre, `data-tour="topbar-kpis"`, `role="group"`):** one bordered container that is always visible and holds the critical ops metrics with fixed widths: `DefconMeter`, `ShieldGauge` (SLA), `ErrorBudgetMeter` and **`CreditCounter` (cash)**, separated by dividers. Cash is therefore never folded away.
  - **Secondary indicators (tech debt, morale, reputation):** a `useMediaQuery("(min-width: 1720px)")` decides where they live, and exactly one copy is ever mounted. At >= 1720 px they render inline beside the primary cluster; below that they sit in a labelled **"Indicators" popover** (`Gauge` icon, the word "Indicators" from `sm` upward, chevron). The trigger carries three tiny status dots coloured by each meter's current band, so a red indicator is visible without opening the popover; the popover is a `HudPopover` (about 15 rem wide) anchored `bottom-end`, with `aria-expanded`/`aria-haspopup` on the trigger.
  - **Meta controls and speed (right, `shrink-0`):** new game, help, hall of fame and settings icon buttons, then the speed group (menu button, pause/resume, 1x/2x/5x). The `Esc` key hint shows only from 1800 px.
  - *Historical note:* an earlier iteration used an `overflow-x-auto` strip with edge fades, which clipped meters without a clear affordance; the primary cluster plus popover design superseded it.
- **BottomDock:** seven tabs exist (incidents, directives, compliance, upgrades, roster, achievements, metrics), of which three (incidents, directives, compliance) are always in the tab strip and the rest sit behind a **"More" menu** (a portalled `HudPopover`, so the strip's overflow can no longer clip it) whose button aggregates the hidden tabs' badges. Tab labels hide below `sm`, leaving icon, hotkey chip and badge; the strip also scrolls horizontally as a safety net. The collapse toggle (hotkey `D`) is a sibling of the scrollable strip, so it never scrolls out of view, and the panel collapses with a grid-rows animation.
- **Modals:** every dialog, including `CABDilemmaModal` and `IncidentDetailModal`, now uses the shared `Modal` primitive (`components/common/Modal.tsx`), which provides the `p-4` side gutter, a `max-h-[90vh]` panel with internal scrolling, a focus trap, Escape-stack handling and a z-index layer (`dialog`, `system`, `critical`, `tutorial`). The CAB modal's two-choice grid stacks to one column below `sm`.

Out of scope: the isometric office canvas and its pointer interactions were not redesigned for touch; a real touch-input pass is a materially larger project and is not claimed as done.

---

## 6. Quality Gate Status

*Implementação e configurações presentes no código e verificadas em Outubro 2026: pytest (93 testes), vitest (354 testes), ruff, eslint, tsc, build de produção e os 8 testes Playwright executados com sucesso durante esta atualização.*
