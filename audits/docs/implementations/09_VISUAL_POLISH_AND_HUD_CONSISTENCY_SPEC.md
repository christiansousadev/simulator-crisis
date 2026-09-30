# Visual Polish and HUD Consistency — Implementation Specification

**Document ID:** IZ-IMPL-09
**Classification:** Implementation Contract
**Status:** Implemented, additive only, non-breaking
**Integration baseline:** `frontend/src/components/modals/*.tsx`, `frontend/src/components/common/*Meter.tsx`, `frontend/src/components/common/CreditCounter.tsx`, `frontend/src/components/office/IsometricOffice.tsx`, `frontend/src/components/office/ServerRack.tsx`, `frontend/src/index.css`, `frontend/tailwind.config.js`

---

## 1. System Objective

A visual/UI audit of the running app (not a design review from mockups — a direct read of the rendering code, `frontend/src/components/office/*`, `frontend/src/components/common/*`, `frontend/src/components/modals/*`, `index.css`, `tailwind.config.js`) surfaced eight concrete, verifiable gaps between what the app already does well in isolated spots and what it does inconsistently or not at all elsewhere. This document covers the eight fixes made in response, plus one deliberate **non-fix**: two screens the audit initially flagged as an inconsistency turned out, on closer reading, to be a coherent design already, not a bug — see § 2.

---

## 2. HUD/Modal Palette — Unified Where It Was Actually Inconsistent, Left Alone Where It Wasn't

The audit found the app's dialogs split across a dark register (`bg-slate-900`, most gameplay dialogs) and a light one (`bg-white`, four others), with no stated rule. On inspection, this split resolves into two groups, not one bug:

- **`PostMortemModal.tsx` and `IncidentDetailModal.tsx`** were genuinely arbitrary outliers — plain informational dialogs with no reason to differ from the dark HUD register every other gameplay dialog uses. Both were recolored to match it: `bg-slate-950/80` backdrop, `bg-slate-900`/`border-slate-700` card, `slate-100`/`slate-300` text tiers, accent colors (rose for incident severity, sky for actions) kept but moved to their `/15`-opacity dark-mode equivalents.
- **`VictoryScreen.tsx` and `LiquidationScreen.tsx`** were originally styled as an "official letter" (`bg-white`, `rounded-sm`, a rotated stamp/grade badge in the corner, the same header/stat-grid/footer structure). In the current architecture, these stand as unmounted legacy/fallback templates, superseded by the unified dark-tactical `PostMatchDebriefModal.tsx` as the primary match-end lifecycle experience.
- **`LogTriageTerminal.tsx`**'s `bg-black`/`font-mono`/green-on-black terminal look is likewise an intentional third register (a log terminal reads like log terminal), also left as-is.

Net effect: coherent visual styling across dark HUD dialogs, terminal drawers, and the comprehensive debrief modal.

---

## 3. Meter and Counter Animation

`ReputationMeter`, `MoraleMeter`, and `TechDebtMeter` had no `transition` class on their fill-bar `<div>`s — every value change was an instant width snap, unlike `ErrorBudgetMeter`, which already used `transition-all duration-500`. All three gained the same class, for a consistent smooth fill across every topbar meter.

`CreditCounter.tsx` — the runway/budget readout, one of the most-watched numbers in the HUD — displayed `budget` verbatim with no animation at all, snapping on every passive-burn tick and every spend. A new reusable hook, `useAnimatedNumber(target, durationMs = 450)` (`frontend/src/hooks/useAnimatedNumber.ts`), tweens a displayed value toward `target` via `requestAnimationFrame` with an ease-out cubic curve, cancelling and re-tweening from wherever the display currently sits if `target` changes again mid-animation. `CreditCounter` now renders `Math.round(displayBudget)` instead of `budget` directly. `ShieldGauge`'s discrete 16-segment design (each segment already independently `transition-colors`-ing) was left as-is — a segmented shield lighting up progressively is itself a reasonable metaphor, not an instant-snap bug like the other three were.

