# Error Budget and Change Advisory Board Governance — Implementation Specification

**Document ID:** IZ-IMPL-02  
**Classification:** Implementation Contract / Technical Architecture Specification  
**Status:** Implementado  
**Last Updated:** Setembro 2026  
**Integration baseline:** `backend/app/engine/formulas.py`, `backend/app/engine/simulator.py`, `backend/app/engine/dilemmas.py`, `backend/app/api/v1/dilemmas.py`, `frontend/src/components/layout/Topbar.tsx`, `frontend/src/store/useGameStore.ts`

---

## 1. System Objective

Introduce a Google SRE-aligned **Error Budget** tracking layer computed from the 720-sample rolling-window `sla_percentage`, and a **Change Advisory Board (CAB) Dilemma Engine** that periodically interrupts the tick loop with a scored, timed player decision. Both systems are read-layers and event-generators on top of state the engine already maintains (`sla_percentage`, `budget`, `tech_debt`, `user_happiness`) — neither introduces a competing source of truth for those fields.

---

## 2. Error Budget Formula

### 2.1 Total Error Budget

The Error Budget is defined relative to the existing `formulas.SLA_BENCHMARK` constant (`99.90`, Document 02 § 0), which already represents the platform's committed monthly SLA target. The Error Budget is the complementary unavailability allowance:

$$
\text{TotalErrorBudget} = 100 - \text{SLA\_BENCHMARK} = 100 - 99.90 = 0.10 \ (\text{percentage points})
$$

This is added as a named constant in `backend/app/engine/formulas.py`:

```python
TOTAL_ERROR_BUDGET_PCT = 100.0 - SLA_BENCHMARK  # 0.10 percentage points, per the 99.90% SLA commitment
```

### 2.2 Error Budget Consumption and Remaining Budget

At any tick $t$, the platform's window unavailability is precisely the complement of the 720-sample rolling-window `sla_percentage`:

$$
\text{WindowUnavailabilityPct}(t) = 100 - \text{sla\_percentage}(t)
$$

$$
\text{ErrorBudgetRemainingPct}(t) = \text{TOTAL\_ERROR\_BUDGET\_PCT} - \text{WindowUnavailabilityPct}(t)
$$

Expressed as a **burn ratio** (the presentation format for the Topbar meter, § 5.1):

$$
\text{ErrorBudgetBurnRatio}(t) = \frac{\text{WindowUnavailabilityPct}(t)}{\text{TOTAL\_ERROR\_BUDGET\_PCT}}
$$

A `BurnRatio` of `0.0` means zero window unavailability (`sla_percentage` at 100.00%); `1.0` means the entire monthly allowance has been consumed exactly (`sla_percentage` at the 99.90% benchmark); any value `> 1.0` means the budget is over-spent.

### 2.3 Real-Time Burn Rate

The *rate* of consumption is computed across a rolling 10-tick sample window (`ERROR_BUDGET_BURN_RATE_WINDOW = 10`):

```python
self._error_budget_history: List[float] = []
ERROR_BUDGET_BURN_RATE_WINDOW = 10
```

`_error_budget_history` is persisted to SQLite as `error_budget_history_json` and restored via `_deserialize_error_budget_history`, maintaining historical trajectory across restarts.

### 2.4 Feature Freeze State & Remediation Exception

When `error_budget_remaining_ratio` reaches `0.0`, the engine activates `feature_freeze_active = True`, logging `FEATURE_FREEZE_ENGAGED` (`compliance_flag=False`).

- **Operational Restriction:** While `feature_freeze_active` is `True`, `apply_mitigation` rejects discretionary hotfix runbooks (`emergency_patch`).
- **Remediation Exception:** To prevent unrecoverable soft-locks, if the target service has an **already-open active incident**, `emergency_patch` is permitted. This ensures acute defects that require hotfixes can always be mitigated to lift the freeze.
- When SLA recovers such that `error_budget_remaining_ratio > 0.0`, `FEATURE_FREEZE_LIFTED` is logged (`compliance_flag=True`).

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `FEATURE_FREEZE_ENGAGED` | Error Budget reaches 0% remaining | `AUDIT_SYSTEM` | `False` | `{"sla_percentage": float, "tech_debt": int}` |
| `FEATURE_FREEZE_LIFTED` | `sla_percentage` recovers above `SLA_BREACH_THRESHOLD` while frozen | `AUDIT_SYSTEM` | `True` | `{"sla_percentage": float}` |

