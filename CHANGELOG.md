# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dates are used instead of semantic
version numbers since this project hasn't tagged releases yet.

## [Unreleased]

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