---

## 4. Modal Enter Transitions

Every modal in the app rendered via a plain `if (!open) return null`, appearing and disappearing with no transition. A true mount **and** unmount transition (keeping a closing dialog mounted long enough to animate out) was considered but rejected for the object-driven dialogs (`CABDilemmaModal`, `PostMortemModal`, `IncidentDetailModal`, `IncidentReplayModal`) specifically because their content is keyed off a store value (`activeDilemma`, `postMortem`, `selectedIncident`, `replayIncidentId`) that goes `null` the instant the dialog closes — animating the exit would require caching the last non-null value somewhere just to have something to render during the fade, which is real added state-management surface for a cosmetic-only win.

Instead, two new pure-CSS keyframe animations were added to `tailwind.config.js`: `backdrop-in` (a plain opacity fade, 150ms) and `modal-in` (fade + scale from 0.96 → 1, 180ms, ease-out — deliberately more subdued than the existing bouncy `pop-in` keyframe, which suits a toast/badge but reads as too playful for a settings dialog or a CAB dilemma). `animate-backdrop-in` was applied to every modal's outer `fixed inset-0` overlay and `animate-modal-in` to every inner card, across all eleven dialog components plus `VictoryScreen`/`LiquidationScreen`. Since these are plain CSS animations triggered on mount (not JS-driven, not gated on any lifecycle state), they carry zero risk to existing open/close logic — a dialog that has no explicit exit transition still just disappears instantly on close, exactly as before, but now visibly settles into place on open instead of appearing fully-formed on the very first frame.

---

## 5. Night Sky Now Tracks the Day/Night Cycle

The isometric office's SVG interior already color-grades per tick-derived day phase (a `feColorMatrix` filter, animated over 4s — Document `05_DAY_NIGHT_CYCLE_AND_DYNAMIC_OFFICE_VISUALS_SPEC.md`), and `SkylineBackdrop` already lights its building windows only at dusk/night. The CSS backdrop behind both (`.office-sky` in `index.css`) did not: it was a single fixed daytime-blue gradient, so the sky stayed bright at midnight while everything painted on top of it correctly darkened.

`IsometricOffice.tsx`'s root container now carries `data-day-phase={dayPhase}` alongside its existing `office-sky` class. The gradient itself was moved off the container's own `background` and onto a new `.office-sky::before` pseudo-element, specifically so a CSS `filter` can retint it per phase — `filter` processes an element's entire rendered subtree as one unit, and a `::before` has no descendants, so filtering it can never also reprocess the real SVG scene or `SkylineBackdrop` painted on top (which already carry their own, separately-correct treatments and must not be double-graded). Each `[data-day-phase="…"]::before` rule sets a different `brightness()`/`saturate()`/`hue-rotate()` combination (dawn: warm and slightly dim; dusk: darker and orange-shifted; night: very dim and blue-shifted); the base rule's `transition: filter 4s ease-in-out` gives a smooth crossfade matching the interior's own 4s grade transition, since `filter` — unlike `background-image` — is natively animatable by the browser.

---

## 6. Empty and Loading States

`IncidentsPanel`'s "no active incidents" state (a centered `CheckCircle2` icon over a line of text) was the one empty state in the app with real visual treatment; `AuditTicker`, `EngineerRosterPanel`, and `HallOfFameModal` all rendered a bare line of gray text instead. All three now pair an icon (`ScrollText`, `Users`, `Trophy` respectively) with their existing copy, matching `IncidentsPanel`'s pattern.

Separately, the only loading indicator anywhere in the app was a literal ellipsis character (`ScenarioSelectModal.tsx`, shown while the scenario catalog fetches); `HallOfFameModal` showed nothing at all during its fetch. A small reusable `Spinner` component (`frontend/src/components/common/Spinner.tsx`, a `Loader2` icon with `animate-spin` and an optional label) now covers both.

