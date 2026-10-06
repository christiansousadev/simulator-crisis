# Visual Polish and HUD Consistency — Implementation Specification

**Document ID:** IZ-IMPL-09
**Classification:** Implementation Contract
**Status:** Implementado (atualizado para o código atual; sem medição de FPS nem teste auditivo)
**Last Updated:** Outubro 2026
**Source of Truth:** `frontend/src/components/common/*`, `frontend/src/components/modals/*`, `frontend/src/components/layout/*`, `frontend/src/components/dock/*`, `frontend/src/components/office/*`, `frontend/src/index.css`, `frontend/tailwind.config.js`

> **Scope of this revision.** This spec started as a visual audit of the first polish passes. The UX overhaul replaced several of the mechanisms it described (modal exit handling, the sky filter, the red-alert grade, the toast stack, the dock badges). Each section below states what the code does **now**; replaced designs are kept only as short **Superseded** notes. The shared interaction and motion rules (tokens, reduced-motion model, primitives, state and performance rules, tutorial, audio, i18n loading, test contracts) live in `10_UX_INTERACTION_AND_MOTION_LAYER_SPEC.md` (IZ-IMPL-10); the lighting and walking systems in `05_DAY_NIGHT_CYCLE_AND_DYNAMIC_OFFICE_VISUALS_SPEC.md` (IZ-IMPL-05).

---

## 1. System Objective

Keep one coherent look and one set of feedback rules across the HUD, the dialogs and the office diorama: a dark "tactical war room" register, named layers and motion tokens instead of ad hoc values, and transient feedback that is readable, keyboard-reachable and switchable off. This document records the visual decisions; IZ-IMPL-10 records the mechanisms.

---

## 2. HUD/Modal Palette

The dark register (`bg-slate-900`, `border-slate-700`, `slate-100/300` text tiers, heading font `font-heading`) is the rule for every gameplay dialog. Dialogs are built on the shared `Modal` shell (`components/common/Modal.tsx`), whose panel is `bg-slate-900` with a `border-slate-700` frame and a `bg-slate-950/75 backdrop-blur-sm` backdrop.

- `PostMortemModal.tsx` and `IncidentDetailModal.tsx` use that register (they were the original light-mode outliers).
- `LogTriageTerminal.tsx` keeps a deliberate third register: black, monospace, green-on-black terminal.
- `VictoryScreen.tsx` and `LiquidationScreen.tsx` still exist as the old "official letter" light templates but are **not mounted anywhere** (a search of `frontend/src` finds no importer); the match end is the staged `PostMatchDebriefModal.tsx`. They are dead code kept only for reference.
- The topbar, dock, toasts, minimap and camera panel all use the same dark glass vocabulary (`slate-950/80–90` + `backdrop-blur`, one accent colour per tone).
- Two accessibility remaps sit on top of the palette in `index.css`: `[data-high-contrast]` (stronger borders and an amber focus ring) and `[data-colorblind-safe]` (emerald → blue, rose → orange on the `bg-/text-/border-` utilities); both attributes are stamped by `App.tsx`.

**Type scale:** `tailwind.config.js` defines `text-micro` (10 px) and `text-caption` (11 px); the HUD does not use anything smaller than `micro`.

---

## 3. Meters and Counters

- **Shared chrome.** Every topbar meter renders through `MeterShell.tsx` (icon + label row, value row, KPI chips, one-shot band-crossing flash). KPI thresholds ("bands") and tone classes come from one module, `utils/kpiBands.ts`, so meters, status dots and the store's band-crossing logic cannot disagree.
- **Fills.** Reputation, Error Budget and the other bar meters animate width with `transition-[width] duration-slow ease-out-expo` (tokens, not one-off values); `ShieldGauge` keeps its discrete 16-segment design.
- **Numbers.** `CreditCounter.tsx` uses `useAnimatedNumber(budget)` (`hooks/useAnimatedNumber.ts`): an ease-out-cubic tween whose default duration is about 95% of one tick of game time (clamped 120–1000 ms, from `tick_rate_seconds`), so the number is always gliding toward the next value at 1x and still finishes at 5x; reduced motion shows the value immediately. The text node stays a single `$212,450` string.
- **Cash in the HUD.** Cash is part of the **primary** status cluster (DEFCON, SLA, Error Budget, Cash share one elevated container in `Topbar.tsx`, `data-tour="topbar-kpis"`). Next to it a calm "−650/tick" trend (`budgetTrend` in the store) replaces a per-tick chip; real spends and audited cash movements fly off the counter as KPI chips (`KpiChips.tsx`, `utils/kpiEvents.ts`). Red is reserved for the low-runway alarm (`LOW_RUNWAY_THRESHOLD = 20000`).
- **Secondary indicators.** Tech Debt, Morale and Reputation are inline at ≥ 1720 px and otherwise live in an "Indicators" `HudPopover` whose trigger shows three status dots, so a red value is visible without opening it. Only one copy is ever mounted.

