# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dates are used instead of semantic
version numbers since this project hasn't tagged releases yet.

## [Unreleased]

### Added (animations & game feel)

- Layered sprite rig in `OfficeWorker`: contact shadow on the floor outside every bob; legs, arm
  swing (counter-phase, with the laptop/mug arm locked), body bob and shadow all driven by one
  `--step` clock derived from walking speed (`workerRig.gaitFor`); whole-pixel 4-frame poses with
  `steps()`, no rotation or skew.
- Breathing on the upper body only, with a per-sprite phase; `tired` and `recovering` are no
  longer static. Typing now comes in bursts with reading pauses.
- Four isometric headings (`heading: "ne" | "nw" | "se" | "sw"` on `WalkerView`) with a simplified
  back view; routes ease in from a standstill and brake into the stop; anticipation, settle and
  two-frame sit/stand cues.
- Startle hop and a 7×9 pixel `!` balloon sweeping the floor in a 0–300 ms wave when an incident
  hits; three seeded panic styles; urgency lean instead of `skewX`; cheer when a service is restored.
- `useIdleGesture`: look around, check the watch, stretch, and sip from the desk mug (the mug leaves
  the desk via `deskLife`); the break-room employee pulls a shot at the espresso machine and lounges
  on the sofa.
- Juice: `.ol-press` squash & stretch on desks, racks and staff; `PixelBurst` confetti on rack and
  desk when a service is restored; rack fans strain when degraded and spin down when down, a down
  chassis rattles, and top sparks fire in irregular bursts.
- Screen shake moved from the app root to the office SVG (`useSceneShake`): HUD, dock and KPIs stay
  still; three magnitudes (breach / P1 / bankruptcy) with a 1.5 s cooldown. Reduced motion shows a
  static red border flash instead.

### Added (ambient life & world feedback)

- Ambient office life:
  - the vault's glass door slides on a 4-frame track while someone crosses it;
  - a desk chair is left pushed back and turned while its engineer is away;
  - vacant desks run a dim, slow screensaver;
  - desk lamps switch on at dusk (18:00) with two flicker frames;
  - potted plants rustle one pixel when someone runs past on red alert;
  - the sofa cushion sinks with a small elastic settle under whoever lounges on it.
- World-anchored value chips (`WorldChip`): `+SLA` rises off a restored rack, `-$` off a rack under a
  runbook, and `+XP` off the desk of the engineer whose service was restored (the XP the backend
  grants on resolution). The HUD's floating text still carries the numbers under reduced motion.
- Urgency runs kick up two recycled 1–2 px dust motes behind the heels, one per footfall.
- On red alert, one executive at the metrics TV points at the screen while the other taps a foot
  (`OfficeWorker` `action`); lounge wanderers turn toward the vault, crane their head and take one
  hesitant step back (`wary`) instead of freezing.
- `capture-screenshots.spec.ts` now produces all 26 official screenshots: it hires two specialists
  so the office HUD shows engineers seated at lit desks, and adds the forensic log triage terminal
  and the guided tutorial spotlighting the alerting rack (EN and pt-BR).
- Tests: `ambientLife.test.tsx` (17 cases, reduced motion included).

### Fixed (tests)

- The frontend test run is now free of `act()` warnings (it had 9). Components were unmounted before
  `afterEach` store resets in `foundation` and `officeScene`; the post-mortem close in `AuditorChat` is
  wrapped in `act`; and the asynchronous hire in `EngineerRosterPanel` settles inside `act`.

### Fixed (animations)

- The screen shake never ran in production: its keyframes were defined only in
  `tailwind.config.js`, which emits a keyframe only for a used `animate-*` utility. They now live in
  `index.css`.
- Removed conflicting duplicate keyframes: `animate-walk-cycle-*`, `worker-bob`, `bounce-panic` and
  `sprint-bounce` existed in both Tailwind and `officeLife.css`, and the office stylesheet's global
  `.animate-pop-in` silently overrode the HUD's pop-in. In-world balloons now use `.ol-pop`.

### Added (career & office polish)

- Prestige badge on the top-bar Hall of Fame button: shows the spendable balance (compact `1.2k`
  form), bumps on every earn/spend, and names the balance for screen readers.