---

## 3. CAB Dilemma Engine

### 3.1 Trigger Cadence

A dilemma is offered on a randomized interval, re-rolled after each dilemma resolves, matching the "every 40–60 ticks" requirement:

```python
# added to formulas.py
CAB_DILEMMA_MIN_INTERVAL_TICKS = 40
CAB_DILEMMA_MAX_INTERVAL_TICKS = 60
```

```python
# added to SimulationEngine.__init__
self.next_dilemma_tick: int = random.randint(formulas.CAB_DILEMMA_MIN_INTERVAL_TICKS, formulas.CAB_DILEMMA_MAX_INTERVAL_TICKS)
self.active_dilemma: Optional[Dict[str, Any]] = None
```

A new tick-loop step, `_evaluate_cab_dilemma`, appended to `_update_simulation_tick` after `_evaluate_session_status()` (so a dilemma is never offered on the same tick a terminal bankruptcy/victory transition occurs — terminal states halt `is_running`, and the loop already stops broadcasting further ticks once that happens):

```python
def _evaluate_cab_dilemma(self):
    """OFFER A NEW CAB DILEMMA WHEN THE SCHEDULED INTERVAL ELAPSES AND NONE IS PENDING"""
    if self.active_dilemma is not None:
        return  # a dilemma is already awaiting player response; do not stack another
    if self.current_tick < self.next_dilemma_tick:
        return
    self.active_dilemma = build_dilemma(self.current_tick)
    self._log_audit_event(
        event_type="DILEMMA_OFFERED",
        actor="BOARD_OF_DIRECTORS",
        details={"dilemma_id": self.active_dilemma["id"], "title": self.active_dilemma["title"]},
        compliance_flag=True,
    )
```

