# Achievements, Progression & Career Governance — Implementation Specification

**Document ID:** IZ-COMM-04
**Classification:** Implementation Contract — Commercial Pillar 4
**Status:** Implemented, additive only, non-breaking
**Integration baseline:** `backend/app/engine/simulator.py`, `backend/app/models/session.py`

---

## 1. System Objective

A 12-entry achievement catalog evaluated continuously against real, already-tracked engine state (no new gameplay systems invented solely to make an achievement checkable), paying out prestige points redeemable for purely cosmetic office props — a progression layer with zero effect on simulation balance, appropriate for a commercial release's retention loop.

## 2. Achievement Catalog

`backend/app/engine/achievements.py` defines `ACHIEVEMENT_CATALOG`, 12 entries of `{id, name, description, prestige_points}`, each paired with a predicate function keyed by `id` in `ACHIEVEMENT_CHECKS: Dict[str, Callable[[SimulationEngine], bool]]`:

| id | Name | Unlock Condition | Prestige |
|---|---|---|---|
| `zero_trust_architect` | Zero Trust Architect | `multi_az_clusters` upgrade purchased | 50 |
| `chaos_survivor` | Chaos Survivor | `chaos_engineering_drill` scenario completed with `compliant: true` | 75 |
| `soc2_type_ii_certified` | SOC-2 Type II Certified | Session status reaches `victory` | 150 |
| `budget_master` | Budget Master | `current_tick >= 200` and `budget >= 200000` | 60 |
| `night_shift_hero` | Night Shift Hero | An incident acknowledged while the office-clock hour (`tick % 24`) is `>= 22` or `< 5` | 40 |
| `zero_downtime_week` | Zero Downtime Week | `quiet_ticks >= 168` (7 in-game days with no active incident) | 80 |
| `debt_free` | Debt Free | `tech_debt == 0` | 45 |
| `first_response` | First Response | An incident acknowledged with `mtta_seconds <= 1` | 30 |
| `ransomware_repelled` | Ransomware Repelled | `ransomware_infiltration` scenario completed with `compliant: true` | 100 |
| `full_roster` | Full Roster | 3 or more hired engineers | 35 |
| `century_club` | Century Club | `current_tick >= 100` | 20 |
| `emergency_room` | Emergency Room | 10 or more incidents resolved across the session (cumulative counter, not a live count) | 55 |

This is the complete, exhaustive set for this release.

## 3. Tracking and Persistence

`SimulationEngine` gains `self.achievements_unlocked: Set[str]`, `self.prestige_points: int`, and a cumulative `self._resolved_incident_count: int` (incremented in `apply_mitigation` wherever `resolved_count` is currently computed — additive, the existing per-call `resolved_count` local variable is unchanged, only added onto the new cumulative counter afterward). A new tick step, `_evaluate_achievements()`, appended to `_update_simulation_tick` after `_evaluate_cab_dilemma()`, iterates every not-yet-unlocked catalog id, runs its predicate, and on a true result: adds the id to `achievements_unlocked`, adds its `prestige_points`, persists a new `Achievement` row, logs `ACHIEVEMENT_UNLOCKED`, and queues an out-of-band `{"type": "ACHIEVEMENT_UNLOCKED", ...}` broadcast frame using the existing `_pending_broadcasts` mechanism.

`backend/app/models/achievement.py`:

```python
class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    achievement_key = Column(String(50), nullable=False)
    unlocked_at_tick = Column(Integer, nullable=False)
```

`GameSession` gains one additive column, `prestige_points = Column(Integer, nullable=False, default=0)`.

## 4. Cosmetic Reward System

`COSMETIC_CATALOG` (3 entries): `golden_coffee_machine` (200 pts), `executive_leather_sofa` (150 pts), `marble_reception_desk` (300 pts) — purely visual reskins of existing `EspressoMachine`/`Sofa`/`ReceptionDesk` props, selected client-side once unlocked. `backend/app/models/cosmetic.py` adds `unlocked_cosmetics(id, session_id, cosmetic_id, unlocked_at_tick)`. `SimulationEngine.unlock_cosmetic(cosmetic_id)` deducts `prestige_points` (never real budget — cosmetics cannot be bought with cash, preserving the economic simulation's integrity), persists, and logs `COSMETIC_UNLOCKED`.

## 5. REST Endpoints

`GET /api/achievements/catalog`, `GET /api/cosmetics/catalog`, `POST /api/cosmetics/{id}/unlock`. `TICK_BROADCAST` gains `achievements_unlocked: string[]`, `prestige_points: int`, `unlocked_cosmetics: string[]`.

## 6. Frontend

An achievement unlock renders as a distinct celebratory toast (new `AchievementToast.tsx`, gold-accented, reusing the floating-text queue pattern but with its own longer-lived, larger presentation) triggered off the `ACHIEVEMENT_UNLOCKED` WebSocket frame. A new `AchievementsPanel.tsx` dock tab lists all 12 with locked/unlocked state and a prestige-point balance; a cosmetics sub-section lets the player spend points, and unlocked cosmetics swap the corresponding office prop's visual variant in `IsometricOffice.tsx`.
