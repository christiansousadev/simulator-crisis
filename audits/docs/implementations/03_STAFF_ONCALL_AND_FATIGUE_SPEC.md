# Staff, On-Call, and Fatigue — Implementation Specification

**Document ID:** IZ-IMPL-03  
**Classification:** Implementation Contract / Technical Architecture Specification  
**Status:** Implementado e verificado contra o código (Outubro 2026); ver § 4.3.2 para o fluxo de contratação com atribuição de serviço  
**Last Updated:** Outubro 2026  
**Integration baseline:** `backend/app/engine/simulator.py`, `backend/app/engine/staff.py`, `backend/app/engine/formulas.py`, `backend/app/models/engineer.py`, `backend/app/api/v1/staff.py`, `frontend/src/components/dock/EngineerRosterPanel.tsx`, `frontend/src/components/office/{OfficeWorker,PathfindingEmployee,EngineerDesk,RosterDirector,RosterWalkers}.tsx`, `frontend/src/components/office/{rosterPlan,rosterStage,waypointGraph,engineerMood}.ts`

---

## 1. System Objective

Replace the implicit, undifferentiated notion of "an operator acts on the system" with a roster of individually simulated **engineers**, each with independent stress and stamina state, a core competency mapping to the existing service topology, and an on-call/off-duty rotation.

Staff state directly modulates simulation behavior:
1. **Hazard Discount:** High specialist quality provides up to a 35% discount on cascading failure probability (`formulas.specialist_hazard_discount`).
2. **Dynamic Burn Multiplier:** Replaces binary MTTR penalties with a continuous curve from 0.65× (high quality) up to 1.30× (mismatched/stressed) via `formulas.specialist_burn_multiplier`.
3. **Investigation & Mitigation Boosts:** Quality boosts runbook effectiveness and triage accuracy.
4. **Visual Synchronization:** The office scene is roster-driven: desks stay vacant until someone is hired, and hired engineers are walking sprites whose position and mood reflect real runtime state (at desk, at the rack during an incident, in the lounge while resting or off duty, stressed, tired).

---

## 2. Human Resource Mechanics

### 2.1 Engineer Attributes

Each engineer is represented on `SimulationEngine` and persisted to SQLite via `Engineer` models:

| Field | Type | Range | Description |
|---|---|---|---|
| `id` | string | — | `f"eng-{uuid.uuid4().hex[:6]}"` (`staff.build_engineer`). |
| `session_id` | string | — | Standard session-scoping field. |
| `name` | string | — | Drawn from fixed 12-name pool (`ENGINEER_NAME_POOL` in `staff.py`). |
| `assigned_service_id` | string \| `null` | — | Assigned service from `CANONICAL_SERVICE_IDS`, or `null` (standby/reserve). |
| `core_competency` | string enum | `"auth"` \| `"payments"` \| `"gateway"` \| `"db"` | Service specialization label matching `staff.SERVICE_COMPETENCY_MAP`; the hireable set is `staff.CORE_COMPETENCIES`. |
| `stress_index` | number | `0`–`100` | Primary fatigue metric (starts at `0`; compounding gains are fractional and clamped with `clamp_percentage`). |
| `stamina` | number | `0`–`100` | Energy/endurance capacity metric (starts at `100`). |
| `on_call_status` | string enum | `"on_duty"` \| `"off_duty"` \| `"resting"` | Shift rotation state. |
| `hired_at_tick` | integer | — | Provenance tick count. |

### 2.2 Compounding Fatigue and Specialist Quality Formulas

Implemented in `backend/app/engine/formulas.py`:

```python
STRESS_BASE_GAIN_PER_TICK = 1.5
STRESS_COMPOUND_EXPONENT = 1.15
OFF_DUTY_STRESS_RECOVERY_PER_TICK = 2.0
OFF_DUTY_STAMINA_RECOVERY_PER_TICK = 3.0
ON_DUTY_STAMINA_DRAIN_PER_TICK = 0.5
HIRING_COST = 15000.0
STRESS_MTTR_DOUBLE_THRESHOLD = 75   # legacy: defined but no longer read by the engine
SPECIALIST_MISMATCH_BASE_QUALITY = 0.45
SPECIALIST_QUALITY_STRESS_EROSION = 0.70
SPECIALIST_QUALITY_FLOOR = 0.30
TRIAGE_WRONG_ATTEMPT_STRESS = 3.0   # see commercial/02 (Log Triage)
```

