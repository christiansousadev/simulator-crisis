# UX Interaction and Motion Layer — Implementation Specification

**Document ID:** IZ-IMPL-10
**Classification:** Technical Specification / Frontend Interaction, Motion and Feedback Layer
**Status:** Implementado (código verificado; áudio não ouvido, FPS não medido, Playwright não re-executado nesta revisão)
**Last Updated:** Outubro 2026
**Source of Truth:** `frontend/tailwind.config.js`, `frontend/src/index.css`, `frontend/src/hooks/*`, `frontend/src/utils/{modalStack,simPause,kpiEvents,kpiBands,runbooks,incidentLifecycle,audioEngine,musicEngine,sound,audioMode,debriefTimeline}.ts`, `frontend/src/components/{common,flow,layout,dock,tutorial,office,modals}/*`, `frontend/src/store/{useGameStore,useFlowStore}.ts`, `frontend/src/i18n/*`

This is the reference for the interaction and motion layer that the UX overhaul added on top of the game: how things move, how focus and keys are routed, what is allowed to re-render, how the tutorial and the audio are wired, and what is known to be unfinished. Rendering details of the office itself are in `05_DAY_NIGHT_CYCLE_AND_DYNAMIC_OFFICE_VISUALS_SPEC.md` (IZ-IMPL-05); visual decisions in `09_VISUAL_POLISH_AND_HUD_CONSISTENCY_SPEC.md` (IZ-IMPL-09). Everything here is client-side except the single tutorial endpoint (§11).

---

## 1. Principles

1. **Motion explains state, it never carries it.** Anything that is only announced by an animation (an error toast, a status change) must also exist as static text, an ARIA live region or a resting style. This is why reduced motion turns animations *off* rather than shortening them (§4).
2. **Every overlay picks a named layer and a motion token.** No ad hoc `z-[NN]` and no one-off durations for UI chrome (§3).
3. **One implementation per interaction.** One dialog shell, one presence hook, one Escape stack, one acknowledge flow, one runbook-pricing function. Duplicated copies drift.
4. **Pointer-frequency work never goes through React.** Camera, lighting, tooltips, spotlight and minimap are driven imperatively (§6).
5. **The HUD mirrors server rules; the server stays the authority.** The client shows the real price and the real block reason, but never decides a charge (§9.3).
6. **Degrade, don't break.** Audio, storage, `matchMedia`, `ResizeObserver`, `IntersectionObserver` and lazy chunks are all optional; failure paths are silent or fall back.

---

## 2. File Map

| Area | Files |
|---|---|
| Motion tokens, z layers, keyframes | `tailwind.config.js`, `src/index.css` |
| Reduced motion | `hooks/useReducedMotion.ts`, `index.css`, `App.tsx` (mirror to `<html data-reduce-motion>`), `store/useGameStore.ts` (`reducedMotionPref`) |
| Dialog shell and stack | `components/common/Modal.tsx`, `hooks/usePresence.ts`, `utils/modalStack.ts`, `hooks/useDismissable.ts`, `components/common/HudPopover.tsx` |
| Lists and numbers | `components/common/TransitionList.tsx`, `hooks/useAnimatedNumber.ts`, `hooks/useChangeSeq.ts` |
| Store performance | `store/useGameStore.ts` (`shareTelemetry`, `shareList`), `office/officeHover.ts`, `office/cameraBus.ts`, `office/lightingBus.ts` |
| Flow | `components/flow/{LazyModalHost,LazyDialogs,lazyModals,menuNav,flow.css}`, `components/layout/ScreenTransition.tsx`, `store/useFlowStore.ts` |
| Simulation holds | `utils/simPause.ts`, `hooks/useSimulationHolds.ts` |
| Input | `hooks/{shortcutRouting,useGameShortcuts}.ts`, `office/{cameraController,cameraMath}.ts` |
| HUD | `layout/{Topbar,BottomDock}.tsx`, `common/{MeterShell,KpiChips,CreditCounter,FloatingCombatText,IncidentActionButton,IncidentLifecycleTrack,TacticalMiniMap}.tsx`, `utils/{kpiBands,kpiEvents,localSpendClaims,runbooks,incidentLifecycle}.ts`, `hooks/{useMitigations,useAsyncAction,useAcknowledgeIncident,useDockBadges,useCatalogs}.ts` |
| Office | `office/{lighting,LightingDriver,AmbientLight,SkyLayers,cameraController,rosterStage,rosterPlan,waypointGraph,serviceTransitions,RackRadialMenu,BuildPlacementGhost}.ts*`, `hooks/useServiceTransitions.ts`, `office/officeLife.css` |
| Tutorial | `components/tutorial/*`, `hooks/useTutorialEngine.ts`, `backend/app/api/v1/tutorial.py` |
| Gameplay modals, menus | `components/modals/*`, `utils/{markdown.tsx,debriefTimeline.ts,cabDeadline.ts}` |
| Audio | `utils/{audioEngine,musicEngine,sound,audioMode}.ts`, `hooks/{useGameAudio,useBackgroundMusic,useDialogSounds}.ts` |
| i18n | `i18n/{translations,loadLanguage,dynamicContent,hud,flowStrings,gameplayModals,officeLife}.ts`, `i18n/locales/{pt-BR,es}/*` |
| Tests | `src/**/*.test.ts(x)` (52 files), `e2e/*.spec.ts` (6 files), `src/test/fakeAudio.ts` |