- `?` / `H` open the SRE Academy from anywhere in-game (listed in Settings → Keyboard shortcuts).
- Decor shop: fully localized (en / pt-BR / es) by cosmetic id, shortfall hint on unaffordable
  items, error and confirmation announcements, double-click guard, proper `tab`/`tabpanel` wiring
  with arrow-key navigation; the catalog is fetched once per opening instead of on every filter.
- `IsoFaceDecal`: pixel detail painted onto an isometric face's own 2:1 plane. The boardroom C4
  sketch now sits on the whiteboard (it used to overflow it) and flags the failing service on red
  alert; desks get a handled SRE mug that steams while its engineer is seated; the wall carries an
  extinguisher station with locator sign, a first-aid cabinet and a pictogram exit sign.
- Tests: `HallOfFameModal.test.tsx`, `Topbar.test.tsx`, `officeDetails.test.tsx`,
  `backend/tests/test_cosmetics.py`, and help-key routing cases.

### Fixed

- README and Settings shortcut lists were missing `W` (war room) and `D` (dock).
- `active:scale-98` (not a Tailwind utility) on the unlock button replaced with `active:scale-[0.98]`.

### Added (systemic evolution)

- Deterministic offline auditor for the post-mortem interview (no more `503` without an LLM key);
  replies are labelled `source: "offline"` and clamp to the same verdict ceilings.
- Session reset archives and checksums the purged ledger (`archived_audit_ledgers`) and records
  `SESSION_ARCHIVED_AND_PURGED`; new ledger events `TRAFFIC_THROTTLED`, `STATUS_PAGE_UPDATED`,
  `ENGINEER_LEVELED_UP` (38 event types).
- Circadian load (peak 1.5x / overnight 0.4x) over SLA impact, failure hazard and surcharge;
  emergency traffic throttle; stakeholder feed and public status page; engineer XP and levels
  (migration adds `engineers.xp`).
- Service dependency graph view, pinnable split dock, dockable log terminal, compact top bar down
  to 1280 px, war-room dock tab (`W`).
- SRE Flight Academy (four tutorial modules), searchable glossary, causal chain view in the
  post-mortem (`causal_chain` on the post-mortem response).
- Red-alert floor sweep, running/panicking staff, cable data pulses, rack sparks and smoke,
  master EQ + limiter, datacenter ambience bed, pinch/pan touch gestures.
- `E2E_FRONTEND_PORT` / `E2E_BACKEND_PORT` to run the Playwright suite when 5173/8000 are taken.

### Removed

- `officeLayout.ts` and `sceneLayout.ts` (merged into `officeGeometry.ts`), the unused
  `playTypeTick` sound. (`VictoryScreen`, `LiquidationScreen` and the `combat-text-pop` keyframe were
  already gone from the tree.)

### Added (UX overhaul)

- Spring-damped office camera (zoom toward the cursor, drag inertia, keyboard control), minimap
  viewport frame, continuous day/night lighting and DEFCON-driven alert staging without a
  scene-wide SVG filter, staged rack transitions with a recovery sequence, and a roster-driven
  team that walks between reception, desks, the server room and the lounge.
- HUD feedback system: tweened meters, labelled spend chips, band-crossing flashes, smooth
  cooldown sweeps, animated incident/ledger/roster lists with a lifecycle track, a sliding dock
  tab indicator, per-tab activity badges and a single toast region.
- Interactive coach-mark tutorial with a guaranteed practice incident
  (`POST /api/tutorial/incident`), living title screen, screen transitions, staged post-match
  debrief, timed CAB decision UI, keyboard-driven log triage, and a rendered post-mortem.
- Shared `Modal` primitive (portal, exit animation, focus trap, Escape stack), `usePresence`,
  `TransitionList`, named z-index layers and motion tokens.
- Audio engine rewrite: one shared audio graph with effects/UI/music buses, menu and in-game
  music, a UI sound set, and alarms that only play while the game runs.
- In-game Motion setting (system, reduced, full).
- Backend pushes a fresh telemetry frame after every state-changing REST command, so the UI
  updates immediately while the game is paused; `GET /api/health` reports `version`;
  scenario objectives carry an optional `failed` flag.

- AI auditor interview screen inside the post-mortem (chat, verdict, apply once; the server still
  clamps every fine or credit), with a read-only `GET /api/audits/postmortem/{id}/interview`.