`STRESS_BASE_GAIN_PER_TICK` is the base of the per-alarm gain below (it is not a flat per-tick gain). `STRESS_MTTR_DOUBLE_THRESHOLD` belonged to the original binary "stress above 75 doubles MTTR burn" rule that the continuous burn multiplier replaced; the constant remains in `formulas.py` but nothing reads it.

1. **Specialist Quality Score (`formulas.specialist_quality`):**
   $$
   Quality = \begin{cases}
   0.0 & \text{not assigned or not on duty} \\
   \text{round}\left(Base \times \max\!\left(0.30,\; 1.0 - \dfrac{stress}{100.0} \times 0.70\right),\; 3\right) & \text{on duty}
   \end{cases}
   $$
   Where $Base = 1.0$ if core competency matches the service, else $0.45$.

2. **Specialist Burn Multiplier (`formulas.specialist_burn_multiplier`):**
   Continuous scaling replacing the old binary threshold:
   $$
   M_{burn} = \begin{cases} 1.0 & Quality \le 0.0 \\ \max(0.65,\; 1.3 - 0.65 \times Quality) & Quality > 0.0 \end{cases}
   $$
   Competency-matched engineers at low stress reduce incident burn by 35% ($0.65\times$), while mismatched or heavily stressed engineers run hotter than baseline ($1.30\times$).

3. **Hazard Discount on Service Outage (`formulas.specialist_hazard_discount`):**
   $$
   Discount_{hazard} = 1.0 - 0.35 \times Quality
   $$
   Cuts service failure probability by up to 35% when covered by a rested specialist.

4. **Compounding Stress Gain (`formulas.stress_gain_for_unacked_alarm`):**
   $$
   \Delta Stress = 1.5 \times SeverityWeight \times \left(1 + \frac{stress}{100}\right)^{1.15} \times \begin{cases} 0.7 & \text{competency matched} \\ 1.3 & \text{mismatched} \end{cases}
   $$
   `SeverityWeight` is `2.0` for `P1_CRITICAL` and `1.0` for every other severity. The `ergonomic_chairs` upgrade multiplies the final gain by `0.80` (Document 01). The gain is applied once per tick per *unacknowledged* (`active`) incident on the engineer's assigned service; an acknowledged incident stops adding stress.

### 2.3 On-Call Shift Rotation

```python
def _progress_staff_fatigue(self):
    """ADVANCE PER-ENGINEER STRESS AND STAMINA EACH TICK BASED ON DUTY STATUS AND ALARM STATE"""
    for eng in self.engineers:
        if eng["on_call_status"] in ("off_duty", "resting"):
            eng["stress_index"] = clamp_percentage(eng["stress_index"] - OFF_DUTY_STRESS_RECOVERY_PER_TICK)
            eng["stamina"] = clamp_percentage(eng["stamina"] + OFF_DUTY_STAMINA_RECOVERY_PER_TICK)
            if eng["on_call_status"] == "resting":
                eng["on_call_status"] = "off_duty"   # exactly one resting tick, then fully off duty
            continue
        eng["stamina"] = clamp_percentage(eng["stamina"] - ON_DUTY_STAMINA_DRAIN_PER_TICK)
        # for each active (unacknowledged) incident on the assigned service:
        #   gain = stress_gain_for_unacked_alarm(stress, severity)
        #         * specialist_stress_gain_multiplier(matched)   (0.7 / 1.3)
        #         * (0.80 if "ergonomic_chairs" owned)
        #   stress = clamp_percentage(stress + gain)
```

**Duty-state machine.** `rotate_shift` moves `on_duty` -> `resting`. The next tick's `_progress_staff_fatigue` applies the recovery and moves `resting` -> `off_duty`, so `resting` lasts exactly **one tick**. An `off_duty` engineer then keeps recovering (-2.0 stress, +3.0 stamina per tick) and **stays off duty until the player rotates them back** (allowed only at `stamina >= 40`). Off-duty and resting engineers provide no coverage (`specialist_quality` is `0.0`).