---

## 3. Tokens

### 3.1 Stacking layers (`theme.extend.zIndex`)

| Utility | z | Used for |
|---|---|---|
| `z-hud` | 30 | HUD pieces that float over others (KPI chips) |
| `z-title` | 40 | The title screen |
| `z-dialog` | 50 | Ordinary dialogs (incident detail, post-mortem, pause menu by default), `HudPopover` |
| `z-system` | 80 | System dialogs (settings, credits, builder, replay, scenario select, hall of fame) and screen transitions |
| `z-critical` | 88 | `Modal layer="critical"` |
| `z-tutorial` | 90 | The tutorial overlay (above every dialog) |
| `z-toast` | 96 | The toast region and the achievement toast |

`Modal` maps `layer` (`dialog` / `system` / `critical` / `tutorial`) to these utilities. Some older literals remain and are not yet tokenized: `.defcon-vignette` uses `z-index: 40` in `index.css`, and the camera panel and feature-freeze banner in `IsometricOffice.tsx` use `z-30` / `z-40` utilities.

### 3.2 Durations, easings, type

- Durations: `duration-fast` 120 ms, `duration-base` 180 ms, `duration-slow` 320 ms, `duration-glide` 600 ms.
- Easings: `ease-out-expo` = `cubic-bezier(0.22, 1, 0.36, 1)`, `ease-in-out-soft` = `cubic-bezier(0.65, 0, 0.35, 1)`.
- Type: `text-micro` 10 px, `text-caption` 11 px; `font-heading` = Rajdhani. A custom `hd` breakpoint at 1400 px gates KPI labels.

### 3.3 Keyframe families (`animation:` in `tailwind.config.js`)

| Family | Names |
|---|---|
| Dialog | `modal-in/out`, `backdrop-in/out`, `drawer-slide-in`, `panel-in`, `wipe-in/out` |
| List and feedback | `item-in/out/highlight`, `slide-up-in`, `slide-down-in`, `badge-bump`, `ready-flash`, `kpi-band-flash`, `kpi-chip-fly`, `stamp-in`, `shake-once`, `pop-in`, `ring-pulse` |
| Whole-screen | `screen-shake-light/heavy`, `impact-flash-fx`, `confetti-fall`, `screen-glow-pulse`, `defcon-glitch` |
| Office life (infinite) | `fan-spin`, `smoke-rise`, `steam-rise`, `spark-flicker`, `glow-pulse`, `beacon-flash/sweep`, `worker-bob`, `type-jitter`, `walk-cycle-left/right`, `eye-blink`, `sprint-bounce`, `sweat-drop`, `ball-volley`, `dash-flow(-stutter)`, `wrench-turn`, `bounce-panic`, `blink`, `ticker-scroll` |

Office-specific keyframes live in `office/officeLife.css` (`ol-*`: sprite-in, rack-shake, fx-fade, spawn-flash, scan, chip, LEDs, fans, ripple, radial menu, drop-in, ghost-pulse, door-slide, clock hand, walk-slide) and flow keyframes in `flow/flow.css` (`flow-title-*`, `flow-hud-top/bottom`, `flow-wipe-line`, `flow-credits-roll`, progress). `combat-text-pop` is still defined but no longer used by the toast stack.

---

## 4. Reduced-Motion Model

Two inputs, one effective answer:

- **OS preference** `prefers-reduced-motion: reduce`.
- **In-game Motion setting** `reducedMotionPref` = `system` | `on` | `off` (Settings dialog, persisted under `REDUCED_MOTION_STORAGE_KEY`). `on` wins over the OS, `off` wins over the OS, `system` follows it.

`App.tsx` mirrors the setting on `<html>`: `data-reduce-motion="on" | "off"`, attribute removed for `system`. `index.css`:

- `@media (prefers-reduced-motion: reduce) :root:not([data-reduce-motion="off"]) *` and `:root[data-reduce-motion="on"] *` both set `animation: none !important`, `transition-duration: 0.01ms !important`, `scroll-behavior: auto !important`.
- **Why `animation: none` and not a 0.01 ms clamp.** A 0.01 ms animation with `fill-mode: forwards` jumps to its **last** keyframe; for every fade-out toast that is `opacity: 0`, so messages (including error reasons) vanished. With `none`, an element shows its resting style, and components that mount and unmount on timers keep working.
- `.motion-only` marks decorative layers that would freeze as a solid block with animation off (the title wipe line, etc.); they get `display: none` under reduced motion.

JS-driven motion reads the same answer through `useReducedMotion()` (hook) or `isReducedMotionNow()` (event handlers, rAF loops). Behaviour when reduced:

| Consumer | Reduced behaviour |
|---|---|
| `usePresence` | Unmounts immediately (no exit) |
| `TransitionList` | No enter/exit/FLIP; rows swap instantly |
| `useAnimatedNumber` | Shows the target value at once |
| Camera (`cameraController`) | Snaps (`flyTo`, `zoomBy`, no inertia, no spring) |
| `LightingDriver` | Snaps to the targets, no easing or flicker |
| `RosterDirector` / `rosterStage` | Engineers are placed at their destination (`instant`) |
| `WanderingEmployee` | Stays at its waypoint |
| `App.tsx` | Screen-shake classes are not applied |
| `ScreenTransition` | No wipe line |
| `useTypewriter`, `LogTriageTerminal`, debrief | Text and stages shown immediately |
| Toast | Dismissed without the exit animation |
| `CreditsModal` | Plain scrollable list instead of a roll |

---

## 5. Shared Primitives

### 5.1 `Modal` (`components/common/Modal.tsx`)

Portal to `<body>`; `role="dialog"` (or `alertdialog`), `aria-modal`, `aria-label` or `aria-labelledby`; sizes `sm…full`. It provides:

- **Presence:** `usePresenceFlag(open, 160)`; enter `animate-backdrop-in`/`animate-modal-in`, exit `animate-backdrop-out`/`animate-modal-out`, closing backdrop `pointer-events-none`.
- **Focus trap and restore:** on open remembers `document.activeElement`, focuses `initialFocusRef` or the first focusable control (or the panel), traps Tab/Shift+Tab inside, and restores focus on close.
- **Escape stack:** registers in `utils/modalStack.ts` while open. An omitted `onClose` means *a decision that must be answered* (e.g. the timed CAB card): Escape is consumed and does nothing.
- **Backdrop click** closes only when `closeOnBackdrop` and `onClose` are set.
- Helpers `ModalHeader` (fixed header with a close button), `ModalBody` (scrolls), `ModalFooter`.

### 5.2 `usePresence` / `usePresenceFlag`

Keeps an element mounted for `exitMs` after its value goes `null`, returning `{ data, mounted, closing }`. The last non-null value is cached **inside the hook**, which is what lets object-driven dialogs (their store value becomes `null` the instant they close) animate out. Used by `Modal`, the title screen (`TITLE_EXIT_MS = 420`), the dock collapse, the feature-freeze banner, the deploy veil and the beacon rig.

### 5.3 `modalStack`

`registerModal(id, onClose | null)`, `hasOpenModal()`, `topModalId()`, `closeTopModal()`, `useModalStackSize()`. Registered by `Modal`, by `useDismissable` (popovers) and by the tutorial engine. The camera controller and the global shortcuts consult it, so a letter typed inside a dialog cannot switch tabs or change speed behind it.

### 5.4 `HudPopover` / `useDismissable`

A popover portalled to `<body>` with `fixed` coordinates measured from its trigger (`top-start` or `bottom-end`), clamped to the viewport, re-placed on resize. Closes on outside press and on Escape (consumed, so it does not also open the pause menu). Used by the dock "More" menu and the topbar "Indicators" popover.

### 5.5 `TransitionList`

Rows enter (`animate-item-in`), leave (kept mounted for `exitMs`, `animate-item-out`, `aria-hidden`, `pointer-events-none`) and re-order with a FLIP transform (260 ms, `ease-out-expo`). New rows after the first render get a one-shot highlight sweep (`animate-item-highlight`) so additions are findable. Only transform and opacity are animated.

### 5.6 `useAnimatedNumber` and `useChangeSeq`

`useAnimatedNumber(target, durationMs?)`: ease-out-cubic rAF tween; default duration is about one tick of game time. `useChangeSeq(value)` returns a counter that bumps whenever `value` changes (never on first render); used as a React `key` to restart one-shot CSS animations (band flash, badge bump, DEFCON slide).

### 5.7 Small shared components

`EmptyState` (icon, title, hint), `Spinner`, `StatusPill`, `SeverityBadge`, `CooldownButton` (+ `.cooldown-ring`, §9.2), `ConfettiBurst`, `ImpactFlash`, `AchievementToast`, `LanguageSwitcher`.

---

## 6. State and Performance Rules