> **Superseded:** the earlier note that cash was a "secondary metric" with responsive folding, and the plain `transition-all duration-500` fills.

---

## 4. Modal Enter **and Exit** Transitions

Dialogs now animate in **and out**. The earlier text deliberately skipped exits because object-driven dialogs lose their content the instant the store value becomes `null`; that reasoning is superseded by `usePresence` (`hooks/usePresence.ts`), which caches the last non-null value inside the hook (not in the store) and keeps the dialog mounted for the exit duration (default 160 ms).

- `Modal` uses `usePresenceFlag(open, 160)` and swaps `animate-backdrop-in` / `animate-modal-in` for `animate-backdrop-out` / `animate-modal-out` while closing; the closing backdrop gets `pointer-events-none`.
- Object-driven dialogs (`CABDilemmaModal`, `PostMortemModal`, `IncidentDetailModal`, `IncidentReplayModal`, `LogTriageTerminal`, `ScenarioBriefingModal`) call `usePresence(storeValue)` and render from the held `data` while `closing`.
- Under reduced motion `usePresence` unmounts immediately.
- Keyframes live in `tailwind.config.js`: `modal-in` (0.96 → 1, 180 ms), `modal-out` (1 → 0.97, 160 ms), `backdrop-in/out`; `pop-in` stays for badges and toasts, where a bounce fits.

---

## 5. Sky Follows the Day/Night Cycle

The CSS backdrop behind the SVG scene is `.office-sky` (`index.css`): a daytime gradient on `::before`, plus two overlay layers (`.office-sky-night`, `.office-sky-dusk`, rendered by `SkyLayers.tsx`) whose **opacity** follows the smoothed `--night` / `--twilight` variables written by `LightingDriver`. The sky therefore eases continuously with the clock; there is no per-phase `filter` and no `data-day-phase` attribute any more. Full model: IZ-IMPL-05 §2.

> **Superseded:** the `[data-day-phase]` `filter: brightness()/saturate()/hue-rotate()` retint on `.office-sky::before` with a 4 s transition.

---

## 6. Empty and Loading States

- `EmptyState.tsx` is the one empty-state shape for the dock panels (icon, short title, optional hint, optional tone for a "good" empty such as all-clear).
- `Spinner.tsx` (`Loader2` + optional label) is the loading indicator; `LazyModalHost` shows it inside a small skeleton dialog while a lazy dialog's chunk arrives, and the catalogs (`hooks/useCatalogs.ts`) are cached so a dock tab does not flash empty.

---

## 7. Iconography

One icon set (`lucide-react`). The rack "mitigation in progress" overlay in `ServerRack.tsx` uses lucide's `Wrench` rather than an emoji. The Feature Freeze banner text still carries a literal "⚠" glyph in `IsometricOffice.tsx` (a known exception).

---

## 8. Heading Font

`Rajdhani` (`font-heading`) is applied to the topbar identity, the title screen, dock tab labels, every `ModalHeader` title and the incident-detail section headings. `VictoryScreen` / `LiquidationScreen` were excluded (unmounted, §2).

---

## 9. Global Button Press Feedback

`index.css` carries one base-layer rule:

```css
button:not(:disabled):not([data-stretched]):active { transform: scale(0.96); }
```

It has no transition of its own: `:active` only holds while the pointer is down, so the squash reads as a crisp click.

**The `data-stretched` exemption (a regression lesson).** A transform on a button makes that button the containing block of its own `::after`. The incident card's "stretched button" pattern (`after:absolute after:inset-0`, in `IncidentsPanel.tsx` and `IncidentAlertStack.tsx`) relies on the pseudo-element covering the whole card, so while the button was pressed it shrank to the button's own box and the card lost its click area. Buttons that use the pattern therefore carry `data-stretched="true"` and are excluded from the global squash; `e2e/incident-card-click.spec.ts` guards the behaviour.

A few components also set their own `active:scale-95` (camera panel buttons, `IncidentActionButton`).

---

## 10. Tactical War Room (as implemented)