This step runs inside `_update_simulation_tick` after `_evaluate_feature_freeze()` and before `_progress_pre_alerts()`/`_evaluate_cab_dilemma()`; like those steps it is skipped on a terminal tick.

The literal "reduces stress by 2.0 per tick off-duty" requirement is satisfied exactly by `OFF_DUTY_STRESS_RECOVERY_PER_TICK = 2.0`.

### 2.4 Competency Match and Assignment

`core_competency` is matched against service identity via a fixed lookup table (not a database join, consistent with the project's existing preference for small fixed dictionaries over relational joins where the topology itself is fixed — the five canonical services are `simulator.CANONICAL_SERVICE_IDS`):

```python
SERVICE_COMPETENCY_MAP = {
    "srv-auth": "auth",
    "srv-payment": "payments",
    "srv-api-gw": "gateway",
    "srv-search": "gateway",   # nearest competency match; the topology has no dedicated search specialization
    "srv-notify": "gateway",
}
```

An engineer may be `assigned_service_id`-bound to any service regardless of competency match — competency mismatch is not blocked, but is actively penalized across multiple simulation mechanics:
1. **Stress Compounding (`formulas.specialist_stress_gain_multiplier`):** Unacknowledged alarms on the assigned service inflict a `1.3×` stress gain multiplier when mismatched, compared to `0.7×` when core competency matches.
2. **Specialist Quality Erosion (`formulas.specialist_quality`):** Base quality drops from `1.0` to `0.45` (`SPECIALIST_MISMATCH_BASE_QUALITY`), directly curbing the engineer's coverage score.
3. **Burn & MTTR Penalty (`formulas.specialist_burn_multiplier`):** Reduced quality increases effective MTTR and per-incident surcharges up to `1.30×` (compared to `0.65×` for rested matched specialists).
4. **Forfeited Hazard Discount (`formulas.specialist_hazard_discount`):** Mismatched engineers cannot provide the full 35% failure probability discount on the assigned service.
5. **Mitigation Effectiveness (`formulas.mitigation_effectiveness`):** Runbook resolution bonus is scaled down proportionally to the reduced specialist quality.

---

## 3. Data & API Contract

### 3.1 SQL Schema — `engineers`

File: `backend/app/models/engineer.py` (the table is created by the initial Alembic revision, `8907816f55ab_initial_schema.py`; later revisions never altered it):

```python
from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base


class Engineer(Base):
    """REPRESENTS AN INDIVIDUAL ON-CALL ENGINEER WITH STRESS AND STAMINA STATE"""

    __tablename__ = "engineers"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    assigned_service_id = Column(String(36), ForeignKey("services.id", ondelete="SET NULL"), nullable=True)
    core_competency = Column(String(20), nullable=False)
    stress_level = Column(Integer, nullable=False, default=0)
    stamina = Column(Integer, nullable=False, default=100)
    on_call_status = Column(String(20), nullable=False, default="on_duty")
    hired_at_tick = Column(Integer, nullable=False)

    session = relationship("GameSession", back_populates="engineers")
```

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `VARCHAR(36)` PK | No | `eng-` prefix, per § 2.1. |
| `session_id` | `VARCHAR(36)` FK CASCADE | No | Standard scoping. |
| `name` | `VARCHAR(100)` | No | From the fixed name pool. |
| `assigned_service_id` | `VARCHAR(36)` FK, `ON DELETE SET NULL` | Yes | Deliberately `SET NULL` rather than `CASCADE` — deleting a `Service` row (which never actually happens in current gameplay; the five-service topology is fixed for the life of a session, Document 01) should orphan the engineer to bench status rather than delete the engineer record, since an engineer's employment is not conceptually dependent on a specific service's row existing. |
| `core_competency` | `VARCHAR(20)` | No | One of `auth`/`payments`/`gateway`/`db`. `db` is included in the enum for forward compatibility even though no current service maps to it in `SERVICE_COMPETENCY_MAP` — reserved for a future dedicated database-tier service. |
| `stress_level` | `INTEGER` | No, default `0` | The column is named `stress_level` while the in-memory dict field, the broadcast payload and the formula parameters are `stress_index`. The divergence is intentional and documented here: `_persist_engineer` (write) and the snapshot restore (read) are the only translation points between the two names. Because the column is an integer, a persisted stress value is rounded; the live in-memory value is fractional. |
| `stamina` | `INTEGER` | No, default `100` | |
| `on_call_status` | `VARCHAR(20)` | No, default `"on_duty"` | One of `on_duty`/`off_duty`/`resting`. |
| `hired_at_tick` | `INTEGER` | No | |

`GameSession` carries the matching `engineers = relationship("Engineer", back_populates="session", cascade="all, delete-orphan")` and `models/__init__.py` exports the model. The roster is rebuilt from this table by `_try_restore_from_snapshot()` after a restart (the DB column `stress_level` is mapped back to the in-memory `stress_index`).

### 3.2 In-Memory Engine State

```python
# added to SimulationEngine.__init__
self.engineers: List[Dict[str, Any]] = []  # empty roster by default; hiring is an explicit player action, not auto-seeded
```

No default engineers are auto-created on session bootstrap. This is a deliberate design choice preserving the current baseline's default playability: a session with zero hired engineers behaves identically to the present-day game (the `VP_OF_INFRA` actor continues to be the attribution for all `INCIDENT_ACKNOWLEDGED`/`RUNBOOK_EXECUTED` audit events, unchanged from Document 03 § 1's existing actor taxonomy), and the fatigue mechanics in § 2 are strictly opt-in additive complexity a player unlocks by hiring staff.