1. **Structural sharing on every telemetry frame.** `setTelemetry` runs `shareTelemetry(prev, next)`: for the list fields (`services`, `active_incidents`, `recent_audits`, `engineers`, `infrastructure_nodes`, `purchased_upgrades`, `achievements_unlocked`, `unlocked_cosmetics`) it reuses the previous item object when a JSON comparison says nothing changed (matched by `id` when present), and reuses `mitigation_cooldowns` and `active_scenario` the same way. A tick that changes one service re-renders one consumer. Test: `src/foundation.test.tsx` ("telemetry structural sharing").
2. **Narrow selectors.** Components select primitives or small derived values (`selectDefconLevel`, `useRedAlert`, a `"id:status|…"` signature string for per-service lists, a boolean `scenarioBriefing !== null`). Never subscribe to the whole `telemetry` object in a component that renders a large tree (`App.tsx` does not).
3. **Memoize static layers.** The office is split into `memo`ed layers with no props (`StaticFloor`, `StaticDecor`, `StaticProps`, `StaticRooms`) and layers that own their selectors (`RackLayer`, `NetworkLayer`), so the camera shell never re-renders on a tick. Topbar meters are separate `memo` components that each read one value.
4. **External stores for high-frequency data.** `officeHover.ts` (hovered id via `useSyncExternalStore`; pointer position goes to a separate listener list that moves the tooltip with a transform), `cameraBus.ts` (minimap frame), `lightingBus.ts` (CSS variables), `rosterStage.ts` (Zustand store written from JS timers), `useAsyncAction` (pending registry).
5. **Imperative frame loops.** Camera, lighting and the spotlight write straight to `style`/CSS variables inside `requestAnimationFrame` and **sleep** once settled. Their input is the store (`subscribe`), not React effects.
6. **Timers independent of the simulation.** The roster walks and toasts dismiss on wall-clock timers, so they keep working while the simulation is paused.
7. **Pause what nobody sees.** `.office-paused` pauses every looping CSS animation under the office when the tab is hidden or the canvas is off screen; lighting snaps on `visibilitychange`.
8. **No SVG filters, no SMIL.** See §16.
9. **Animate compositor properties.** Transform and opacity only for repeated motion (`office-drift` is translate-only on its own wrapper, apart from the camera transform). The dock collapse is the exception (§15).

---

## 7. Flow: Holds, Lazy Dialogs and Screen Transitions

### 7.1 Simulation holds

`utils/simPause.ts` is a **reference-counted pause**. `useSimulationHolds` (mounted in `App.tsx`) maps screens to hold reasons: `title`, `pause-menu`, `briefing`. The first hold captures the engine's run state (`api.getState()`; falls back to "not running" if the backend is unreachable) and pauses; the last release restores it (start, and re-apply the speed if it changed). So a game the player paused by hand stays paused after closing a menu. `sync(reasons)` adds before it removes, so swapping one holder for another never un-pauses; calls are serialised on a promise chain; `rebase` and `enforce` handle a reset that restarts the tick loop. It waits for the WebSocket to connect first. Test: `utils/simPause.test.ts`.

### 7.2 Lazy dialogs

`components/flow/lazyModals.ts` exports `React.lazy` wrappers and their loaders for 12 dialogs (Hall of Fame, Scenario Select, Debrief, Settings, Credits, Pause menu, Scenario Builder, Briefing, Post-mortem, Replay, Incident Detail, Log Triage). `LazyModalHost` mounts a dialog only after its first open, shows a small skeleton `Modal` with a `Spinner` while the chunk arrives, and wraps it in an error boundary whose failure calls `onCancel` (closing the store flag, which matters for dialogs that hold the simulation). `LazyDialogs` subscribes to **boolean** open flags only. `preloadFlowChunks()` warms the chunks one after another when the browser is idle (title screen); `preloadGameplayChunks()` fetches the live-incident dialogs as soon as the title is dismissed. The timed CAB dilemma stays eager. Test: `components/flow/LazyDialogs.test.tsx`.

### 7.3 Screens

- `ScreenTransition.tsx` renders three `pointer-events-none` pieces: a wipe line when the title gives way to the office, a "deploying scenario" veil with a progress bar (presence-driven), and the "shift started" banner (clock read once, so it never ticks under the player).
- `App.tsx` starts the **office intro** when the title leaves: `officeIntro` adds the class `office-intro`, and the header and footer slide in (`flow-hud-top/bottom`) for `OFFICE_INTRO_MS = 1300`. Transient flow state lives in `useFlowStore` (never persisted, never sent anywhere).
- The title container gets `flow-title-drift` / `flow-title-drift-out` (a slow camera drift on a wrapper, so it never touches the office camera).

---

## 8. Input

### 8.1 Global shortcuts (`hooks/shortcutRouting.ts`, `useGameShortcuts.ts`)

Routing is a **pure function** over a snapshot (`routeShortcut`), so the rules are unit-tested (`hooks/shortcutRouting.test.ts`). Rules in priority order:

1. Typing in an input/textarea/select/contenteditable, or any Ctrl/Alt/Meta modifier → nothing (browser and OS shortcuts are never hijacked).
2. A dialog on the modal stack → only **Escape** does anything (closes the top-most).
3. A legacy store-driven dialog open (`triage`, `replay`, `postMortem`, `incident`, `onboarding`, in that close order) → only Escape closes it.
4. Title screen visible → nothing (the title owns the keyboard).
5. Otherwise:

| Key | Action |
|---|---|
| Escape | Toggle the pause menu |
| Space | Pause/resume, **unless** a control reached with the keyboard has `:focus-visible` (it owns Space); a button merely clicked with the mouse does not |
| 1 / 2 / 5 | Simulation speed |
| `[` / `]` (also `{` `}`) | Cycle through incidents (selects the service) |
| B | Toggle build mode |
| D | Collapse/expand the dock |
| I M C U R A G | Dock tabs: Incidents, Directives (M), Compliance, Upgrades, Roster, Achievements, Metrics (G) |

**Tab is never hijacked**; that is why incident cycling lives on the bracket keys.

### 8.2 Camera input (`office/cameraController.ts`)