If the player does not respond within the decision window (§ 5.2's 30-second countdown, enforced client-side; server-side enforcement is a `dilemma_expires_at_tick` field, see § 3.3), the dilemma auto-resolves to its designated `default_choice_id` on expiry, evaluated inside `_progress_incidents`'s sibling step so unresolved dilemmas cannot stall the simulation indefinitely — mirroring the existing design principle that no player inaction can pause the tick loop itself (Document 02's entire regulatory-penalty design assumes ticks always advance).

### 3.2 Dilemma Content Model

New file: `backend/app/engine/dilemmas.py`, following the `event_generator.py` pattern of a fixed narrative pool plus a `build_*` constructor function:

```python
DILEMMA_POOL = [
    {
        "id": "vendor_lockin_discount",
        "title": "Vendor Lock-In Discount Offer",
        "narrative": "A cloud vendor offers a 15% infrastructure discount in exchange for a 12-month exclusivity commitment, bypassing the standard architecture review.",
        "choices": [
            {"id": "accept", "label": "Accept the discount", "budget_delta": 12000.0, "tech_debt_delta": 6, "happiness_delta": 0.0},
            {"id": "decline", "label": "Decline, escalate to full CAB review", "budget_delta": 0.0, "tech_debt_delta": 0, "happiness_delta": -1.0},
        ],
        "default_choice_id": "decline",
    },
    {
        "id": "skip_load_testing",
        "title": "Compressed Release Timeline",
        "narrative": "Product leadership requests skipping the full load-testing cycle to hit an external launch deadline.",
        "choices": [
            {"id": "skip", "label": "Skip load testing, ship on time", "budget_delta": 6000.0, "tech_debt_delta": 10, "happiness_delta": 2.0},
            {"id": "delay", "label": "Delay launch, run full test suite", "budget_delta": -4000.0, "tech_debt_delta": -1, "happiness_delta": -1.5},
        ],
        "default_choice_id": "delay",
    },
    {
        "id": "unpaid_overtime_push",
        "title": "Unpaid Overtime Push",
        "narrative": "A director proposes an unpaid weekend on-call push to close a backlog of low-priority tickets before the board review.",
        "choices": [
            {"id": "push", "label": "Approve the overtime push", "budget_delta": 3000.0, "tech_debt_delta": -3, "happiness_delta": -6.0},
            {"id": "refuse", "label": "Refuse, schedule it as paid sprint work", "budget_delta": -5000.0, "tech_debt_delta": -3, "happiness_delta": 1.0},
        ],
        "default_choice_id": "refuse",
    },
    {
        "id": "third_party_audit_waiver",
        "title": "Third-Party Security Audit Waiver",
        "narrative": "Legal proposes waiving this quarter's mandatory third-party penetration test to save budget, citing an unblemished track record.",
        "choices": [
            {"id": "waive", "label": "Waive the audit", "budget_delta": 9000.0, "tech_debt_delta": 4, "happiness_delta": 0.0},
            {"id": "proceed", "label": "Proceed with the audit as scheduled", "budget_delta": -9000.0, "tech_debt_delta": -2, "happiness_delta": 0.5},
        ],
        "default_choice_id": "proceed",
    },
]
```

Four fixed dilemmas is the exhaustive pool for this phase (mirroring `ROOT_CAUSE_POOL`'s fixed-8 precedent — a closed, enumerable content set is the established project convention, not an oversight). Every dilemma has exactly two choices, and every choice carries all three trade-off axes (`budget_delta`, `tech_debt_delta`, `happiness_delta`) required by the "immediate runway revenue vs. tech debt injection vs. morale impact" specification — no choice is ever a strict dominant strategy across all three axes simultaneously, by construction (each pair trades at least one axis against another).

```python
def build_dilemma(current_tick: int) -> Dict[str, Any]:
    """CONSTRUCT A NEW CAB DILEMMA INSTANCE FROM THE FIXED NARRATIVE POOL"""
    template = random.choice(DILEMMA_POOL)
    return {
        "id": f"dil-{uuid.uuid4().hex[:8]}",
        "dilemma_key": template["id"],
        "title": template["title"],
        "narrative": template["narrative"],
        "choices": template["choices"],
        "default_choice_id": template["default_choice_id"],
        "offered_at_tick": current_tick,
        "expires_at_tick": current_tick + 30,  # 30-tick server-side decision window
        "resolved": False,
        "resolved_choice_id": None,
    }
```

### 3.3 Data Contract — `dilemma_events` Table

New file: `backend/app/models/dilemma.py`:

```python
from sqlalchemy import Column, String, Integer, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base


class DilemmaEvent(Base):
    """RECORDS A CAB DILEMMA OFFERED TO THE PLAYER AND ITS ULTIMATE RESOLUTION"""

    __tablename__ = "dilemma_events"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    dilemma_key = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    offered_at_tick = Column(Integer, nullable=False)
    expires_at_tick = Column(Integer, nullable=False)
    resolved_at_tick = Column(Integer, nullable=True)
    resolved_choice_id = Column(String(50), nullable=True)
    was_auto_resolved = Column(Boolean, nullable=False, default=False)
    choices_json = Column(Text, nullable=False)

    session = relationship("GameSession", back_populates="dilemma_events")
```

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `VARCHAR(36)` PK | No | `f"dil-{uuid.uuid4().hex[:8]}"` |
| `session_id` | `VARCHAR(36)` FK CASCADE | No | Standard session-scoping pattern. |
| `dilemma_key` | `VARCHAR(50)` | No | References the fixed `DILEMMA_POOL` entry `id` (e.g. `"vendor_lockin_discount"`), distinct from the row's own generated `id`. |
| `title` | `VARCHAR(255)` | No | Denormalized copy of the narrative title, so a historical row remains human-readable even if `DILEMMA_POOL` content is edited in a future release. |
| `offered_at_tick` | `INTEGER` | No | Tick the dilemma was raised. |
| `expires_at_tick` | `INTEGER` | No | `offered_at_tick + 30`. |
| `resolved_at_tick` | `INTEGER` | Yes | `NULL` until resolved (by player choice or auto-expiry). |
| `resolved_choice_id` | `VARCHAR(50)` | Yes | The `choices[].id` selected; `NULL` until resolved. |
| `was_auto_resolved` | `BOOLEAN` | No, default `False` | `True` if resolution occurred via expiry rather than an explicit `POST` (§ 4.1) — a governance-relevant distinction, since an auto-resolved dilemma reflects the *default* board-approved fallback rather than an active player decision, directly analogous to the honest-disclosure pattern already established for the post-mortem SOP's fallback fields (Document 05 § 3.3). |
| `choices_json` | `TEXT` | No | `json.dumps(template["choices"])` — full snapshot of the two choices as offered, so a later `DILEMMA_POOL` content edit cannot retroactively alter what a historical dilemma actually presented. |

**Required additive edit to `GameSession`:** one new relationship line, `dilemma_events = relationship("DilemmaEvent", back_populates="session", cascade="all, delete-orphan")`, and the corresponding `models/__init__.py` export addition — identical integration pattern to § 3 of `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md`.

### 3.4 REST Endpoint — Resolving a Dilemma

New file: `backend/app/api/v1/dilemmas.py`:

```python
@router.post("/api/dilemmas/{dilemma_id}/resolve")
async def resolve_dilemma(dilemma_id: str, payload: DilemmaResolveRequest, request: Request) -> Dict[str, Any]:
    """RECORD THE PLAYER'S CHOICE FOR AN ACTIVE CAB DILEMMA"""
    engine = request.app.state.engine
    result = engine.resolve_dilemma(dilemma_id, payload.choice_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Dilemma resolution failed"))
    return result
```

`DilemmaResolveRequest` (`backend/app/schemas/dilemma.py`): `{"choice_id": str}`, mirroring `MitigationExecuteRequest`'s minimal-payload convention.

`SimulationEngine.resolve_dilemma`:

```python
def resolve_dilemma(self, dilemma_id: str, choice_id: str) -> Dict[str, Any]:
    """APPLY THE PLAYER'S SELECTED CAB DILEMMA OUTCOME"""
    if not self.active_dilemma or self.active_dilemma["id"] != dilemma_id:
        return {"success": False, "error": "No matching active dilemma"}
    choice = next((c for c in self.active_dilemma["choices"] if c["id"] == choice_id), None)
    if not choice:
        return {"success": False, "error": "Unknown choice id"}
    self._apply_dilemma_choice(choice, auto_resolved=False)
    return {"success": True, "choice_id": choice_id, "budget": self.budget, "tech_debt": self.tech_debt}
```

`_apply_dilemma_choice` applies the three deltas (clamping `tech_debt` to `[0, 100]` and `user_happiness` to `[0, 100]`, matching every other mutator's existing clamp convention), persists the `DilemmaEvent` row via `db.merge`, logs a `DILEMMA_RESOLVED` audit event, clears `self.active_dilemma = None`, and reschedules `self.next_dilemma_tick = self.current_tick + random.randint(40, 60)`.

Two further additive audit event types (bringing the running total to 13):

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `DILEMMA_OFFERED` | New dilemma raised | `BOARD_OF_DIRECTORS` | `True` | `{"dilemma_id": string, "title": string}` |
| `DILEMMA_RESOLVED` | Player choice recorded or auto-expiry fires | `VP_OF_INFRA` (explicit) or `BOARD_OF_DIRECTORS` (auto-resolved) | `True` unless the resolved choice's `tech_debt_delta > 5` (a materially debt-injecting decision, flagged for reviewer attention exactly as `emergency_patch` overuse is flagged in Document 04 § 3) | `{"dilemma_id": string, "choice_id": string, "auto_resolved": bool, "budget_delta": float, "tech_debt_delta": int, "happiness_delta": float}` |

### 3.5 WebSocket Broadcast Payload

`TICK_BROADCAST` (§ 5 below covers Topbar; this is the data contract) gains two additive keys:

```python
"error_budget_remaining_ratio": round(self.error_budget_remaining_ratio, 4),
"feature_freeze_active": self.feature_freeze_active,
```

A dilemma offering is pushed as its own out-of-band frame, using the same `_broadcast_json` helper introduced in `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md` § 5.2, immediately when `_evaluate_cab_dilemma` creates one:

```json
{
  "type": "DILEMMA_OFFERED",
  "dilemma_id": "dil-4f9a21bc",
  "title": "Compressed Release Timeline",
  "narrative": "Product leadership requests skipping the full load-testing cycle to hit an external launch deadline.",
  "choices": [
    {"id": "skip", "label": "Skip load testing, ship on time", "budget_delta": 6000.0, "tech_debt_delta": 10, "happiness_delta": 2.0},
    {"id": "delay", "label": "Delay launch, run full test suite", "budget_delta": -4000.0, "tech_debt_delta": -1, "happiness_delta": -1.5}
  ],
  "expires_at_tick": 347
}
```

---

## 4. UI/UX Specification

### 4.1 Topbar Error Budget Meter

`frontend/src/components/layout/Topbar.tsx` currently renders four KPI clusters separated by vertical dividers: `ShieldGauge`, `CreditCounter`, `TechDebtMeter`, `MoraleMeter` (§ "company kpis" block, `Topbar.tsx:64-72` — since shifted by an unrelated scroll-affordance fix, see `08_QUALITY_GATES_AND_INSTALLABILITY_SPEC.md` § 5; the meter list and order below are still accurate). A fifth cluster, `ErrorBudgetMeter`, is inserted additively into that same flex row, immediately after `ShieldGauge` (the two are conceptually paired — SLA and its complementary Error Budget) and before the existing divider that precedes `CreditCounter`:

```tsx
<ShieldGauge slaPercentage={telemetry.sla_percentage} />
<div className="h-9 w-px bg-slate-700" />
<ErrorBudgetMeter remainingRatio={telemetry.error_budget_remaining_ratio} frozen={telemetry.feature_freeze_active} />
<div className="h-9 w-px bg-slate-700" />
<CreditCounter budget={telemetry.budget} />
```

New component `frontend/src/components/common/ErrorBudgetMeter.tsx`, structurally modeled on the existing `ShieldGauge.tsx` (a radial/bar gauge reading a `0-100`-style percentage): renders a horizontal burn-down bar filled to `remainingRatio * 100`%, color-graded green (`>50%` remaining) → amber (`10-50%`) → red (`<10%`), with a pulsing red "FEATURE FREEZE" badge overlay when `frozen === true`, reusing the existing `animate-pulse`/`animate-blink` Tailwind utility classes already present in the codebase (`BottomDock.tsx`'s incident-count badge, `Topbar.tsx`'s disconnected-indicator dot).

### 4.2 CAB Decision Modal

New component `frontend/src/components/modals/CABDilemmaModal.tsx`, structurally modeled on the existing `IncidentDetailModal.tsx`/`PostMortemModal.tsx` full-screen overlay pattern (Document 01 § Component Inventory lists these as the established modal idiom). Rendered at the app root (alongside the existing conditional renders for `selectedIncident` and `postMortem` in whatever top-level layout component currently gates those two — additive sibling condition, not a restructure) whenever `useGameStore`'s new `activeDilemma` field is non-null.

**Visual treatment ("cinematic"):** full-viewport dark backdrop (`bg-slate-950/80`), a centered card with a boardroom-red accent border, the dilemma `narrative` text prominently displayed, two large side-by-side choice buttons each showing their `budget_delta`/`tech_debt_delta`/`happiness_delta` as color-coded pills (green for positive budget/happiness, red for positive tech-debt-delta — debt increase is always the "cost" color regardless of sign convention, consistent with `TechDebtMeter.tsx`'s existing red-for-high-debt convention), and a countdown ring or bar animating from the dilemma's 30-tick window down to zero, converted to the same tick-rate-aware wall-clock estimate the Topbar's speed control already reasons about (`tick_rate_seconds`).

**Server-authoritative expiry:** the modal's countdown is presentational only. The actual expiry is enforced server-side (§ 3.1, auto-resolution to `default_choice_id`) — if the countdown reaches zero client-side before the next `TICK_BROADCAST` confirms resolution, the modal remains open in a "resolving…" state rather than optimistically closing, preventing a race where the player's late click races an already-auto-resolved dilemma. This mirrors the existing best-effort/reconciliation pattern already documented for `Topbar.tsx`'s speed control (`handleSpeedChange`'s comment: "best-effort; the next telemetry frame reconciles actual engine state").

### 4.3 Zustand Store Extension

```typescript
interface GameStore {
  // ...existing fields unchanged...
  activeDilemma: DilemmaOffer | null;
  setActiveDilemma: (dilemma: DilemmaOffer | null) => void;
}
```

`activeDilemma` is set by the WebSocket message handler (`useSimulationSocket.ts`, Document 01 reference) on receipt of a `"type": "DILEMMA_OFFERED"` frame, and cleared to `null` either by a successful `POST /api/dilemmas/{id}/resolve` response or by the next `TICK_BROADCAST` frame in which `feature_freeze_active`/other state confirms the dilemma tick has passed `expires_at_tick` — the WebSocket handler's existing `switch`-on-`type` dispatch (introduced as a requirement in `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md` § 5.2) gains one more `case`, additive to whatever cases already exist.

### 4.4 i18n Extension

New `errorBudget` and `cabDilemma` namespaces added to `Translations`:

```typescript
errorBudget: {
  label: string;
  remaining: (pct: number) => string;
  featureFreezeActive: string;
};
cabDilemma: {
  modalTitle: string;
  timeRemaining: (seconds: number) => string;
  choiceImpact: { budget: string; techDebt: string; morale: string };
};
```

English values:

```typescript
errorBudget: {
  label: "Error Budget",
  remaining: (pct) => `${pct.toFixed(1)}% remaining`,
  featureFreezeActive: "FEATURE FREEZE ACTIVE",
},
cabDilemma: {
  modalTitle: "Change Advisory Board — Decision Required",
  timeRemaining: (seconds) => `${seconds}s to decide`,
  choiceImpact: { budget: "Runway", techDebt: "Tech Debt", morale: "Morale" },
},
```

As with `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md` § 6.4, the `pt-BR` and `es` blocks must be populated in parallel before merge.

---

## 5. Non-Breaking Compliance Checklist

- [x] `SLA_BENCHMARK`, `SLA_BREACH_THRESHOLD`, and every existing `formulas.py` constant are read, never modified; `TOTAL_ERROR_BUDGET_PCT` is a new derived constant.
- [x] `feature_freeze_active` gates only the pre-existing `hotfix` category, and only by adding a new guard clause ahead of the existing budget check in `apply_mitigation` — the existing three non-hotfix runbooks are entirely unaffected by this specification.
- [x] `TICK_BROADCAST` gains two additive keys; `DILEMMA_OFFERED` is a distinct, separately-typed frame, not a mutation of the tick contract.
- [x] Two new tables (`dilemma_events`, and no change to any existing table) follow the established `Base.metadata.create_all` auto-registration pattern.
- [x] The Audit Ledger's enumerated event-type set grows additively (two more rows: `FEATURE_FREEZE_ENGAGED`/`LIFTED`, plus `DILEMMA_OFFERED`/`RESOLVED` — four new rows from this document, on top of the one from `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md`, bringing the cumulative total to 13 once both specs are implemented); no existing event type's contract changes.
- [x] The new Topbar meter and CAB modal are additive UI insertions using established component and animation idioms; no existing KPI cluster, divider, or modal is removed or restructured.