### 3.3 REST Endpoints

File: `backend/app/api/v1/staff.py`:

```python
@router.post("/api/staff/hire")
async def hire_engineer(payload: HireEngineerRequest, request: Request) -> Dict[str, Any]:
    """HIRE A NEW ENGINEER ONTO THE ON-CALL ROSTER"""
    engine = request.app.state.engine
    result = engine.hire_engineer(payload.core_competency, payload.assigned_service_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Hiring failed"))
    return result


@router.post("/api/staff/{engineer_id}/rotate-shift")
async def rotate_shift(engineer_id: str, request: Request) -> Dict[str, Any]:
    """ROTATE AN ENGINEER'S ON-CALL DUTY STATUS"""
    engine = request.app.state.engine
    result = engine.rotate_shift(engineer_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Engineer not found"))
    return result
```

`HireEngineerRequest` (`backend/app/schemas/staff.py`): `{"core_competency": Literal["auth","payments","gateway","db"], "assigned_service_id": Optional[str] = None}`. An unrecognized competency is rejected at the schema layer (HTTP 422) before the engine check runs.

```python
HIRING_COST = 15000.0  # flat one-time signing cost, in formulas.py

def hire_engineer(self, core_competency: str, assigned_service_id: Optional[str]) -> Dict[str, Any]:
    """HIRE A NEW ENGINEER, DEDUCTING A FLAT SIGNING COST FROM RUNWAY BUDGET"""
    if self.budget < formulas.HIRING_COST:
        return {"success": False, "error": "Insufficient budget runway"}
    if core_competency not in staff.CORE_COMPETENCIES:
        return {"success": False, "error": "Unknown core competency"}
    if assigned_service_id is not None and not any(s["id"] == assigned_service_id for s in self.services):
        return {"success": False, "error": "Assigned service not found"}
    engineer = staff.build_engineer(self.session_id, core_competency, assigned_service_id, self.current_tick)
    self.engineers.append(engineer)
    self._persist_engineer(engineer)
    self._apply_financial_event(
        category="hiring_cost",
        amount=-formulas.HIRING_COST,
        reference=engineer["id"],
        audit_event_type="ENGINEER_HIRED",
        audit_details={"engineer_id": engineer["id"], "core_competency": core_competency, "cost": formulas.HIRING_COST},
    )
    return {"success": True, "engineer": engineer, "budget": self.budget}
```

