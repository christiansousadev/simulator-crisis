# Quality Gates and Installability — Implementation Specification

**Document ID:** IZ-IMPL-08  
**Classification:** Technical Specification / Quality Gates & Tooling  
**Status:** Implementado  
**Source of Truth:** `frontend/vite.config.ts`, `frontend/src/test/setup.ts`, `.github/workflows/ci.yml`, `frontend/src/components/layout/Topbar.tsx`, `frontend/src/components/layout/BottomDock.tsx`

---

## 1. System Objective

Three gaps unrelated to gameplay but load-bearing for the project's ability to keep changing safely: the frontend had zero automated tests (`backend/tests/` held 32 pytest cases; nothing under `frontend/src` was ever exercised outside manual play), there was no CI pipeline of any kind (`.github/workflows/` did not exist), and the app was not installable as a PWA nor safe to use below roughly 700px wide. None of these are player-visible features; all three exist to catch the class of regression this project has already hit by hand in production (a stale WS payload shape, a missing DB column) before it reaches a running instance.

---

## 2. Frontend Test Suite (Vitest)

`vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom` were added as dev dependencies. `vite.config.ts` gained a `test` block (`environment: "jsdom"`, a `setupFiles` entry loading `@testing-library/jest-dom/vitest`) guarded by a `/// <reference types="vitest/config" />` triple-slash directive, since Vite's own `UserConfig` type has no `test` field without Vitest's module augmentation. `package.json` gained `test` (`vitest run`, used in CI) and `test:watch` scripts. Three initial suites, colocated with the code they cover per the project's existing convention of colocated tests being straightforward to discover:

- `src/store/useGameStore.test.ts` — a direct regression guard for the exact "stale backend frame omits a newer field" crash class this project hit in production: asserts `setTelemetry` fills every field absent from a partial frame from `INITIAL_TELEMETRY` rather than leaving it `undefined`, plus the incident-spawn/incident-resolve floating-text and `resolvedHistory` bookkeeping.
- `src/components/common/ObjectiveHint.test.tsx` — the `useNextObjectiveKey` priority hook (exported for testability) exercised via `@testing-library/react`'s `renderHook`, covering the full acknowledge → hire → upgrade → build-mode → achievement priority chain and the "nothing left to suggest" terminal case.
- `src/components/common/ReputationMeter.test.tsx` — a render smoke test for the new meter (Document `07_DIFFICULTY_REPUTATION_AND_SESSION_RESILIENCE_SPEC.md` § 3), including its bar-width clamping at both ends of the 0–100 range.

`npm run build` (`tsc && vite build`) and `npx tsc --noEmit` were re-verified clean after every change in this batch; test files compile under the same project-wide `tsconfig` and are excluded from the production bundle automatically, since Vite only bundles from the app's real entry point graph.

---

## 3. Continuous Integration

`.github/workflows/ci.yml` (new), triggered on every push to `main`/`master` and on every pull request, with two independent jobs:

- **Backend** — Python 3.12, `pip install -r backend/requirements.txt`, `pytest tests/ -v` from `backend/`.
- **Frontend** — Node 20, `npm ci` (requires the committed `package-lock.json`), `tsc --noEmit`, `npm test` (the new Vitest suite, § 2), `npm run build`.

Both jobs run on `ubuntu-latest` regardless of the fact that day-to-day development on this project has so far happened on Windows; nothing in either the backend or frontend toolchain is Windows-specific (SQLite, FastAPI, Vite and Node all run identically on Linux), so this does not introduce a platform gap the local dev loop wouldn't already have caught.

---

## 4. PWA Installability