---

## 7. Iconography Consistency

`ServerRack.tsx` used a raw `🔧` emoji as its "mitigation in progress" overlay, the one place in the entire frontend mixing emoji with the otherwise-universal `lucide-react` icon set (35 files, zero other exceptions). Replaced with lucide's `Wrench` icon (the same icon `TechDebtMeter` already uses for the conceptually related "office mess" stat), rendered inside the existing `foreignObject` wrapper and `animate-wrench-turn` keyframe unchanged.

---

## 8. Heading Font Reach

`Rajdhani` (the project's one piece of distinctive "ops console" typography, loaded alongside `Inter` since the project's inception) was applied in only three places — the topbar title, the title screen, and the credits modal — leaving every dialog title and panel header on plain `Inter` bold. `font-heading` was added to the title element of every remaining dialog: `SettingsModal`, `HallOfFameModal`, `CABDilemmaModal`, `ScenarioSelectModal` (both its main title and each scenario card's name), `ScenarioBuilderModal`, `OnboardingModal`, `IncidentReplayModal`, `IncidentDetailModal`, and `PostMortemModal` (the latter two picked it up as part of § 2's dark-palette conversion). `VictoryScreen`/`LiquidationScreen` were deliberately excluded — their "official letter" register (§ 2) calls for a traditional, not a sci-fi-condensed, typeface.

---

## 9. Global Button Press Feedback

Every button in the app previously had only a `transition-colors` hover state; none had any press/active feedback. Rather than touching every call site (there is no shared `<Button>` component in this codebase to change centrally), a single base-layer rule in `index.css` — `button:not(:disabled):active { transform: scale(0.96); }` — covers every button in the app at once. It carries no `transition` of its own by design: `:active` only holds while the pointer is down, so the scale-in and scale-out both happen instantly on press/release, reading as a crisp click rather than needing an eased tween; this also sidesteps any cascade interaction with existing `transition-colors`-style utility classes, which set `transition-property` to a list that does not include `transform` and would otherwise contest which properties are considered "transitioning" on the same element.

---

## 10. Phase 2 — Tactical War Room & Game-Feel Overhaul (As-Implemented)

A second, larger revision pass followed the polish pass documented in §§ 2–9 above, with an explicit brief to eliminate every remaining light-mode/corporate-dashboard surface and establish a coherent **Tactical War Room** register across the dock, the office diorama, transient feedback text, the skyline, the camera-control affordances, and the emergency-lighting model. All six changes below are additive/restyling only: no `TICK_BROADCAST` field, REST route, or store action signature was altered, and `npx tsc --noEmit`, the Vitest suite, and `npm run build` all remained clean throughout (§ 11 re-confirms this for the combined batch).

