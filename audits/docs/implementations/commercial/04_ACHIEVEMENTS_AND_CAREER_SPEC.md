# Achievements, Progression & Career Governance — Implementation Specification

**Document ID:** IZ-COMM-04  
**Classification:** Technical Specification / Career, Achievements & Player Progression  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `backend/app/engine/achievements.py`, `backend/app/api/v1/achievements.py`, `backend/app/models/career.py`, `backend/app/api/v1/career.py`, `backend/app/engine/simulator.py` (`_evaluate_achievements`, `_evaluate_session_status`), `frontend/src/components/modals/PostMatchDebriefModal.tsx`, `frontend/src/utils/debriefTimeline.ts`, `frontend/src/components/modals/HallOfFameModal.tsx`

---

## 1. System Objective

A multi-tiered retention and progression system tracking player career records, achievement unlocks, operational rank advancement, and dynamic challenge recommendations across sessions:
1. **Achievement Catalog:** Exactly 12 achievements continuously checked against authoritative engine state.
2. **Career Record Persistence:** Durable archival of every completed or liquidated match in the `CareerRecord` database model.
3. **Operational Ranks:** 5 derived career titles reflecting accumulated prestige and unlocked achievements.
4. **Post-Match Debrief:** Rich debriefing experience via `PostMatchDebriefModal` evaluating performance, personal bests, and unlocks.
5. **Next Challenge Recommender:** Backend-driven recommendation engine suggesting the next optimal milestone.

---

## 2. Verified Achievement Catalog

The engine evaluates `ACHIEVEMENT_CHECKS` (`GET /api/achievements/catalog` serves the catalog) at the end of every non-terminal tick **and on the terminal tick**. Unlocked achievements award one-time prestige, are persisted per player, emit an `ACHIEVEMENT_UNLOCKED` audit event and queue an `ACHIEVEMENT_UNLOCKED` WebSocket frame that raises the toast:

| ID | Name | Unlock Condition | Prestige |
|---|---|---|---|
| `zero_trust_architect` | Zero Trust Architect | `multi_az_clusters` upgrade purchased | 50 |
| `chaos_survivor` | Chaos Survivor | `chaos_engineering_drill` scenario completed with `compliant: true` (zero regulatory breach flags) | 75 |
| `soc2_type_ii_certified` | SOC-2 Type II Certified | Session status reaches `victory` (sandbox or scenario) | 150 |
| `budget_master` | Budget Master | `current_tick >= 200` and `budget >= 200000.0` | 60 |
| `night_shift_hero` | Night Shift Hero | Incident acknowledged during night shift (`tick % 24 >= 22` or `< 5`) | 40 |
| `zero_downtime_week` | Zero Downtime Week | `quiet_ticks >= 168` (168 consecutive ticks, 7 in-game days, with no active incident) | 80 |
| `debt_free` | Debt Free | `tech_debt == 0` | 45 |
| `first_response` | First Response | Incident acknowledged within 1 tick of creation (`mtta_seconds <= 1`) | 30 |
| `ransomware_repelled` | Ransomware Repelled | `ransomware_infiltration` scenario completed with `compliant: true` | 100 |
| `full_roster` | Full Roster | 3 or more hired engineers | 35 |
| `century_club` | Century Club | `current_tick >= 100` | 20 |
| `emergency_room` | Emergency Room | 10 or more incidents resolved across the session | 55 |

**Terminal-tick evaluation.** The run-defining achievements (`soc2_type_ii_certified`, `chaos_survivor`, `ransomware_repelled`) only become true on the very tick that ends the run. Each terminal branch of `_evaluate_session_status()` (bankruptcy, scenario conclusion, sandbox survival) therefore calls `_evaluate_achievements()` **before** writing the `CareerRecord`, so the record's `prestige_earned` counts what the final tick unlocked, and `_update_simulation_tick()` evaluates once more before returning on a terminal tick (idempotent). Before this was fixed, the early return on a terminal tick skipped evaluation and those three achievements could never unlock.

---

## 3. Career Record Data Model (`CareerRecord`)

Every concluded session (via victory or bankruptcy/defeat) commits one row to `career_records` (columns added by Alembic revisions `a7d8e9f0b1c2` and `f3c9a1d7e2b4`; the table is never wiped by a session reset). Its API shape is `_serialize_record`, which also parses `scenario_outcome_json` into `scenario_outcome` and `objectives_json` into `objectives`:

