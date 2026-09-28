# Changelog

All notable changes to this project are documented here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dates are used instead of semantic
version numbers since this project hasn't tagged releases yet.

## [Unreleased]

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
