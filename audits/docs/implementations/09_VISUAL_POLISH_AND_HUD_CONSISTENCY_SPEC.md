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
- **`VictoryScreen.tsx` and `LiquidationScreen.tsx`** are a deliberate, internally consistent pair — both styled as an "official letter" (`bg-white`, `rounded-sm`, a rotated stamp/grade badge in the corner, the same header/stat-grid/footer structure) rather than a HUD dialog. Recoloring these to dark would have broken a real, working "printed document" metaphor to satisfy a rule that was only ever meant to catch accidental inconsistency. They were left as-is.
- **`LogTriageTerminal.tsx`**'s `bg-black`/`font-mono`/green-on-black terminal look is likewise an intentional third register (a log terminal reads like log terminal), also left as-is.

Net effect: three coherent visual families (dark HUD dialogs, paper documents, terminal) instead of two arbitrary ones.

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

## 10. Verification

`npx tsc --noEmit`, the Vitest suite (`npm test`), and `npm run build` (including the PWA precache manifest) were all re-run clean after every change in this batch.