`rotate_shift` toggles `on_duty` → `resting` (immediately, at player request) or `off_duty`/`resting` → `on_duty` (only permitted once `stamina >= 40`, a floor preventing a player from cycling an exhausted engineer immediately back onto the floor — returned as `{"success": false, "error": "Stamina too low to return to duty"}` if violated). The REST route maps **every** failed rotation (unknown engineer or low stamina) to HTTP 404 with the engine's error text as `detail`:

```python
def rotate_shift(self, engineer_id: str) -> Dict[str, Any]:
    """TOGGLE AN ENGINEER BETWEEN ON-CALL AND RESTING STATUS"""
    eng = next((e for e in self.engineers if e["id"] == engineer_id), None)
    if not eng:
        return {"success": False, "error": "Engineer not found"}
    if eng["on_call_status"] == "on_duty":
        eng["on_call_status"] = "resting"
    else:
        if eng["stamina"] < 40:
            return {"success": False, "error": "Stamina too low to return to duty"}
        eng["on_call_status"] = "on_duty"
    self._persist_engineer(eng)
    self._log_audit_event(
        event_type="SHIFT_ROTATED",
        actor="VP_OF_INFRA",
        details={"engineer_id": engineer_id, "new_status": eng["on_call_status"]},
        compliance_flag=True,
    )
    return {"success": True, "engineer": eng}
```

Both calls trigger an immediate state push to WebSocket clients (`app/core/state_push.py`). Audit event types:

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `ENGINEER_HIRED` | `POST /api/staff/hire` succeeds | `VP_OF_INFRA` | `True` | `{"engineer_id": string, "core_competency": string, "cost": float}` |
| `SHIFT_ROTATED` | `POST /api/staff/{id}/rotate-shift` succeeds | `VP_OF_INFRA` | `True` | `{"engineer_id": string, "new_status": string}` |

### 3.4 `TICK_BROADCAST` Extension

```python
"engineers": self.engineers,
```

The key is part of `get_state_payload()`; ordering among keys is immaterial since all consumers key-access by name (§ 5.1 of Document `01_...`). The client type is `Engineer` in `frontend/src/types/game.ts` (fields `stress_index`, `stamina`, `on_call_status`, `assigned_service_id`, `hired_at_tick`, ...).

---

## 4. UI/UX & Sprite Rig Hooks

### 4.1 Extending `OfficeWorker`'s `WorkerMood` Enum

`frontend/src/components/office/OfficeWorker.tsx` defines `export type WorkerMood = "idle" | "panic" | "running" | "tired" | "happy" | "recovering"` with a fully keyed `HAND_POSE` and `BODY_ANIMATION` record per mood. The required sprite states map onto it as follows (`recovering` is the one mood this specification added):

