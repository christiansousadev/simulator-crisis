# Staff, On-Call, and Fatigue — Implementation Specification

**Document ID:** IZ-IMPL-03  
**Classification:** Implementation Contract / Technical Architecture Specification  
**Status:** Implementado  
**Last Updated:** Setembro 2026  
**Integration baseline:** `backend/app/engine/simulator.py`, `backend/app/engine/staff.py`, `backend/app/engine/formulas.py`, `backend/app/models/engineer.py`, `frontend/src/components/office/OfficeWorker.tsx`, `frontend/src/components/office/WanderingEmployee.tsx`, `frontend/src/components/office/EngineerDesk.tsx`

---

## 1. System Objective

Replace the implicit, undifferentiated notion of "an operator acts on the system" with a roster of individually simulated **engineers**, each with independent stress and stamina state, a core competency mapping to the existing service topology, and an on-call/off-duty rotation.

Staff state directly modulates simulation behavior:
1. **Hazard Discount:** High specialist quality provides up to a 35% discount on cascading failure probability (`formulas.specialist_hazard_discount`).
2. **Dynamic Burn Multiplier:** Replaces binary MTTR penalties with a continuous curve from 0.65× (high quality) up to 1.30× (mismatched/stressed) via `formulas.specialist_burn_multiplier`.
3. **Investigation & Mitigation Boosts:** Quality boosts runbook effectiveness and triage accuracy.
4. **Visual Synchronization:** Engineer desk positioning and office workers visually reflect real runtime states (investigating, mitigating, stressed, resting).

---

## 2. Human Resource Mechanics

### 2.1 Engineer Attributes

Each engineer is represented on `SimulationEngine` and persisted to SQLite via `Engineer` models:

| Field | Type | Range | Description |
|---|---|---|---|
| `id` | string | — | `f"eng-{uuid.uuid4().hex[:6]}"`. |
| `session_id` | string | — | Standard session-scoping field. |
| `name` | string | — | Drawn from fixed 12-name pool (`ENGINEER_NAME_POOL` in `staff.py`). |
| `assigned_service_id` | string \| `null` | — | Assigned service from `CANONICAL_SERVICE_IDS`, or `null` (standby/reserve). |
| `core_competency` | string enum | `"auth"` \| `"payments"` \| `"gateway"` \| `"db"` | Service specialization label matching `staff.SERVICE_COMPETENCY_MAP`. |
| `stress_index` | integer | `0`–`100` | Primary fatigue metric. |
| `stamina` | integer | `0`–`100` | Energy/endurance capacity metric. |
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
```

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

### 2.3 On-Call Shift Rotation

```python
def _progress_staff_fatigue(self):
    """ADVANCE PER-ENGINEER STRESS AND STAMINA EACH TICK BASED ON DUTY STATUS AND ALARM STATE"""
    for eng in self.engineers:
        if eng["on_call_status"] == "off_duty":
            eng["stress_index"] = max(0, eng["stress_index"] - formulas.OFF_DUTY_STRESS_RECOVERY_PER_TICK)
            eng["stamina"] = min(100, eng["stamina"] + formulas.OFF_DUTY_STAMINA_RECOVERY_PER_TICK)
        elif eng["on_call_status"] == "resting":
            eng["stress_index"] = max(0, eng["stress_index"] - formulas.OFF_DUTY_STRESS_RECOVERY_PER_TICK)
            eng["stamina"] = min(100, eng["stamina"] + formulas.OFF_DUTY_STAMINA_RECOVERY_PER_TICK)
            eng["on_call_status"] = "off_duty"  # exactly one resting tick, then fully off-duty
        else:  # on_duty
            eng["stamina"] = max(0, eng["stamina"] - formulas.ON_DUTY_STAMINA_DRAIN_PER_TICK)
            unacked = [
                inc for inc in self.incidents
                if inc["service_id"] == eng["assigned_service_id"] and inc["status"] == "active"
            ]
            for inc in unacked:
                gain = formulas.stress_gain_for_unacked_alarm(eng["stress_index"], inc["severity"])
                eng["stress_index"] = min(100, eng["stress_index"] + gain)