- Hiring through the UI now assigns the engineer to a service (with a specialty match hint), placed
  infrastructure nodes can be removed from the node inspector, `/live-ops` is truly read-only, and the
  scenario builder exposes the starting budget and technical debt (also carried in challenge codes).
- Translated names for every scenario, including the custom one.

### Fixed (UX overhaul)

- Clicking anywhere on an incident card opens its briefing (the global button press squash used to
  shrink the stretched click area to the title row).
- Custom scenario injections scheduled at tick 0 now fire; Docker stores the database on its
  persistent volume and finds `audits/` inside the container; the backend lint is clean again.
- Reduced motion no longer hides toasts and error messages (animations are switched off
  instead of being fast-forwarded to their transparent last frame).
- The "More" dock menu was clipped and unreachable; the Hotfix runbook was blocked in the UI
  during a feature freeze although the server allows it for an open incident; the metrics "SLA"
  line plotted throughput; the pause menu did not pause; the title screen swallowed Enter/Space
  and Tab was hijacked globally.
- Victory-dependent achievements (SOC-2 Type II, Chaos Survivor, Ransomware Repelled) could never
  unlock; a runbook on a healthy service degraded it; the Third-Party Outage scenario was
  unwinnable and could be "fixed" with a US$800 runbook.
- Telemetry frames now keep references of unchanged data, and the app no longer re-renders the
  whole tree on every tick.

### Added

- Server-side enforcement of mitigation runbook cooldowns (previously client-timer-only);
  `telemetry.mitigation_cooldowns` now exposes the authoritative cooldown state so the frontend
  can never desync from what the backend actually enforces.
- Rate limiting and a length bound on the AI Auditor interview endpoint's request body.
- Regression tests for the log-triage duplicate-line bug, the mitigation cooldown, the
  `db_read_replica` hazard multiplier, and `evaluate_victory` across every scenario.
- ESLint (frontend) and Ruff (backend) linting, wired into CI.
- Test coverage reporting (`pytest-cov`, `@vitest/coverage-v8`), wired into CI.
- `LICENSE` (MIT), `SECURITY.md`, `CHANGELOG.md`, issue/PR templates, and a Dependabot config.

### Fixed

- Log-triage mini-game could show a decoy line with text identical to the "root cause" line,
  making that round unwinnable by skill rather than a fair guess.
- Action-rejection toasts (mitigations, upgrades, staff hiring/rotation, infrastructure
  placement) always showed one hardcoded reason instead of the backend's actual error — most
  visibly, a cooldown rejection reading as "insufficient budget."
- Ambient "wandering" office NPCs effectively never moved: their patrol interval was torn down
  and recreated on almost every tick (due to `happiness` in its effect's dependency array) before
  its dwell time could ever elapse.
- Changing the UI language mid-session forced a full WebSocket reconnect (a stray `language`
  dependency on the socket connection effect).
- `apply_interview_verdict` could act against a `.verdict.json` file left over for an incident
  that no longer exists in the current session; it now 404s like its sibling endpoints.

## [2026-09-28] — Audit hardening pass

- Hardened the AI Auditor interview endpoint, mitigation cooldown enforcement, and the
  root-cause log-triage generator (see "Fixed" above — first landed in this pass).
- Added `player_id` format/length validation on session reset and career-record queries.

## [2026-09-27] — Visual overhaul and audit specs

- Tactical war-room visual overhaul: dark glassmorphism dock/panels, isometric office structural
  detailing, arcade-style combat text, unified camera/crisis control bar, refined red-alert
  lighting, a `DefconMeter` threat indicator, expanded Web Audio synth effects.
- Audit specifications in `audits/docs/` updated to match as-implemented state.

## [2026-09-26] — HUD and office visual polish

- Unified HUD dialog styling, animated meters, a day/night-reactive office backdrop, entrance
  transitions across every modal, and consistent empty states across panels.

## [2026-09-25] — Initial release

- First playable version: live crisis simulation engine, runbooks/tech tree, staffing/on-call,
  CAB governance dilemmas, compliance ledger and post-mortems, scripted scenarios and a custom
  scenario builder, achievements/cosmetics/career progression, guided onboarding, i18n, and an
  installable PWA shell.