Mouse wheel zooms toward the cursor, left/right-drag pans past a 4 px threshold (a finished drag swallows the click that follows), arrow keys pan, `+`/`-` zoom, `Home` resets. Keys are ignored while a dialog is open or a typing/arrow-using widget (`slider`, `listbox`, `menu`, `radiogroup`, `dialog`) has focus. Elements with `data-camera-ignore` do not start drags or zooms. **There is no touch handling** (§17).

### 8.3 Menus and focus

`flow/menuNav.ts` gives Arrow/Home/End navigation over `[data-menu-item]` buttons (title screen, pause menu). The base layer in `index.css` gives every `button`, `input`, `select` and `a` a `:focus-visible` ring (`#38bdf8`, amber in high-contrast). The log terminal list and the dock expose `aria-keyshortcuts`.

---

## 9. HUD System

### 9.1 KPI chips and meters

- `MeterShell` wraps every topbar meter: icon, label (hidden below `hd`), value row, `KpiChips`, and a one-shot band-crossing flash (`useChangeSeq(band)` + `animate-kpi-band-flash`). Bands and tones: `utils/kpiBands.ts`.
- The store's `kpiEvents` slice holds short-lived labelled chips ("−$1,800 · Rollback"). `mergeKpiEvent` folds quick changes to the same KPI inside a 700 ms window into one chip (so 5x speed stays readable), cancels opposite changes, caps the list at 12, and lets a chip live 1400 ms (matching `animate-kpi-chip-fly`). `KpiChips` is `aria-hidden`; the same information is announced through the toast region. A single module-level "reaper" sweeps stale chips even when their meter is not mounted (closed popover). Test: `utils/kpiEvents.test.ts`, `store/useGameStore.kpi.test.ts`.
- **No double chips for the player's own spend.** When a HUD action spends cash the chip is pushed at once and `claimLocalSpend(auditType)` records a claim (8 s TTL); the matching audit entry that arrives a tick later calls `consumeLocalSpend` and is not drawn again. A passive per-tick cash change (no audited movement) becomes the calm `budgetTrend` readout instead of a chip.
- Cash is in the primary cluster; Tech Debt, Morale, Reputation inline at ≥ 1720 px, otherwise in the "Indicators" popover with three status dots.

### 9.2 Cooldown ring

`CooldownButton` + `.cooldown-ring` (`index.css`): a conic gradient driven by `@property --progress` (`<number>`, registered so it can transition) with `transition: --progress 1s linear`, so progress eases across one tick instead of stepping. `useMitigations` computes `cooldownProgress` from `mitigation_cooldowns` and the tick.

### 9.3 Runbook pricing and gating (mirrors the server)

`utils/runbooks.ts` and `hooks/useMitigations.ts` implement, on the client, what `simulator.apply_mitigation` does: the **effective** price (CI/CD upgrade halves `rollback` cost and tech-debt penalty; a solved log triage discounts up to `TRIAGE_COST_DISCOUNT_MAX` = 50% by accuracy), and the block reason in the same order the server checks it (`cooldown`, `providerOutage`, `noIncident`, `featureFreeze`, `budget`), with `missingCash` for the budget case. The list price is kept so the UI can strike it through. The server still validates and charges; if the two ever diverge the server wins and the error text is shown verbatim as a toast. Test: `utils/runbooks.test.ts`, `hooks/useMitigations.test.ts`.

### 9.4 Incident lifecycle and next action

`utils/incidentLifecycle.ts`: five presentation-only steps (new, acknowledged, investigated, mitigating, resolved) derived from the backend status, `triage_solved` and the client-side `mitigate` run-animation; `nextIncidentAction` returns the one thing to do next (acknowledge → investigate → choose runbook). `IncidentActionButton` renders it and is shared by the dock card and the alert stack. `IncidentLifecycleTrack` draws the track.

### 9.5 Async actions

`useAsyncAction` / `runExclusive(key, task, { confirmed })` is a global in-flight registry: a button stays **pending until the confirming telemetry frame** (e.g. the incident is no longer `active`), not merely until the HTTP call returns, so there is no window where it is clickable again while the card still shows the old status. A 5 s timeout stops a lost confirmation from wedging a button. `useAcknowledgeIncident` is the one acknowledge flow (beep, success toast, backend error text on failure, pulls a snapshot when the simulation is paused). Test: `hooks/useAsyncAction.test.ts`.

### 9.6 Toast region

`FloatingCombatText`: polite live region above the dock (`--dock-height`), newest last, errors never merged, hover pauses all timers, click dismisses, dwell by tone plus extra for long text (`dwellFor`). Test hook: `data-testid="floating-text"`, `data-tone`. Test: `e2e/mitigation-cooldown-toast.spec.ts`.

### 9.7 Dock

Seven tabs (three on the bar, four behind "More"), sliding indicator, `animate-panel-in`, badges from `useDockBadges` (primitive selectors; achievements badge stays off until the first real frame so loading a run does not light it), `HudPopover` for "More", catalogs cached by `useCatalogs` (`createCatalog`: one fetch, keeps old data when a refresh fails, prefetched on dock mount). The upgrades tab is a three-column tree at `lg`.

---

## 10. Office Interaction