```

This step is appended to `_update_simulation_tick`, after `_progress_incidents()` (so it reads the current tick's freshly-advanced `mtta_seconds`/`status` values) and before `_apply_quiet_period_refactor()` — an additive insertion into the existing sequential call chain, matching the integration pattern already established in `02_ERROR_BUDGET_AND_CAB_GOVERNANCE_SPEC.md` § 3.1.

The literal "reduces stress by 2.0 per tick off-duty" requirement is satisfied exactly by `OFF_DUTY_STRESS_RECOVERY_PER_TICK = 2.0`.

### 2.4 Competency Match and Assignment

`core_competency` is matched against service identity via a fixed lookup table (not a database join, consistent with the project's existing preference for small fixed dictionaries over relational joins where the topology itself is fixed, Document 01 § Component Inventory's five-service, hardcoded-at-boot topology):

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

New file: `backend/app/models/engineer.py`:

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
| `stress_level` | `INTEGER` | No, default `0` | Column name is `stress_level` (matching the exact column name given in the task's own `engineers` table specification), while the in-memory dict field and formula parameter names are `stress_index` — this naming divergence is intentional and documented here explicitly rather than silently: the persistence layer's column name is fixed by this specification's literal data contract, while the runtime/formula naming favors `stress_index` for consistency with how `sla_percentage`/`tech_debt` are named as "indices" elsewhere in `formulas.py`'s vocabulary. The ORM mapping layer (`_persist_engineer`, § 3.3) is the single translation point between the two names. |
| `stamina` | `INTEGER` | No, default `100` | |
| `on_call_status` | `VARCHAR(20)` | No, default `"on_duty"` | One of `on_duty`/`off_duty`/`resting`. |
| `hired_at_tick` | `INTEGER` | No | |

**Required additive edit to `GameSession`:** `engineers = relationship("Engineer", back_populates="session", cascade="all, delete-orphan")`, plus the corresponding `models/__init__.py` export — same pattern as every prior spec in this directory.

### 3.2 In-Memory Engine State

```python
# added to SimulationEngine.__init__
self.engineers: List[Dict[str, Any]] = []  # empty roster by default; hiring is an explicit player action, not auto-seeded
```

No default engineers are auto-created on session bootstrap. This is a deliberate design choice preserving the current baseline's default playability: a session with zero hired engineers behaves identically to the present-day game (the `VP_OF_INFRA` actor continues to be the attribution for all `INCIDENT_ACKNOWLEDGED`/`RUNBOOK_EXECUTED` audit events, unchanged from Document 03 § 1's existing actor taxonomy), and the fatigue mechanics in § 2 are strictly opt-in additive complexity a player unlocks by hiring staff.

### 3.3 REST Endpoints

New file: `backend/app/api/v1/staff.py`:

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

`HireEngineerRequest` (`backend/app/schemas/staff.py`): `{"core_competency": str, "assigned_service_id": Optional[str]}`.

```python
HIRING_COST = 15000.0  # flat one-time signing cost, added to formulas.py

def hire_engineer(self, core_competency: str, assigned_service_id: Optional[str]) -> Dict[str, Any]:
    """HIRE A NEW ENGINEER, DEDUCTING A FLAT SIGNING COST FROM RUNWAY BUDGET"""
    if self.budget < formulas.HIRING_COST:
        return {"success": False, "error": "Insufficient budget runway"}
    if core_competency not in ("auth", "payments", "gateway", "db"):
        return {"success": False, "error": "Unknown core competency"}
    engineer = build_engineer(self.session_id, core_competency, assigned_service_id, self.current_tick)
    self.budget -= formulas.HIRING_COST
    self.engineers.append(engineer)
    self._persist_engineer(engineer)
    self._log_audit_event(
        event_type="ENGINEER_HIRED",
        actor="VP_OF_INFRA",
        details={"engineer_id": engineer["id"], "core_competency": core_competency, "cost": formulas.HIRING_COST},
        compliance_flag=True,
    )
    return {"success": True, "engineer": engineer, "budget": self.budget}