```python
class CareerRecord(Base):
    __tablename__ = "career_records"

    id = Column(String(36), primary_key=True)
    player_id = Column(String(64), nullable=False, default="local-player")
    scenario_id = Column(String(50), nullable=True)
    difficulty = Column(String(20), nullable=True, default="standard")
    outcome = Column(String(20), nullable=False) # "victory", "bankrupted", "scenario_defeat"
    days_survived = Column(Integer, nullable=False)
    final_sla_percentage = Column(Numeric(5, 2), nullable=False)
    final_budget = Column(Numeric(12, 2), nullable=False)
    prestige_earned = Column(Integer, nullable=False, default=0)
    recorded_at = Column(DateTime, default=datetime.utcnow)
    recovered_from_snapshot = Column(Boolean, nullable=False, default=False)
    final_tech_debt = Column(Integer, nullable=True)
    final_reputation = Column(Numeric(5, 2), nullable=True)
    incidents_total = Column(Integer, nullable=True)
    incidents_resolved = Column(Integer, nullable=True)
    scenario_outcome_json = Column(Text, nullable=True)
    objectives_json = Column(Text, nullable=True)
```

---

## 4. Operational Rank Hierarchy

Operational rank is derived dynamically in `_calculate_operator_rank()` from lifetime prestige (the sum of the prestige of the player's unlocked achievements) and the unlocked-achievement count; either condition is enough:

| Rank | Required Prestige / Achievements |
|---|---|
| **Junior On-Call Engineer** | Baseline rank (0 prestige) |
| **Site Reliability Engineer** | $\ge 50$ Prestige OR $\ge 2$ Achievements |
| **Senior Chaos Operator** | $\ge 150$ Prestige OR $\ge 4$ Achievements |
| **Principal Infrastructure Architect** | $\ge 300$ Prestige OR $\ge 7$ Achievements |
| **VP of Reliability & Governance** | $\ge 500$ Prestige OR $\ge 10$ Achievements |

---

## 5. Next Challenge Recommendation Engine (`/api/career/summary`)

`GET /api/career/summary?player_id=...` returns `total_runs`, `victories`, `bankruptcies`, `defeats`, `total_incidents_resolved`, `lifetime_prestige`, `operator_rank` / `operator_rank_key`, `best_runs` (best record for `sandbox`, `black_friday_rush`, `chaos_engineering_drill` and `ransomware_infiltration`, scored by victory, difficulty, days survived, SLA and budget) and `recommended_challenge`. The backend is the single authority recommending the player's next challenge (`_derive_next_challenge`), evaluated in this order:
1. **First-time player (no records):** Sandbox on `intern` difficulty ("First Operational Shift").
2. **Unbeaten Sandbox:** the 720-tick Sandbox on `standard` difficulty ("Monthly Audit Defense").
3. **Unbeaten scenarios:** progressively `black_friday_rush` $\to$ `chaos_engineering_drill` $\to$ `ransomware_infiltration` (the three newer scenarios, `ddos_global`, `deployment_rollback` and `third_party_outage`, are not part of the recommendation chain).
4. **Chaos Difficulty Step-Up:** if those are beaten but no victory exists on `chaos` difficulty, recommends the Chaos Engineering Drill on `chaos` ("Chaos Difficulty Mastery", +40% hazard, tighter runway).
5. **Achievement Pursuit:** the first locked achievement in catalog order.
6. **Mastery:** with every achievement unlocked, "SRE Grandmaster" (Ransomware under `chaos` difficulty).

`GET /api/career/records` lists up to 50 runs filtered by `player_id`/`scope` (`mine` filters by player; any other scope returns everyone), `scenario_id` (`sandbox` selects runs with no scenario) and `difficulty`, ordered by `recorded_at` (default), `sla`, or days survived.

---

## 6. Hall of Fame & Match Debrief

- **`PostMatchDebriefModal.tsx`:** Primary post-match screen mounted on session termination. Renders the outcome stamp, duration, SLA, final cash runway, tech debt, a grade derived from the final SLA, the scenario's objectives (with their `failed`/`done` state), personal-best comparison (against prior runs with matching scenario and difficulty), prestige gained, achievements unlocked during the run, the recommended next challenge and play-again / Hall of Fame actions.
- **Staged reveal (`utils/debriefTimeline.ts`):** the debrief is a timed sequence rather than a static page. A pure planner (`planDebrief`) decides when each stage starts: backdrop, outcome stamp, metric tiles (staggered, with count-up numbers), grade, objectives (if any), personal record, prestige, achievements and finally the action buttons. The whole sequence is squeezed (never stretched) to at most `MAX_DEBRIEF_MS = 3000` ms, any key or click skips straight to the final state, and with reduced motion everything appears at once. The planner has no timers of its own and is unit-tested; the component only schedules its steps. Because the terminal-tick achievement evaluation (§ 2) runs before the career record is written, the achievements and prestige shown here include those unlocked by the final tick.
- **`HallOfFameModal.tsx`:** Displays match history filtered by player (`scope="mine"`) or server-wide (`scope="global"`), with scenario and difficulty filters. Compares personal bests locally without relying on external online cloud services.
