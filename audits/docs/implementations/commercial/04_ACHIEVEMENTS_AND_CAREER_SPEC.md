# Achievements, Progression & Career Governance — Implementation Specification

**Document ID:** IZ-COMM-04  
**Classification:** Technical Specification / Career, Achievements & Player Progression  
**Status:** Implementado  
**Source of Truth:** `backend/app/engine/achievements.py`, `backend/app/models/career.py`, `backend/app/api/v1/career.py`, `frontend/src/components/modals/PostMatchDebriefModal.tsx`, `frontend/src/components/modals/HallOfFameModal.tsx`

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

The engine evaluates `ACHIEVEMENT_CHECKS` on each tick. Unlocked achievements award one-time prestige and emit `ACHIEVEMENT_UNLOCKED` events:

| ID | Name | Unlock Condition | Prestige |
|---|---|---|---|
| `zero_trust_architect` | Zero Trust Architect | `multi_az_clusters` upgrade purchased | 50 |
| `chaos_survivor` | Chaos Survivor | `chaos_engineering_drill` scenario completed with `compliant: true` | 75 |
| `soc2_type_ii_certified` | SOC-2 Type II Certified | Session status reaches `victory` (sandbox or scenario) | 150 |
| `budget_master` | Budget Master | `current_tick >= 200` and `budget >= 200000.0` | 60 |
| `night_shift_hero` | Night Shift Hero | Incident acknowledged during night shift (`tick % 24 >= 22` or `< 5`) | 40 |
| `zero_downtime_week` | Zero Downtime Week | `quiet_ticks >= 168` (7 in-game days with no active incident) | 80 |
| `debt_free` | Debt Free | `tech_debt == 0` | 45 |
| `first_response` | First Response | Incident acknowledged within 1 tick of creation (`mtta_seconds <= 1`) | 30 |
| `ransomware_repelled` | Ransomware Repelled | `ransomware_infiltration` scenario completed with `compliant: true` | 100 |
| `full_roster` | Full Roster | 3 or more hired engineers | 35 |
| `century_club` | Century Club | `current_tick >= 100` | 20 |
| `emergency_room` | Emergency Room | 10 or more incidents resolved across the session | 55 |

---

## 3. Career Record Data Model (`CareerRecord`)

Every concluded session (via victory or bankruptcy/defeat) commits an immutable row to `career_records`:

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

Operational rank is derived dynamically in `_calculate_operator_rank()` from lifetime prestige and achievement counts:

| Rank | Required Prestige / Achievements |
|---|---|
| **Junior On-Call Engineer** | Baseline rank (0 prestige) |
| **Site Reliability Engineer** | $\ge 50$ Prestige OR $\ge 2$ Achievements |
| **Senior Chaos Operator** | $\ge 150$ Prestige OR $\ge 4$ Achievements |
| **Principal Infrastructure Architect** | $\ge 300$ Prestige OR $\ge 7$ Achievements |
| **VP of Reliability & Governance** | $\ge 500$ Prestige OR $\ge 10$ Achievements |

---

## 5. Next Challenge Recommendation Engine (`/api/career/summary`)

The backend functions as the single authority recommending the player's next challenge (`_derive_next_challenge`):
1. **First-time player:** Recommends Sandbox on `intern` difficulty ("First Operational Shift").
2. **Unbeaten Sandbox:** Recommends completing 720-tick Sandbox on `standard` difficulty ("Monthly Audit Defense").
3. **Unbeaten Scenarios:** Progressively recommends `black_friday_rush` $\to$ `chaos_engineering_drill` $\to$ `ransomware_infiltration`.
4. **Chaos Difficulty Step-Up:** If all scenarios are beaten on standard, recommends mastering `chaos` difficulty (+40% hazard).
5. **Achievement Pursuit:** Recommends remaining locked achievements.
6. **Mastery:** Recommends "SRE Grandmaster" (Ransomware under Chaos difficulty).

---

## 6. Hall of Fame & Match Debrief

- **`PostMatchDebriefModal.tsx`:** Primary post-match screen mounted on session termination. Renders scenario outcome, duration, SLA, final cash runway, tech debt, objectives completed, personal best comparisons (against prior runs with matching scenario and difficulty), and prestige gains.
- **`HallOfFameModal.tsx`:** Displays match history filtered by player (`scope="mine"`) or server-wide (`scope="global"`), with scenario and difficulty filters. Compares personal bests locally without relying on external online cloud services.
