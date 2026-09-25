# Difficulty, Governance Reputation, and Session Resilience — Implementation Specification

**Document ID:** IZ-IMPL-06
**Classification:** Implementation Contract
**Status:** Implemented, additive only, non-breaking
**Integration baseline:** `backend/app/engine/simulator.py`, `backend/app/engine/dilemmas.py`, `backend/app/api/v1/sessions.py`, `backend/app/api/v1/career.py`, `frontend/src/components/modals/ScenarioSelectModal.tsx`, `frontend/src/components/modals/HallOfFameModal.tsx`, `frontend/src/components/modals/CABDilemmaModal.tsx`, `frontend/src/components/common/ReputationMeter.tsx`

---

## 1. System Objective

Four related gaps, all surfaced from direct play rather than a design review: every run played identically regardless of the player's appetite for risk (no difficulty axis); CAB dilemma choices (Document `03_GOVERNANCE_AND_COMPLIANCE_CONTROLS.md`) had only an instantaneous, single-tick effect and no memory across a run; a backend process restart silently discarded an in-progress game because `SimulationEngine.__init__` unconditionally called `_persist_bootstrap()`; and the Hall of Fame (`CareerRecord`) only ever queried the current browser's own `player_id`, even though `GET /api/career/records` already accepted a `scope` parameter server-side. This document covers all four, since the underlying engine changes are interdependent (the reputation-derived hazard multiplier stacks with the difficulty-derived one in the same failure-probability expression).

---

## 2. Difficulty Presets

`DIFFICULTY_PRESETS` in `simulator.py` is a fixed dict of three tiers, each carrying a starting budget and a hazard multiplier applied to every per-tick service failure roll:

| Preset | Starting budget | Hazard multiplier |
|---|---|---|
| `intern` | $320,000 | 0.7× |
| `standard` (default) | $250,000 | 1.0× (unchanged from the pre-existing behavior) |
| `chaos` | $180,000 | 1.4× |

`SimulationEngine.__init__` and `.reset()` both accept an optional `difficulty` argument; an unrecognized value silently falls back to `standard` rather than raising, matching the project's existing tolerant-input convention elsewhere in the engine. `POST /api/session/reset` forwards a new optional `difficulty` field on `SessionResetRequest` through unchanged. The frontend's `ScenarioSelectModal` gained a three-way segmented control above the scenario grid; the chosen difficulty applies uniformly to sandbox and every scripted scenario launch. `difficulty` is surfaced read-only on the telemetry payload (`TICK_BROADCAST.difficulty`) for display; it is **not** persisted as its own database column — see § 5 for why the resilience feature does not depend on it being durable.

---

## 3. Governance Reputation

A new persistent (per-run, not reset by anything except `.reset()`) float `self.reputation`, seeded at `50.0` on a 0–100 scale. Every `DilemmaChoice` in `backend/app/engine/dilemmas.py` now carries a `reputation_delta` alongside the pre-existing `budget_delta`/`tech_debt_delta`/`happiness_delta`; the "cut corners for cash" option on all four original dilemmas is a negative delta, the "do it properly" option a positive one. `_apply_dilemma_choice` applies and clamps it exactly like the other deltas and logs `reputation_delta`/`reputation_after` onto the `DILEMMA_RESOLVED` audit entry.

Reputation feeds back into the simulation two ways:

1. **Hazard multiplier.** In the same expression that already applies the scenario and (as of § 2) difficulty hazard multipliers: below `REPUTATION_CRISIS_THRESHOLD` (25), failure probability is multiplied by `1.15`; above `REPUTATION_TRUSTED_THRESHOLD` (75), by `0.9`. The in-fiction framing (see the code comment at the call site) is that a low-trust org's nervous, corner-cutting reactions make the next failure marginally more likely, while sustained good governance buys a small margin of slack — deliberately a *small* effect, not a difficulty-defining one.
2. **Gated callback dilemmas.** `dilemmas.build_dilemma(current_tick, reputation)` filters `DILEMMA_POOL` by each template's optional `min_reputation`/`max_reputation` bounds before picking one at random. Two new templates use this: `board_intervention` (`max_reputation: 24`, a probation/bailout offer that only appears once reputation has collapsed) and `executive_promotion_offer` (`min_reputation: 76`, a reward for sustained discipline). Both original bounds are inclusive; a template with neither bound is eligible at every reputation level, so the four original dilemmas are unaffected.