1. **Bottom dock.** `BottomDock.tsx` hosts seven tabs (Incidents, Directives, Compliance on the bar; Upgrades, Roster, Achievements, Metrics behind a "More" `HudPopover` portalled to `<body>` so the strip's `overflow` cannot clip it). Hotkeys I, M, C, U, R, A, G and D (collapse) are shown as `kbd` chips and exposed through `aria-keyshortcuts`. A 1 px cyan indicator slides under the active tab (transform only, no animation on first placement). The panel animates open/closed through a `grid-template-rows` 0fr↔1fr transition and stays mounted until the collapse ends (`usePresenceFlag`, 340 ms); the active panel enters with `animate-panel-in`. The dock publishes its own height as `--dock-height` so the toast stack always sits right above it.
   - **Badges** (`hooks/useDockBadges.ts`): open incidents, stressed engineers, affordable upgrades, unseen achievements. A badge **bumps once** when its count changes (`useChangeSeq` + `animate-badge-bump`); it no longer pulses forever. The "More" button sums the hidden tabs' badges.
   - The pre-existing note that cards use `slate-900/80` with per-severity glow still holds for `IncidentsPanel`.
2. **Structural 3D foundation.** `FoundationBlock` and `MasterGroundShadow` in `IsometricOffice.tsx` (concrete pedestal below the floor plus a soft contact shadow). Part of `StaticFloor`, which is `memo`ed.
3. **Toasts.** `FloatingCombatText.tsx` is now one **toast region**: a polite live region (`role="status"`, `aria-live="polite"`) above the dock, newest last, errors never merged, hover pauses every timer, click dismisses. Dark glass chips per tone (`danger`, `warning`, `success`, `info`, `gold`) with an icon; on-screen time depends on tone (3.5 s danger, 2.8 s warning/gold, 2.2 s success, 2.0 s info) plus extra reading time for long text; entry `animate-slide-up-in`, exit `animate-item-out`. Test hook: `data-testid="floating-text"` and `data-tone`. (`combat-text-pop` remains in the Tailwind config but this component no longer uses it.)
4. **Skyline.** Depth bands, windows lit by night intensity, haze and aviation beacons: IZ-IMPL-05 §2.4.
5. **Camera panel.** One cockpit container at the top-left of the canvas holds "Focus rack" (when a rack is selected), "Center on Crisis" (when a crisis exists or DEFCON ≤ 3, flies to the worst failing rack) and the build-mode toggle. Camera behaviour: IZ-IMPL-10 §8.
6. **Red alert.** Superseded by the staged DEFCON-tier lighting (IZ-IMPL-05 §2.5). The earlier `RED_ALERT_GRADE_MATRIX` / `RedAlertOverlay` no longer exist.
7. **`.cooldown-ring`.** The conic-gradient sweep is `rgba(2,6,23,0.78)` over a registered `@property --progress` (`<number>`), with `transition: --progress 1s linear` so one tick of progress eases instead of stepping. Consumed by `CooldownButton.tsx` and the runbook cards.
8. **Status and severity tokens.** `StatusPill.tsx` and `utils/severity.ts` give the canonical colours (P1 rose, P2 amber, P3 sky, P4 slate). The incident detail dialog is organised as three blocks: *what is happening*, *what is the impact*, *what can I do now* (runbooks, with the log terminal opened as its own dialog). Rack and engineer visual states: IZ-IMPL-05 and IZ-IMPL-10 §8.
9. **Audio.** Procedural Web Audio only (no audio files): IZ-IMPL-10 §10. **Never verified by ear in this project.**
10. **Accessibility and reduced motion.** `index.css` switches animation **off** (`animation: none`, not a 0.01 ms clamp) when the OS asks for reduced motion or when the in-game Motion setting is `on`; `App.tsx` also skips the screen-shake classes. See IZ-IMPL-10 §4.
11. **Match end.** `PostMatchDebriefModal.tsx` with a staged reveal planned by `utils/debriefTimeline.ts` (never longer than 3 s; everything at once under reduced motion).

---

## 11. Verification & Quality Gates

*Implementação presente no código. Verificado em outubro 2026: `vitest run` com 52 arquivos / 354 testes passando. Não verificado nesta revisão: execução do Playwright, build de produção, FPS, áudio por ouvido.*

---

## 12. Phase 3 — Tactical Depth, Analytics & Micro-Visuals (as implemented)

1. **Metrics tab** (`MetricsPanel.tsx`, `LiveSparkline.tsx`, hotkey G). Rolling samples (`metricsHistory`, derived client-side from each tick's service snapshot in `setTelemetry`) for SLA, mean latency, error rate and a throughput proxy. The throughput figure is a proxy (healthy services × a nominal RPS), not measured traffic.
2. **Tech tree** (`UpgradesTreePanel.tsx`). Three branch columns at `lg:` widths (one column below), dependency connectors, purchased / available / locked states. Catalog data in `dock/upgradeCatalog.ts`.
3. **Tactical minimap** (`TacticalMiniMap.tsx`). Zone footprints, blinking markers on affected racks, click to pan (`panToWorld`), a "Center on Crisis" action, and a viewport frame that follows the camera imperatively through `cameraBus.ts` (no React render per frame).
4. **Incident alert stack** (`IncidentAlertStack.tsx`). Severity-coloured cards with the shared `IncidentActionButton` (same acknowledge flow as the dock) and rack focus; uses a stretched button (§9).
5. **Dependency lines** (`ServiceDependencyLines.tsx`) with status-dependent colours.
6. **Cascade ripple** (`CascadeRipple.tsx`). Three expanding rings as plain CSS keyframes started on mount. **Lesson:** the first version used SMIL `<animate>`, whose clock starts at page load, so a ripple added minutes into a session had already "finished" and never showed.
7. **Rack radial menu** (`RackRadialMenu.tsx`). Focus, log triage, incident detail, close; the two incident actions are disabled with the reason exposed when the service has no open incident; buttons pop in staggered.
8. **Predictive anomaly visuals** (`ServerRack.tsx`). With `predictive_anomaly_detection` purchased, a service with creeping latency/error rate shows an amber aura and a warning badge before it fails.
9. **Feature freeze banner** (`IsometricOffice.tsx`). Office-spanning `role="status"` banner, entered and exited through `usePresenceFlag`.
10. **Replay export** (`IncidentReplayModal.tsx`). "Share / Export JSON" copies the replay ledger to the clipboard (`navigator.clipboard`, so it needs a secure context and permission).
11. **Log terminal** (`LogTriageTerminal.tsx`). Typewriter boot line (`useTypewriter`), arrow/Home/End list navigation, a confirmation stamp (`animate-stamp-in`) overlaid so nothing moves. Reduced motion shows text immediately. (`playTypeTick` exists in `sound.ts` and is unit-tested but is not called by the terminal.)
12. **Bundle Optimization & Lazy Loading (`App.tsx`, `i18n/loadLanguage.ts`, `vite.config.ts`):** After the UX overhaul the entry chunk had grown to 662 kB (197 kB gzip); it is now ~350 kB (107 kB gzip), plus a 142 kB `vendor-react` chunk (≈492 kB of initial JS in total, under the 500 kB budget), by two measures. First, **per-language code splitting**: English stays bundled (fallback and tests) while the pt-BR and es dictionaries (core `Translations`, `hud`, `flow`, `gameplayModals`, `officeLife` and the dynamic-content tables) live in `i18n/locales/<lang>/` and are loaded with a dynamic `import()` into their own `locale-<lang>` chunk (~50 kB each) only for the active language; `main.tsx` awaits `loadLanguage()` for the stored language before the first render (an inline splash in `index.html` covers the wait), and `setLanguage()` loads the dictionary before switching. Each locale module uses `satisfies Translations`, so a missing key still fails `tsc`. Second, every dialog not needed for the first paint (Settings, Credits, Pause, Scenario Builder, Briefing, Post-Mortem, Replay, Hall of Fame, Scenario Select, Debrief and the live Incident Detail / Log Triage dialogs) is a `React.lazy` chunk behind `LazyModalHost` (skeleton, chunk error boundary, idle preload; the incident dialogs are fetched the moment the title is dismissed), while the timed CAB dilemma stays eager.

---

## 13. Honest Status

| Area | Status |
|---|---|
| Unit tests (vitest) | 52 files / 354 tests passing (re-run for this revision) |
| E2E (Playwright) | 8 specs defined (6 files), all passing when re-run for this revision |
| Frame rate / paint cost | **Unmeasured**; performance claims are structural (memoized layers, no SVG filters, imperative camera and lighting) |
| Audio | **Unheard**; implemented and unit-tested at the graph/helper level only |
| Dead code | `VictoryScreen.tsx`, `LiquidationScreen.tsx` unmounted |
| Touch | Camera pan/zoom is mouse and keyboard only; **touch pan is unsupported** |