Rendering and lighting: IZ-IMPL-05. Interaction pieces:

- **Camera:** critically damped spring (`springStep`, closed form, stable at any frame time), zoom-to-cursor (`zoomAt`), release inertia (0.28 s of release velocity), rubber-band soft bounds while dragging and a hard clamp otherwise (`CAMERA_FOCUS_BOUNDS`), scale limits 0.75–2.0, fly-to with `OMEGA_FLY`, skyline parallax capped at 26 px. State lives in the controller; React never re-renders for a wheel tick. Test: `office/cameraMath.test.ts`.
- **Center on Crisis:** `pickCrisisServiceId` (`sceneLayout.ts`) chooses the worst failing rack (highest incident severity, then a down service over a degraded one); with nothing failing it centres the vault. Opening an incident detail flies the camera to that rack and, on close, flies back to the framing the player had.
- **Minimap:** `TacticalMiniMap` shows the zones, blinking markers on affected racks, a viewport frame that follows `cameraBus` imperatively, click-to-pan and "Center on Crisis".
- **Scene transitions:** `useServiceTransitions` diffs each telemetry frame against the previous status snapshot (`serviceTransitions.ts`) and emits `degrade` / `fail` / `recover` run-animations with a TTL (1.4 / 1.8 / 2.0 s). Nothing is emitted for a session's first frame or an empty fleet, so loading mid-incident never replays a failure. The rack shake, cascade ripple and restore sequence read those run-animations. Tests: `serviceTransitions.test.ts`, `useServiceTransitions.test.tsx`.
- **Roster in the scene:** engineers walk from reception to desks, to the vault when their incident is picked up, and to the lounge when resting (IZ-IMPL-05 §3). Vacant desks show a marker. A seated sprite leans in when an acknowledge is in flight.
- **Rack radial menu** (`RackRadialMenu`): focus, log triage, incident detail, close; incident actions disabled with a reason when there is no open incident. The ring has its own keyboard handler.
- **Build mode:** `BuildModeOverlay` arms a module type; `BuildPlacementGhost` shows a translucent preview on the shelf slot placement will really use (placement is slot-based, not cursor-based).
- **Hover:** racks and desks report the pointer to `officeHover`, which moves the tooltip without a render.

---

## 11. Tutorial

`components/tutorial/*`, `hooks/useTutorialEngine.ts`.