`ReputationMeter.tsx` (new) renders this as a fifth topbar gauge, hidden below the `hd` (1400px) breakpoint alongside the same-generation KPI-label responsiveness work, since topbar space at narrower widths is already contested. `CABDilemmaModal` gained a fourth `ImpactPill` showing each choice's `reputation_delta`.

---

## 4. Crash/Restart Session Resilience

**Problem.** `_persist_snapshot()` has, since before this document, periodically upserted the live `GameSession`/`Service`/`Incident`/`Engineer` rows to the database mid-run (used today for the audit ledger and Hall of Fame). Despite that, `SimulationEngine.__init__` unconditionally called `_persist_bootstrap()`, which deletes and recreates a fresh row for `self.session_id` — so every backend restart (a crash, a `--reload` code-change cycle, a deploy) silently wiped whatever `_persist_snapshot()` had just written, discarding the run.

**Fix.** A new `_try_restore_from_snapshot()` runs first in `__init__`; `_persist_bootstrap()` now only runs if it returns `False`. A snapshot is considered resumable only if a `GameSession` row exists for the exact `session_id`, its `status` is not `bankrupted`/`victory` (a finished game should never silently reappear), and `current_tick > 0` (a session that never advanced has nothing worth resuming — this also keeps every pre-existing test that creates a short-lived engine against a shared session id unaffected, since none of them advance a real tick). On success it restores `current_tick`, `budget`, `tech_debt`, `user_happiness`, `sla_percentage`, `status`, `prestige_points`, the full `services` list, and the full `engineers` roster, and logs a new `SYSTEM_RESTORED` audit entry.

**Disclosed limitation.** `cumulative_sla_points` is not itself persisted; it is re-seeded from the restored instantaneous `sla_percentage` as the closest safe approximation rather than fabricating a false historical average. More significantly, **any incident that was actively open at the moment of the restart is not resumed** — its owning service is restored to `healthy` instead. The reason is that `Incident`'s database columns do not capture every runtime-only field a live incident dict carries (notably the log-triage `log_lines`/`root_cause_line_id`, generated once at creation and never regenerated, Document `04_RUNBOOK_CATALOG_AND_MITIGATION_MATRIX.md` § log triage), so reconstructing one from the DB row alone risks handing the frontend a broken incident that crashes the triage terminal. Dropping it cleanly was judged safer than a partial reconstruction; a full fix would mean widening the `Incident` table to carry those fields, which is out of scope here. Infrastructure nodes, purchased upgrades, and in-flight CAB dilemmas are likewise not restored, for the same reason (not captured by `_persist_snapshot()` at all) — a materially larger persistence project than this fix.

---

## 5. Global Leaderboard

`GET /api/career/records` already accepted `scope` (defaulting to `"mine"`, which additionally requires `player_id`); any other value returns every `CareerRecord` server-wide, unfiltered, ordered by `days_survived` descending, capped at 50 — this was already correct and required no backend change. `api.ts` gained `getGlobalCareerRecords()` calling it with `scope=global`. `HallOfFameModal` gained a two-way "My Records / Global" toggle; the global view additionally labels each row with a short, non-identifying prefix of the row's `player_id` (`Operator #<first 6 chars>`) so a shared board still reads as attributable without exposing the full browser-generated id.

---

## 6. Testing

`backend/tests/test_engine_features.py` (new) covers: difficulty preset application on both `__init__` and `.reset()` (including the unknown-difficulty fallback), reputation shifting and clamping on dilemma resolution, reputation-gated dilemma filtering never leaking a callback dilemma outside its threshold, and the restart-resilience path both restoring a genuine in-progress session and correctly declining to "restore" a fresh or terminal one. Every test in this file deliberately reuses the same production session id (`incidentzero-alpha`) that `test_api_smoke.py`'s `TestClient`-driven tests also use rather than a randomly generated one — `Service.id` is a bare, non-composite primary key, so two different session ids bootstrapping their own hardcoded `srv-auth` row in the same database file collide the moment they share one, which they do once another test module has already run in the same pytest process. Each test resets that shared row at its own start instead.