```

`rotate_shift` toggles `on_duty` → `resting` (immediately, at player request — this is the mechanism the spec's `POST /api/staff/{id}/rotate-shift` names) or `off_duty`/`resting` → `on_duty` (only permitted once `stamina >= 40`, a floor preventing a player from cycling an exhausted engineer immediately back onto the floor — returned as `{"success": false, "error": "Stamina too low to return to duty"}` if violated):

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

Two additive audit event types:

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `ENGINEER_HIRED` | `POST /api/staff/hire` succeeds | `VP_OF_INFRA` | `True` | `{"engineer_id": string, "core_competency": string, "cost": float}` |
| `SHIFT_ROTATED` | `POST /api/staff/{id}/rotate-shift` succeeds | `VP_OF_INFRA` | `True` | `{"engineer_id": string, "new_status": string}` |

### 3.4 `TICK_BROADCAST` Extension

```python
"engineers": self.engineers,
```

One additive key, appended after `purchased_upgrades` (if `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md` is implemented first) or after `recent_audits` otherwise — ordering among additive keys is immaterial since all consumers key-access by name (§ 5.1 of Document `01_...`).

---

## 4. UI/UX & Sprite Rig Hooks

### 4.1 Extending `OfficeWorker`'s `WorkerMood` Enum

`frontend/src/components/office/OfficeWorker.tsx` already defines `export type WorkerMood = "idle" | "panic" | "running" | "tired" | "happy"` with a fully keyed `HAND_POSE` and `BODY_ANIMATION` record per mood (`OfficeWorker.tsx:3, 29-46`). The specification's required sprite states map onto this existing enum with **zero new moods required** for the core cases, since the enum was already designed with fatigue and urgency states in mind:

| Required sprite state | Existing `WorkerMood` mapping | Notes |
|---|---|---|
| Slumped over desk ("Zzz") | `"tired"` | Already renders the exact "z z z" text glyph (`OfficeWorker.tsx:177-181`) and the slumped-posture transform (`OfficeWorker.tsx:90, 101`: `slumped = mood === "tired"`, applying `translateY(2px) scaleY(0.94)`). Triggered when `stamina < 25`. |
| Panic sweat drops | `"panic"` | Already renders the red exclamation badge and animated sweat-drop paths (`OfficeWorker.tsx:157-174`). Triggered when `stress_index > 75` (the same `STRESS_MTTR_DOUBLE_THRESHOLD` constant from § 2.2 — one threshold, two consuming systems: the MTTR-doubling formula and the visual panic state, kept in sync by referencing the same named constant rather than duplicating the literal `75`). |
| Running between desks and server room | `"running"` | Already has a dedicated hand pose and `animate-sprint-bounce` body animation (`OfficeWorker.tsx:33, 43`). Triggered for the tick immediately following an engineer's `assigned_service_id` incident transitioning to `active` — a brief (1–2 tick) "responding to alarm" animation state layered on top of the waypoint system described in `05_DAY_NIGHT_CYCLE_AND_DYNAMIC_OFFICE_VISUALS_SPEC.md` § 3, before the engineer's mood settles into whatever `stress_index`/`stamina` dictates for the incident's duration. |
| Holding an ice pack | **New mood required: `"recovering"`** | Not covered by the existing five moods. This is the only net-new `WorkerMood` variant this specification requires. Added as: `export type WorkerMood = "idle" \| "panic" \| "running" \| "tired" \| "happy" \| "recovering"`, with a new `HAND_POSE.recovering` (one hand raised to the head/temple, e.g. `{ left: [-5, -30], right: [5, -15] }`) and `BODY_ANIMATION.recovering = ""` (static, no bounce — a deliberately subdued animation conveying rest, contrasting with `"tired"`'s slump). A new conditional render block, structurally identical to the existing `mood === "panic"` and `mood === "tired"` blocks (`OfficeWorker.tsx:157-181`), renders a small blue ice-pack rectangle held against the temple when `mood === "recovering"`. Triggered during the `"resting"` `on_call_status` tick (§ 2.3) — the one-tick transitional recovery animation distinct from the sustained `"off_duty"` state, which uses the plain `"idle"` mood once fully off the floor. |

This is a fully additive change to `OfficeWorker.tsx`: the existing `HAND_POSE` and `BODY_ANIMATION` records gain one new key each; no existing key's value changes, and the component's prop contract (`OfficeWorkerProps`) is unchanged — `mood` already accepts any `WorkerMood` string, so widening the union type is the only interface change, and it is additive by TypeScript's structural typing rules (existing call sites passing `"idle"`/`"panic"`/etc. remain valid).

### 4.2 Mood Derivation Function

A new pure function, `deriveWorkerMood(engineer: Engineer, hasActiveAlarmOnAssignedService: boolean): WorkerMood`, added to a new `frontend/src/components/office/engineerMood.ts` module (kept separate from `OfficeWorker.tsx` itself to preserve that component's existing pure-presentational responsibility, mirroring the project's established separation between `formulas.py` and `simulator.py` on the backend):

```typescript
export function deriveWorkerMood(engineer: Engineer, hasActiveAlarmOnAssignedService: boolean): WorkerMood {
  if (engineer.on_call_status === "off_duty") return "idle";
  if (engineer.on_call_status === "resting") return "recovering";
  if (engineer.stress_level > 75) return "panic";
  if (engineer.stamina < 25) return "tired";
  if (hasActiveAlarmOnAssignedService) return "running";
  return "idle";
}
```

Precedence order matters and is deliberate: duty status is checked first (an off-duty engineer is never shown panicking, regardless of stale stress readings from before their shift ended), then acute stress (panic overrides mere tiredness — a stressed-but-not-yet-exhausted engineer still reads as panicked, since stress is the more urgent signal), then stamina, then transient alarm-response motion, falling back to calm idle animation.

### 4.3 New `EngineerRoster` Panel

New component `frontend/src/components/dock/EngineerRosterPanel.tsx`, wired as a further additive `DockTab` entry (`"roster"`) in `BottomDock.tsx`, following the exact extension pattern already specified in `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md` § 6.1 (`type DockTab = "incidents" | "directives" | "compliance" | "upgrades" | "roster"`). Each roster row shows the engineer's name, competency badge, a stress bar (green/amber/red, thresholds at 50/75, matching the panic threshold), a stamina bar, current duty status, and a "Rotate Shift" button calling `api.rotateShift(engineerId)`; a "Hire Engineer" call-to-action at the panel's footer opens a small competency-selection sub-form calling `api.hireEngineer(...)`.

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
},
```

`pt-BR`/`es` blocks required in parallel per the established i18n completeness convention.

---

## 5. Non-Breaking Compliance Checklist

- [x] `formulas.py`'s existing exported functions are unmodified; `stress_gain_for_unacked_alarm` and the six new named constants are pure additions.
- [x] `apply_mitigation`'s instantaneous-healing contract (Document 04 § 2) is unchanged; the MTTR-doubling effect is scoped strictly to the financial surcharge computed inside `_apply_budget_burn`, not to incident resolution mechanics or any post-mortem field.
- [x] `self.engineers` defaults to an empty list — a session with no hired staff is behaviorally and numerically identical to the current baseline; every mechanic in this spec is gated on the roster being non-empty.
- [x] `TICK_BROADCAST` gains one additive `engineers` key; no existing key changes shape.
- [x] `OfficeWorker.tsx`'s `WorkerMood` union gains exactly one new member (`"recovering"`); all five existing moods, their hand poses, and their body animations are untouched.
- [x] Two new audit event types (`ENGINEER_HIRED`, `SHIFT_ROTATED`) are additive rows in the enumerated event-type set; no existing event type's schema changes.
- [x] The new `engineers` table follows the identical `Base.metadata.create_all` auto-registration and cascade-delete conventions as every other child table.