- **Declarative steps** (`tutorialSteps.ts`): `welcome`, `rack`, `card`, `acknowledge`, `investigate`, `findCause`, `runbooks`, `mitigate`, `recap`, `governance`. Each has a `kind` (`info` waits for Next; `action` waits for the player to do the real thing), `targets` (CSS selectors tried in order, or unioned), `placement`, `needsIncident`, `completeWhen(snapshot)`, an `onEnter` side effect restricted to safe navigation (`TutorialEnv`: show a dock tab, select a service, open/close the log terminal, ensure an incident), and an optional `allowsGameplayModal`. Everything below the list is a pure function over `TutorialSnapshot`, unit-tested without a DOM (`tutorialSteps.test.ts`, `tutorialLayout.test.ts`).
- **Practice incident:** if no real open incident exists the engine calls `POST /api/tutorial/incident` (`backend/app/api/v1/tutorial.py`, `engine.spawn_tutorial_incident()`), a deterministic practice incident; otherwise it adopts a natural one. If neither can be had, action steps are skipped (`noIncident`).
- **Overlay** (`TutorialOverlay`, `SpotlightHole`, `CoachCard`): a portal at `z-tutorial`. It is **non-modal on purpose**; the highlighted control must stay clickable. The spotlight re-resolves its target **every frame** (a `ResizeObserver` cannot see a panning camera or a dock tab mounting later) and glides between targets by writing straight to the DOM; it dims, optionally blocks clicks outside the hole on info steps, and steps aside while a gameplay dialog brings its own backdrop (unless the step asked for it, e.g. the log terminal).
- **Lifecycle** (`TutorialRoot`): never on top of the title; on a first run a small offer card appears once the title is gone (`tutorialOfferPending`); the tour runs while `onboardingOpen`; returning to the title mid-tour ends it. The engine registers on the modal stack (`TUTORIAL_MODAL_ID`) so shortcuts are muted during it.
- **Cheat sheet:** `TutorialCheatSheet` renders the 4 runbooks × 4 causes effectiveness matrix (`mitigationMatrix.ts`, mirrored from the backend formulas); reachable from the pause menu.
- **`data-tour` contract.** Tutorial targets are DOM attributes that must not be renamed casually: `office-canvas`, `topbar-kpis`, `cash-counter`, `bottom-dock`, `incident-card`, `incident-ack`, `incident-investigate`, `triage-lines`, `runbook-grid`, `runbook-rollback`, plus `data-rack-service-id` (on the rack group in `ServerRack.tsx`; the "rack" step points at the rack itself and falls back to the desk's `data-service-id`).

---

## 12. Gameplay Modals and Menus

- **IncidentDetailModal:** three blocks (what is happening, what is the impact, what can I do now) with the lifecycle track and the shared runbook list.
- **LogTriageTerminal:** typewriter boot line, listbox keyboard navigation (Arrow/Home/End), a confirmation stamp overlaid so nothing moves, wrong picks wobble (`shake-once`), `data-tour="triage-lines"`.
- **CABDilemmaModal:** timed decision that cannot be dismissed with Escape; a draining deadline bar (stepped by tick, smoothed imperatively with `scaleX`), outcome preview and result view. The server owns the deadline and auto-resolves; the bar is presentation. Tests: `utils/cabDeadline.test.ts`, `components/modals/gameplayModals.test.tsx`.
- **PostMortemModal:** rendered with `utils/markdown.tsx`, a small renderer with **no `dangerouslySetInnerHTML`**: the source is parsed to a tree and every leaf is a React text node, so markup in the report is shown as inert text; links are limited to http, https and mailto. Test: `utils/markdown.test.tsx`.
- **IncidentReplayModal:** event timeline from `utils/replayEvents.ts` and a clipboard JSON export.
- **TitleScreen:** staged entrance (90 ms steps), arrow-key navigation, "Continue" vs "Start operation" depending on saved progress, server status (`connecting` becomes `offline` only after 4 s) and version line, mute chip, hover/confirm sounds, warms lazy chunks while idle.
- **PauseMenuModal:** resume, restart (inline confirm as `alertdialog`), change mission, audio/display prefs, cheat sheet, exit to title; holds the simulation.
- **SettingsModal:** master and music volume, mute toggles, language, high contrast, colour-blind-safe palette and the **Motion** setting (`system` / `on` / `off`).
- **PostMatchDebriefModal:** staged reveal planned by `planDebrief` (pure, never more than `MAX_DEBRIEF_MS` = 3000 ms; all at once when reduced). Test: `utils/debriefTimeline.test.ts`.
- **CreditsModal:** CSS-driven roll that pauses on hover/focus; plain list under reduced motion. **ScenarioBuilderModal:** range sliders.

---

## 13. Audio

Procedural Web Audio only; no audio files and no dependencies. **None of it has been verified by ear in this project;** what is tested is the graph/helper logic against a fake `AudioContext` (`src/test/fakeAudio.ts`, `utils/sound.test.ts`, `utils/audioMode.test.ts`).

- **Graph** (`utils/audioEngine.ts`): one lazily created `AudioContext`; buses `sfx`, `ui`, `music`, plus looping `siren` and `heartbeat` gains → master gain (mute) → soft limiter → destination. Synth primitives `playTone` and `playNoise` (enveloped, optionally filter-swept). One-shots beyond 48 concurrent voices are dropped; `allowRate(key, minGapMs)` rate-limits repeats. Volume and mute (separate master and music) persist in `localStorage` under `incidentzero.audio_*` and `incidentzero.music_*`. Everything degrades silently without web audio or before the first gesture.
- **Unlock:** `useBackgroundMusic` unlocks the context and starts the music on the first `pointerdown` or `keydown`.
- **UI sound API** (`utils/sound.ts`): click, hover, confirm, back, close, open, ready, stamp, gavel, countdown tick, whoosh, success, error, type tick (defined, currently not called by any component), plus gameplay cues (incident chirp, acknowledge beep, restored chime, mismatch, dilemma chime, cash, victory/defeat, red-alert siren loop, critical heartbeat loop). `useDialogSounds(open)` plays open/close feedback from the open flag, so Escape, backdrop clicks and programmatic closes sound the same.
- **Music** (`utils/musicEngine.ts`): `setMusicMode("menu" | "game" | "paused")` cross-fades the menu theme, the game bed and a muffled, ducked pause bed; `setMusicTension("calm" | "tense" | "critical")` and `setMusicDefcon(level)` scale the tension layers; `duckMusic(ms)` ducks by 6 dB and swells back (overlapping calls extend it).
- **State mapping** (`utils/audioMode.ts`, pure): menu on the title; paused when the pause menu is open, the simulation is stopped or the run ended; otherwise game. Looping alarms sound only while the game is truly in play (`isGameplayActive`). The Settings dialog is deliberately **not** a music input so the music slider stays audible.

---

## 14. i18n Loading

- English is bundled (fallback and tests). `pt-BR` and `es` are dynamic chunks: `i18n/loadLanguage.ts` imports `locales/<lang>` (core `Translations`, `hud`, `flow`, `gameplayModals`, `officeLife` and the dynamic-content tables) and registers them (`registerTranslations`, `registerDynamicLocale`). `main.tsx` awaits `loadLanguage(storedLanguage)` before the first render (an inline splash in `index.html` covers the wait); the store's `setLanguage` loads before switching. Concurrent loads share one promise; a failed fetch rejects and can be retried. Test: `i18n/loadLanguage.test.ts`.
- **Rules.** (1) Never read a non-English dictionary before `loadLanguage` has resolved: `TRANSLATIONS[lang]` quietly falls back to English for an unloaded language, so a violation shows up as untranslated text, not an error. (2) Locale modules import only **types** from the shared definition files (e.g. `import type { HudCopy } from "../../hud"` in `locales/pt-BR/hud.ts`), so they never pull the English dictionary into their own chunk; this was checked on `hud.ts`, not audited file by file. (3) Each locale uses `satisfies Translations`, so a missing key fails `tsc`.
- **Chunks** (`vite.config.ts` `manualChunks`): `vendor-react` for react/react-dom/scheduler, `locale-<lang>` per language. Recorded sizes (from IZ-IMPL-09 §12.12, not re-measured in this revision): entry ≈ 350 kB (107 kB gzip), `vendor-react` ≈ 142 kB, locale chunks ≈ 50 kB each.
- `App.tsx` keeps `<html lang>` in step with the language setting.

---

## 15. Accessibility Summary

| Feature | Where |
|---|---|
| Reduced motion (OS or in-game) | §4 |
| High contrast, colour-blind-safe remap | `index.css` `[data-high-contrast]`, `[data-colorblind-safe]`, stamped by `App.tsx` |
| Focus trap, Escape stack, focus restore | `Modal`, `modalStack` |
| Keyboard ring on every control | `index.css` base layer |
| Live regions | Toast region (`role="status"`, polite), deploy veil, shift banner, freeze banner, `LazyModalHost` skeleton, several panels |
| Shortcut hints | `aria-keyshortcuts` and `kbd` chips on dock tabs, speed and menu buttons |
| Disabled actions explain why | Radial menu and runbook cards expose the block reason |
| Tab and Space respected | §8.1 |

Not covered: touch interaction, screen-reader testing (no assistive-technology run was performed), and any audit against a formal WCAG checklist.

---

## 16. Test Contracts

**Vitest** — 52 files, **354 tests**, all passing when run for this revision (jsdom, `src/test/setup.ts`; `e2e/` is excluded). Areas: camera math, lighting model, roster plan/stage, waypoint graph (door position, reachability, edges vs furniture), service transitions, scene layout, shortcut routing, async actions, runbook pricing/gating, KPI events, store (including KPI chips and structural sharing), sim pause, audio helpers and engine, markdown, CAB deadline, debrief timeline, tutorial steps/layout, i18n loading, lazy dialogs, menu navigation, replay/audit helpers, and some component renders.

**Playwright** (`frontend/e2e`, needs the live backend; helpers in `e2e/helpers.ts`: `resetSession`, `withCleanLocalStorage`, `enterOffice`, `titlePrimaryButton`) — **8 specs in 6 files** (defined; **not run in this revision**):

| File | Specs |
|---|---|
| `smoke.spec.ts` | 2 |
| `mitigation-cooldown-toast.spec.ts` | 2 |
| `incident-card-click.spec.ts` | 1 (stretched-button regression) |
| `ping-pong-ball-sync.spec.ts` | 1 |
| `wandering-employee-moves.spec.ts` | 1 |
| `wheel-zoom.spec.ts` | 1 |

**Stable test hooks:** `data-testid` = `title-screen`, `title-primary`, `title-server-status`, `title-version`, `floating-text` (+ `data-tone`); `data-tour` values (§11); `data-rack-service-id`, `data-service-id`, `data-kpi`, `data-menu-item`, `data-camera-ignore`, `data-stretched`. Treat them as an API.

---

## 17. Known Limitations and Lessons

**Limitations (honest status)**

- **Audio has never been heard** by the team in this project; levels, balance and the music beds are untuned.
- **Frame rate is unmeasured.** Performance statements are structural (what re-renders or repaints), not benchmarked.
- **Dock collapse reflows.** The collapse animates `grid-template-rows` (0fr ↔ 1fr), which is a layout animation, unlike the transform/opacity rule elsewhere; the toast stack follows via `--dock-height`.
- **Touch pan/zoom is unsupported** (mouse and keyboard only).
- **Scene geometry is duplicated** between `office/officeLayout.ts` (roster/pathfinding) and `office/sceneLayout.ts` (scene, camera, lighting), kept in sync by hand and partly by tests.
- **Two "red alert" predicates** exist (DEFCON tier for lighting, `useRedAlert` for NPC and boardroom behaviour); intentional, but easy to confuse.
- **Dead code:** `VictoryScreen.tsx`, `LiquidationScreen.tsx` (unmounted); `playTypeTick` and the `combat-text-pop` keyframe have no callers.
- **Locale coverage** was checked structurally (`satisfies Translations`), not by native-speaker review.
- Playwright specs depend on a live backend and were not re-run for this document.

**Lessons recorded**

- **The stretched-button regression.** The global press squash (`button:active { transform: scale(.96) }`) makes the pressed button the containing block of its own `::after`; a "stretched" card button (`after:absolute after:inset-0`) then lost its click area the instant the mouse went down. Fix: `data-stretched` buttons are excluded in `index.css`; guarded by `e2e/incident-card-click.spec.ts`.
- **The SMIL pitfall.** SMIL `<animate>` counts time from page load, so an element added minutes into a session can start already finished and never show. Office effects use CSS keyframes started on mount (`CascadeRipple`) instead; no SMIL remains.
- **Presence vs. store nulls.** Dialogs keyed off a store value that goes `null` on close need the value cached in the hook (`usePresence`), not in the store.
- **0.01 ms is not "off".** See §4.