| Required sprite state | Existing `WorkerMood` mapping | Notes |
|---|---|---|
| Slumped over desk ("Zzz") | `"tired"` | Already renders the exact "z z z" text glyph (`OfficeWorker.tsx:177-181`) and the slumped-posture transform (`OfficeWorker.tsx:90, 101`: `slumped = mood === "tired"`, applying `translateY(2px) scaleY(0.94)`). Triggered when `stamina < 25`. |
| Panic sweat drops | `"panic"` | Already renders the red exclamation badge and animated sweat-drop paths (`OfficeWorker.tsx:157-174`). Triggered when `stress_index > 75` (`PANIC_STRESS_THRESHOLD` in `engineerMood.ts`; the roster panel's `HIGH_STRESS` badge uses the same 75). This is a frontend constant: the backend's `STRESS_MTTR_DOUBLE_THRESHOLD` is legacy and is no longer read. |
| Running between desks and server room | `"running"` | Has a dedicated hand pose and `animate-sprint-bounce` body animation. Shown while the engineer's assigned service has an incident, or while the player is investigating (log triage) or mitigating that service (`isInvestigating` / `isMitigating` arguments of `deriveWorkerMood`); the actual walk to the rack is the roster stage's job (§ 4.3.1). |
| Holding an ice pack | `"recovering"` (added by this spec) | One hand raised to the head, a static body animation (no bounce — a subdued state contrasting with `"tired"`'s slump) and a small ice-pack glyph held against the temple. Derived while `on_call_status === "resting"` (§ 2.3), the one-tick transitional state distinct from the sustained `"off_duty"` state, which uses the plain `"idle"` mood. |

`OfficeWorkerProps` is unchanged: `mood` accepts any `WorkerMood`, and existing call sites passing the original five moods remain valid.

### 4.2 Mood Derivation Function

`deriveWorkerMood` is a pure function in `frontend/src/components/office/engineerMood.ts` (kept separate from `OfficeWorker.tsx` to preserve that component's presentational role, mirroring the `formulas.py` / `simulator.py` split):

```typescript
export function deriveWorkerMood(
  engineer: Engineer,
  hasActiveAlarmOnAssignedService: boolean,
  isInvestigating = false,
  isMitigating = false
): WorkerMood {
  if (engineer.on_call_status === "off_duty") return "idle";
  if (engineer.on_call_status === "resting") return "recovering";
  if (engineer.stress_index > 75) return "panic";
  if (engineer.stamina < 25) return "tired";
  if (isMitigating || isInvestigating) return "running";
  if (hasActiveAlarmOnAssignedService) return "running";
  return "idle";
}
```

Precedence is deliberate: duty status first (an off-duty engineer is never shown panicking from stale stress), then acute stress, then stamina, then activity, then calm idle.

### 4.3 `EngineerRosterPanel`

`frontend/src/components/dock/EngineerRosterPanel.tsx` is the dock's `"roster"` tab (hotkey `R`; its badge flags stressed engineers). Each roster row shows the engineer's name, competency badge, a stress bar and a stamina bar (tone thresholds at 50 and 75; stress is "high = bad", stamina is inverted), the duty status, a high-stress alert chip at `stress_index >= 75`, and a rotate-shift button calling `api.rotateShift(engineerId)` (a rejected rotation surfaces the server's error as a danger toast). A "Hire Engineer" call-to-action (`$15,000`, disabled when `budget < 15000` or while a hire is pending) opens the hire form (specialty and covered service, see § 4.3.2) that calls `api.hireEngineer(competency, serviceId)`; the control stays pending until the new engineer appears in telemetry, so a double click cannot double-hire. The panel shows an empty state until someone is hired.

### 4.3.1 Roster-Driven Office Scene

The scene no longer fakes occupants: **a desk shows a quiet "vacant" marker until an engineer is assigned to its service**, and every hired engineer is a walking sprite (`PathfindingEmployee`) driven by three small modules:

- `rosterPlan.ts` (pure rules): `deriveIntent` maps each engineer to `desk`, `incident` or `lounge` — `resting`/`off_duty` staff go to the lounge, staff whose assigned service has an `acknowledged` or `mitigated` incident go to that rack in the server room, everyone else sits at their desk. `assignSeats` gives the oldest hire the desk of their assigned service (`DESK_ORDER`: auth, payment, api-gw, search, notify); extra, unassigned or duplicate engineers take one of the three **reserve desks** in hire order; with no seat left they wait in the lounge. Lounge spots fill in order (coffee, two sofas, table, middle).
- `waypointGraph.ts`: a corridor graph with A* pathfinding, authored along the aisles, hallways and doorways so a sprite never clips through furniture (a unit test samples every edge against the furniture footprints).
- `rosterStage.ts` + `RosterDirector.tsx`: `RosterDirector` re-plans only when roster membership, duty status or the set of worked services changes (never on a plain tick) and feeds `RosterChoreographer`, which advances each sprite hop by hop on plain JS timers (so walking continues while the simulation is paused). **A new hire (hired within the last 2 ticks) enters at the reception door, pauses at the reception desk (about 1.1 s) and then walks to its desk**; everyone else is placed directly at their target. Reduced motion teleports instead of walking.

Mood, glow and pose come from live telemetry through `deriveWorkerMood`. Because rotation sends an engineer to the lounge for `resting` and then `off_duty`, the sprite stays in the lounge until the player rotates them back on duty, at which point they walk back to the desk. `WanderingEmployee` remains in use only for the decorative ambient staff.

### 4.3.2 Hire Flow — Service Assignment

The roster panel's hire form now sends `assigned_service_id`, so a UI hire takes effect on a specific service (hazard discount, specialist quality, burn multiplier, stress rules) and sits at that service's desk in `rosterPlan.assignSeats`. The form (`EngineerRosterPanel.tsx`, pure rules in `utils/staffCoverage.ts`) has three parts:

- **Specialty:** four toggle buttons (`auth`, `payments`, `gateway`, `db`; `aria-pressed`).
- **Covers service:** a `<select>` of the five canonical services with their friendly names. An option is tagged `recommended` when its competency matches the selected specialty (`SERVICE_COMPETENCY_MAP`: auth→auth, payment→payments, api-gw/search/notify→gateway; `db` matches no service) and `no coverage` when no engineer is assigned to it.
- **Default:** the first service with no assigned engineer whose competency matches (`defaultHireTarget`); with every service covered it falls back to `srv-auth`. Choosing another service re-aligns the specialty to its match; the specialty can then be changed deliberately.

A `role="status"` line states the consequence before the player pays: `Specialist: full effect` for a match, `Off-specialty: 0.45 quality` otherwise (`SPECIALIST_MISMATCH_BASE_QUALITY`, further eroded by stress). The hire button keeps the in-flight guard (pending until the new engineer appears in telemetry) and a Cancel button, and is disabled with a readable reason (`aria-describedby`) when cash is below the $15,000 signing cost. Each roster row shows the service it covers (or `Reserve desk (no service)`), and a footer line lists services with no assigned engineer. New copy lives in the `uiGaps` i18n namespace (`en`, `pt-BR`, `es`).

**No reassignment.** `assigned_service_id` is set only at hire time: the backend has no endpoint to change it later (`POST /api/staff/{id}/rotate-shift` only toggles duty status), so picking the wrong service is permanent for that engineer. Engineers created through the REST API without a service remain valid and unassigned (reserve desk, no per-service effect).

### 4.4 i18n Extension

```typescript
staff: {
  header: string;
  competencies: Record<"auth" | "payments" | "gateway" | "db", string>;
  onCallStatus: Record<"on_duty" | "off_duty" | "resting", string>;
  rotateShift: string;
  hireEngineer: string;
  insufficientStamina: string;
  hiringCost: (amount: string) => string;
  stress: string;
  stamina: string;
};
```

English values:

```typescript
staff: {
  header: "Roster",
  competencies: { auth: "Identity & Auth", payments: "Payments", gateway: "Gateway", db: "Database" },
  onCallStatus: { on_duty: "On Duty", off_duty: "Off Duty", resting: "Resting" },
  rotateShift: "Rotate Shift",
  hireEngineer: "Hire Engineer",
  insufficientStamina: "Stamina too low to return to duty",
  hiringCost: (amount) => `Signing cost: ${amount}`,
  stress: "Stress",
  stamina: "Stamina",
},
```

`pt-BR`/`es` blocks required in parallel per the established i18n completeness convention.

---

## 5. Non-Breaking Compliance Checklist

- [x] `stress_gain_for_unacked_alarm`, the specialist functions and their named constants are pure additions to `formulas.py`; the staff-related constants are listed in § 2.2.
- [x] The specialist burn multiplier (0.65x–1.30x) is scoped to the financial surcharge computed inside `_apply_budget_burn`; specialist quality additionally scales mitigation effectiveness in `apply_mitigation` (§ 2.4) and the MTTA breach window in `_progress_incidents`, and never rewrites a stored MTTA/MTTR counter or post-mortem field.
- [x] `self.engineers` defaults to an empty list — a session with no hired staff is behaviorally and numerically identical to the current baseline; every mechanic in this spec is gated on the roster being non-empty.
- [x] `TICK_BROADCAST` carries the `engineers` list; no other key changes shape.
- [x] `OfficeWorker.tsx`'s `WorkerMood` union gained exactly one member (`"recovering"`); the five original moods, their hand poses and body animations are untouched.
- [x] `ENGINEER_HIRED` and `SHIFT_ROTATED` are catalogued in the Audit Ledger Data Dictionary; `ENGINEER_HIRED` is a financial event reconstructed on restore.
- [x] The `engineers` table is created by the initial Alembic revision and follows the same cascade-delete conventions as every other child table.