`vite-plugin-pwa` (new dev dependency) is configured in `vite.config.ts` with `registerType: "autoUpdate"`. The manifest reuses the project's existing branded `shield-alert.svg` mark as its sole icon (`sizes: "any"`, `purpose: "any"`) rather than generating new binary PNG assets — most modern installers accept a single SVG icon this way, though a dedicated maskable 512×512 PNG would be a worthwhile follow-up for the subset of installers that still require one. The Workbox `globPatterns` precache the built JS/CSS/HTML/SVG app shell only; **no runtime caching is registered**, so every `/api/*` REST call and the `/ws/telemetry` WebSocket always reach the live simulation backend — a stale cached game-state response would be actively harmful for a real-time simulation, unlike a typical content site. `index.html` gained a `theme-color` meta tag matching the manifest's `#0f172a`. Verified via a full `npm run build`: `dist/manifest.webmanifest`, `dist/sw.js`, `dist/workbox-*.js`, and `dist/registerSW.js` are generated, and `index.html`'s injected `<link rel="manifest">` / registration `<script>` were inspected directly in the build output.

---

## 5. Mobile/Narrow-Viewport Responsiveness

Prior to this pass, `Topbar.tsx` and `BottomDock.tsx` — the two chrome bars visible on every screen — had no responsive handling below the `hd` (1400px) breakpoint introduced for KPI-label hiding in an earlier batch; both would overflow badly under roughly 700px. Changes, all additive Tailwind class changes with no layout restructuring:

- **Topbar Architecture & Responsiveness:**
  - **Company Identity (Left):** Retains `shrink-0`, hiding office clock text below `md` and condensing the connection indicator pill to an icon dot below `sm`.
  - **Side Actions & Controls (Right):** Play/pause speed controls, volume slider, interactive tour trigger, language switcher, and settings button are protected with `shrink-0` to avoid clipping.
  - **Central KPI Cluster (`min-w-0 shrink justify-center mx-auto`):** Divided into primary and secondary operational clusters to prevent overlap across standard desktop viewports (e.g. 1600×1000 / 1400px):
    - *Primary Critical Cluster (`shrink-0`):* Houses core operational indicators (`DefconMeter`, `ShieldGauge`, `ErrorBudgetMeter`) within a high-contrast container (`border-slate-700/70 bg-slate-800/50`).
    - *Secondary Metrics (`min-[1720px]` Breakpoint):* Secondary metrics (`CreditCounter`, `TechDebtMeter`, `MoraleMeter`, `ReputationMeter`) are rendered inline on ultra-wide viewports (`min-[1720px]:flex items-center gap-3`).
    - *Secondary Gauge Popover (`min-[1720px]:hidden`):* On viewports narrower than `1720px`, secondary metrics are neatly folded into a compact trigger button (`Gauge` icon with chevron). Clicking opens an absolute dropdown popover (`w-56 bg-slate-950/95 border-slate-800 backdrop-blur-md shadow-xl`) containing full secondary meters.
  - *Historical Note:* An earlier iteration attempted an `overflow-x-auto` horizontal strip with edge-fade gradients, but this produced visual clipping and hidden meters without clear interaction affordance on desktop; the current two-tier primary + popover architecture superseded that design completely.
- **BottomDock** — tab labels hide below `sm`, leaving icon-plus-badge only (the incident-count badge is unaffected); the tab row itself also scrolls horizontally as a safety net. The dock's collapse toggle was deliberately kept **outside** the scrollable region (a sibling, not a child) so a persistent control never scrolls out of view.
- **CABDilemmaModal** and **IncidentDetailModal** — the outer full-screen overlay was missing the `p-4` side-gutter padding present on every other modal in the app, meaning the card touched the screen edges on a narrow viewport; both gained it plus a `max-h-[90vh] overflow-y-auto` scroll fallback for a dilemma or incident with enough content to exceed a short mobile viewport's height. `CABDilemmaModal`'s two-choice grid stacks to one column below `sm` instead of squeezing two narrow columns.

Out of scope for this pass: the isometric office canvas and its click/drag interactions were not touched — a real touch-input redesign for the office view is a materially larger project (Document `01_SYSTEM_ARCHITECTURE_AND_DATA_FLOW.md`'s canvas is mouse-hover-driven throughout) than the chrome-bar fixes here, and is not claimed as done.

---

## 6. Quality Gate Status

*Implementação e configurações presentes no código; validação de execução de build e testes fora do escopo desta atualização documental.*