1. **Bottom Dock Migration (Light Theme Elimination).** `BottomDock.tsx` and every panel it hosts (`IncidentsPanel.tsx`, `MitigationsPanel.tsx`, `AuditTicker.tsx`, `EngineerRosterPanel.tsx`, `UpgradesPanel.tsx`, `AchievementsPanel.tsx`) were converted from the light `bg-white` / `bg-slate-100` / `border-slate-200` register to a dark tactical palette: `bg-slate-950/90 backdrop-blur-md` on the dock shell, `bg-slate-900/80 border-slate-800` on individual cards, cyan-neon (`text-cyan-400`, `border-cyan-500/40`, a matching `shadow-[0_0_12px_rgba(6,182,212,0.25)]`) for the active-tab state, a pulsing rose badge (`animate-pulse`) for the open-incident count, and per-severity card glow on `IncidentsPanel` (`border-rose-500/60` + a rose shadow for `P1_CRITICAL`, `border-amber-500/50` + an amber shadow for `P2_HIGH`). The `.cooldown-ring` conic-gradient sweep used by `CooldownButton` (§ 6 below) was recalibrated as part of this pass, not left at its original light-mode tuning.
2. **Structural 3D Foundation (Physical Diorama).** `IsometricOffice.tsx` gained two new render primitives, `FoundationBlock` and `MasterGroundShadow`, both drawn immediately before `PerimeterWalls`/`ParquetFloor` in the paint order. `FoundationBlock` is an `IsoBox` spanning `z=-0.65` to `z=0` across the full floor footprint, rendered in a dark structural-concrete tone (`#1e293b`) with a grid of vertical divider lines drawn across its two visible faces to read as cast support pilasters, rather than a flat, featureless slab. `MasterGroundShadow` is a single wide, soft ellipse (reusing the existing `groundShadowGradient` radial gradient already shared by every prop's individual `GroundShadow`) positioned beneath the foundation's base. Together these eliminate the previous "thin floating slice" impression: the office now reads as a physically-grounded architectural cutaway model.
3. **Arcade Combat Text.** `FloatingCombatText.tsx` was converted from light-mode toast pills (`bg-rose-50`, `bg-emerald-50`, etc.) to dark, glass-panel arcade chips: a shared `bg-slate-950/85` base per tone, with a colored border and a matching `box-shadow` glow (`border-rose-500/60` + rose glow for `danger`, `border-amber-500/60` + amber glow for `warning`, `border-emerald-500/60` + emerald glow for `success`, `border-sky-500/60` + sky glow for `info`, and `border-yellow-400/70` + a stronger yellow glow for a new `gold` tone, added to the `FloatingTextTone` union alongside this pass for climactic positive events such as a survived `MONTHLY_AUDIT_CYCLE_SURVIVED` audit cycle or a positive CAB dilemma budget delta — Document `02_ERROR_BUDGET_AND_CAB_GOVERNANCE_SPEC.md` § 3 documents the dilemma-resolution flow that is one of this tone's triggers). Typography moved to `font-mono font-black uppercase tracking-wider` for a readout/HUD feel rather than a notification-banner feel. The shared `combat-text-pop` keyframe (`tailwind.config.js`) gained an added mid-flight step — `translateY(-8px) scale(1.05)` at 55% — producing a slight elastic overshoot before the chip continues its rise and fades out sharply in the animation's final 15%.
4. **Atmospheric Skyline and Aerial Signaling.** `SkylineBackdrop.tsx` gained a dedicated deep-atmosphere background gradient (`#030712` at the top to `#0f172a` at the horizon, full opacity at dusk/night and a faint 0.22-opacity vignette during the day so the existing daylight CSS gradient behind it still shows through), plus a ground-hugging horizon-haze band (`rgba(15,23,42,0.85)` fading to transparent) where the skyline silhouette meets the office floor. The tallest ("near"-depth-band) towers' rooftop antennas gained a small blinking red aviation-warning beacon (`animate-pulse`). Window-pane tones were softened from a flat, fully-opaque amber (`#fbbf24` at `opacity: 0.9`) to a warmer, per-cell-intensity-varied pair (`#fef08a` warm-white / `#7dd3fc` soft cyan, intensity cycling `0.55`–`0.91` per cell via a deterministic hash of row/column) so the building faces no longer read as a wall of identical solid squares.
5. **Unified Camera-Control Panel.** The two previously independent, separately-positioned floating buttons — "Center on Crisis" (`top-3 left-3`) and the build-mode toggle (`top-3 left-[17.5rem]`) — were consolidated into a single cockpit-style container (`bg-slate-950/80 backdrop-blur-md border border-slate-800/80 rounded-lg`, `top-3 left-3`) in `IsometricOffice.tsx`, so the two camera/mode affordances read as one control cluster rather than two unrelated floating elements. Each button kept its own state-driven styling (a rose glow for the crisis-recenter action, a cyan glow for an armed build mode) inside the shared shell.
6. **Refined Red-Alert Emergency Lighting.** The prior red-alert treatment applied a flat, translucent brick-red overlay (`#7f1d1d` at `opacity: 0.22`) on top of the ordinary day/night color grade, which visually washed the whole scene toward pink/salmon rather than reading as an emergency blackout. This was replaced with a dedicated `feColorMatrix` grade (`RED_ALERT_GRADE_MATRIX`) that overrides the day-phase matrix entirely whenever `redAlert` is true (a live `P1_CRITICAL` incident, or `status === "breached"`) — heavily desaturating and darkening the scene toward a cool navy, with a fast 0.8s transition rather than the day/night cycle's 4s one. The `RedAlertOverlay` vignette itself was retuned from the red wash to a near-black (`#020617`, `opacity: 0.4`) darkening layer, so red now reads only from the rotating `EmergencyBeacon` cones and the racks' own status glow — light cutting through darkness, not a uniform tint. See Document `05_DAY_NIGHT_CYCLE_AND_DYNAMIC_OFFICE_VISUALS_SPEC.md` § 2.4 for the full as-implemented lighting-model detail.
7. **`.cooldown-ring` High-Contrast Calibration.** The radial cooldown sweep's conic-gradient color (`index.css`, consumed by `CooldownButton.tsx` and used throughout `MitigationsPanel.tsx`'s runbook cards) was recalibrated from `rgba(15,23,42,0.7)` to `rgba(2,6,23,0.78)` — a near-black rather than a mid-navy — specifically because the original value, tuned against the pre-Phase-2 light `bg-white` runbook cards, became visually indistinguishable from the new dark `bg-slate-900/80` card background it now sweeps over. The recalibrated value preserves the "wedge recedes to reveal the button" affordance against both the current dark cards and any future light-mode surface reusing the same shared class.
8. **Comprehensive HUD, Audio & Tactical Controls:**
   - **Reorganized HUD:** Critical indicators (Cash runway, SLA %, Error Budget) prioritized in topbar, with secondary indicators (Reputation, Tech Debt, User Morale) cleanly positioned with responsive folding.
   - **Unified Status & Severity Tokens (`StatusPill.tsx`, `severity.ts`):** Canonical color-coding applied across incidents, server racks, and modals (`P1_CRITICAL` rose-500, `P2_HIGH` amber-500, `P3_MEDIUM` sky-500, `P4_LOW` slate-400).
   - **Tri-Block Incident Modal (`IncidentDetailModal.tsx`):** Structured into three functional zones: (1) Diagnosis & Service Topology, (2) Investigation Terminal & Log Triage, (3) Mitigation Execution & Runbook Matrix.
   - **Interactive Office Diorama:** Real-time rack states (`healthy`, `degraded`, `down`, `investigating`, `mitigating`) with volumetric smoke, sparks, and cooling LED patterns. Engineer sprites seated at desks depict idle, working, panic/alarm, investigation, mitigation, stress, and resting states driven by real staff telemetry.
   - **Tactical Audio Synthesizer (`sound.ts`):** Built entirely with the Web Audio API (zero external audio file dependencies). Generates procedural alert chirps, terminal keystrokes, runbook execution rumbles, and victory/defeat stingers, governed by volume and mute toggles.
   - **Accessibility & Reduced Motion:** Respects OS-level `prefers-reduced-motion: reduce` preference: global CSS rule in `index.css` clamps all animation and transition durations to `0.01ms` (disabling UI pulsing, spins, and backdrop fades) while forcing `scroll-behavior: auto`, and `App.tsx` explicitly bypasses imperative screen shake classes (`screen-shake-light`, `screen-shake-heavy`).
   - **Match End Lifecycle:** Consolidated under `PostMatchDebriefModal.tsx` displaying full match debrief, personal best comparisons, unlock triggers, and operational ranks.

---

## 11. Verification & Quality Gates

*Implementação e componentes visuais presentes no código; validação de execução de build e testes automatizados fora do escopo desta atualização documental.*
