# Error Budget and Change Advisory Board Governance — Implementation Specification

**Document ID:** IZ-IMPL-02  
**Classification:** Implementation Contract / Technical Architecture Specification  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Integration baseline:** `backend/app/engine/formulas.py`, `backend/app/engine/simulator.py`, `backend/app/engine/dilemmas.py`, `backend/app/api/v1/dilemmas.py`, `frontend/src/components/layout/Topbar.tsx`, `frontend/src/components/common/ErrorBudgetMeter.tsx`, `frontend/src/components/modals/CABDilemmaModal.tsx`, `frontend/src/utils/cabDeadline.ts`, `frontend/src/store/useGameStore.ts`

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

This is a named constant in `backend/app/engine/formulas.py`:

```python
TOTAL_ERROR_BUDGET_PCT = 100.0 - SLA_BENCHMARK  # 0.10 percentage points, per the 99.90% SLA commitment
```

### 2.2 Error Budget Consumption and Remaining Budget

At any tick $t$, the platform's window unavailability is precisely the complement of the rolling-window `sla_percentage` (the mean of the last `VICTORY_TICK_THRESHOLD = 720` per-tick availability samples):

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
self._error_budget_history: List[float] = []   # burn ratios, trimmed to the last 10 samples
ERROR_BUDGET_BURN_RATE_WINDOW = 10             # simulator.py
```

`formulas.error_budget_burn_rate(history)` is `(history[-1] - history[0]) / (len(history) - 1)` (0.0 with fewer than two samples). `_error_budget_history` is persisted to SQLite as `error_budget_history_json` and restored via `_deserialize_error_budget_history`, maintaining the short trajectory across restarts. `error_budget_remaining_ratio = clamp_ratio(1 - burn_ratio)`, so it is a `0..1` value that stays at `0.0` once the budget is overspent.

### 2.4 Feature Freeze State & Remediation Exception

When `error_budget_remaining_ratio` reaches `0.0` (rolling `sla_percentage` at or below `SLA_BENCHMARK`, 99.90), `_evaluate_feature_freeze` activates `feature_freeze_active = True`, logging `FEATURE_FREEZE_ENGAGED` (`compliance_flag=False`). The freeze is a **different threshold** from `SLA_BREACH_THRESHOLD` (99.00), which governs the separate `breached` session status.

- **Operational Restriction:** While `feature_freeze_active` is `True`, `apply_mitigation` rejects runbooks of category `hotfix` (the only one is `emergency_patch`) with `"Feature freeze active: high-risk runbooks disabled pending tech debt remediation"`.
- **Remediation Exception:** To prevent unrecoverable soft-locks, if the target service has an **already-open incident** (status `active` or `acknowledged`), `emergency_patch` is permitted. This ensures acute defects that require hotfixes can always be mitigated to lift the freeze.
- **Lift condition:** when the rolling SLA recovers such that `error_budget_remaining_ratio > 0.0` (i.e. `sla_percentage > 99.90`, not the 99.00 breach threshold), `FEATURE_FREEZE_LIFTED` is logged (`compliance_flag=True`).
- The freeze is evaluated each tick *after* the terminal-state check, and is restored on a process restart from the persisted SLA window (`feature_freeze_active = remaining_ratio <= 0`).

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `FEATURE_FREEZE_ENGAGED` | Error Budget reaches 0% remaining | `AUDIT_SYSTEM` | `False` | `{"sla_percentage": float, "tech_debt": int}` |
| `FEATURE_FREEZE_LIFTED` | `error_budget_remaining_ratio` recovers above `0.0` (rolling `sla_percentage` > `SLA_BENCHMARK`, 99.90) while frozen | `AUDIT_SYSTEM` | `True` | `{"sla_percentage": float}` |

---

## 3. CAB Dilemma Engine

### 3.1 Trigger Cadence

A dilemma is offered on a randomized interval, re-rolled after each dilemma resolves, matching the "every 40–60 ticks" requirement:

```python
# formulas.py
CAB_DILEMMA_MIN_INTERVAL_TICKS = 40
CAB_DILEMMA_MAX_INTERVAL_TICKS = 60
```

```python
# SimulationEngine.__init__
self.next_dilemma_tick: int = random.randint(formulas.CAB_DILEMMA_MIN_INTERVAL_TICKS, formulas.CAB_DILEMMA_MAX_INTERVAL_TICKS)
self.active_dilemma: Optional[Dict[str, Any]] = None
```

`_evaluate_cab_dilemma` is the last-but-one step of `_update_simulation_tick` (after `_evaluate_session_status`, `_evaluate_feature_freeze`, staff fatigue and pre-alert progression, and before `_evaluate_achievements`). A terminal tick returns before it, so a dilemma is never offered on the tick a bankruptcy/victory/scenario conclusion occurs.

```python
def _evaluate_cab_dilemma(self):
    """OFFER A NEW CAB DILEMMA ON SCHEDULE, OR AUTO-RESOLVE AN EXPIRED ONE"""
    if self.active_dilemma is not None:
        if self.current_tick >= self.active_dilemma["expires_at_tick"]:
            self._auto_resolve_dilemma()
        return
    if self.current_tick < self.next_dilemma_tick:
        return
    self.active_dilemma = dilemmas.build_dilemma(self.current_tick, self.reputation)
    # persists the DilemmaEvent row, logs DILEMMA_OFFERED, queues the DILEMMA_OFFERED frame
```

The decision window is **30 ticks** (`expires_at_tick = offered_at_tick + 30`). If the player does not respond in time the dilemma auto-resolves to its `default_choice_id` inside the same step (`_auto_resolve_dilemma` -> `_apply_dilemma_choice(..., auto_resolved=True)`), so no player inaction can stall the simulation. The countdown shown to the player (§ 4.2) is purely presentational; the tick counter is authoritative. A dilemma offered but unresolved when the process stops is restored on boot with its original expiry tick, and if that tick has already passed it is auto-resolved on the first tick.

### 3.2 Dilemma Content Model

File: `backend/app/engine/dilemmas.py`, following the `event_generator.py` pattern of a fixed narrative pool plus a `build_dilemma` constructor. The pool has **six** templates: four always-eligible base dilemmas and two reputation-gated callbacks. Every dilemma has exactly two choices, and every choice carries four trade-off axes: `budget_delta`, `tech_debt_delta`, `happiness_delta` and `reputation_delta`. The three corner-cutting choices that are not simply "refuse" additionally carry a **temporary elevated-hazard window** (`risk_window_ticks`, `risk_multiplier`).

| Dilemma id | Gate | Choice (id) | budget | tech debt | morale | reputation | risk window |
|---|---|---|---|---|---|---|---|
| `vendor_lockin_discount` | none | Accept the discount (`accept`) | +12,000 | +6 | 0.0 | -4 | 20 ticks x1.25 |
| | | Decline, escalate to full CAB review (`decline`, default) | 0 | 0 | -1.0 | +3 | none |
| `skip_load_testing` | none | Skip load testing, ship on time (`skip`) | +6,000 | +10 | +2.0 | -5 | 15 ticks x1.35 |
| | | Delay launch, run full test suite (`delay`, default) | -4,000 | -1 | -1.5 | +4 | none |
| `unpaid_overtime_push` | none | Approve the overtime push (`push`) | +3,000 | -3 | -6.0 | -6 | 12 ticks x1.20 |
| | | Refuse, schedule it as paid sprint work (`refuse`, default) | -5,000 | -3 | +1.0 | +5 | none |
| `third_party_audit_waiver` | none | Waive the audit (`waive`) | +9,000 | +4 | 0.0 | -5 | 25 ticks x1.20 |
| | | Proceed with the audit as scheduled (`proceed`, default) | -9,000 | -2 | +0.5 | +4 | none |
| `board_intervention` | `reputation <= 24` (`max_reputation`) | Accept the funding and the oversight (`accept_probation`, default) | +15,000 | -8 | -2.0 | +10 | none |
| | | Reject it, stay independent (`reject_probation`) | 0 | 0 | +1.0 | -3 | none |
| `executive_promotion_offer` | `reputation >= 76` (`min_reputation`) | Accept the expanded mandate (`accept_promotion`) | +18,000 | 0 | +3.0 | +2 | none |
| | | Stay focused on the current platform (`stay_focused`, default) | +4,000 | 0 | 0.0 | +1 | none |

Titles/narratives are in `dilemmas.py` (for example "Vendor Lock-In Discount Offer", "Compressed Release Timeline", "Unpaid Overtime Push", "Third-Party Security Audit Waiver", "Board Intervention: Governance Probation", "Executive Track Promotion Offer") and are translated client-side by `translateDilemma` in `frontend/src/i18n/dynamicContent.ts`.

`build_dilemma(current_tick, reputation=50.0)` filters the pool by `reputation >= min_reputation (default 0)` and `reputation <= max_reputation (default 100)`, then picks uniformly at random among the eligible templates (falling back to the whole pool if none match, which cannot happen with the four ungated entries). The returned instance carries `id` (`dil-<8 hex>`), `dilemma_key`, `title`, `narrative`, `choices`, `default_choice_id`, `offered_at_tick`, `expires_at_tick = current_tick + 30`, `resolved`, `resolved_choice_id`.

**Risk windows.** When a choice with `risk_window_ticks` is applied, `_apply_dilemma_choice` appends `{multiplier, expires_at_tick, source: "dilemma:<key>:<choice>"}` to `_temporary_hazard_effects` and logs `ELEVATED_RISK_WINDOW_OPENED` (`compliance_flag=False`, payload `dilemma_id`, `choice_id`, `hazard_multiplier`, `expires_at_tick`). `_evaluate_random_failures` multiplies the per-service failure probability by the product of all unexpired windows (pruned each tick). The list is part of the session snapshot, so an open window survives a restart.

**Reputation coupling.** `reputation_delta` is applied through `formulas.clamp_percentage` onto `engine.reputation` (Document 07 covers the thresholds and their hazard effect). The two gated dilemmas are the reputation feedback loop: sustained corner-cutting eventually brings a board intervention, sustained discipline eventually brings a promotion offer.

### 3.3 Data Contract — `dilemma_events` Table

File: `backend/app/models/dilemma.py` (table created by the initial Alembic revision, `8907816f55ab_initial_schema.py`):

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
| `expires_at_tick` | `INTEGER` | No | `offered_at_tick + 30` (the 30-tick decision window). |
| `resolved_at_tick` | `INTEGER` | Yes | `NULL` until resolved (by player choice or auto-expiry). |
| `resolved_choice_id` | `VARCHAR(50)` | Yes | The `choices[].id` selected; `NULL` until resolved. |
| `was_auto_resolved` | `BOOLEAN` | No, default `False` | `True` if resolution occurred via expiry rather than an explicit `POST` (§ 4.1) — a governance-relevant distinction, since an auto-resolved dilemma reflects the *default* board-approved fallback rather than an active player decision, directly analogous to the honest-disclosure pattern already established for the post-mortem SOP's fallback fields (Document 05 § 3.3). |
| `choices_json` | `TEXT` | No | `json.dumps(template["choices"])` — full snapshot of the two choices as offered, so a later `DILEMMA_POOL` content edit cannot retroactively alter what a historical dilemma actually presented. |

`GameSession` carries the matching relationship (`dilemma_events = relationship("DilemmaEvent", back_populates="session", cascade="all, delete-orphan")`) and `models/__init__.py` exports the model — same integration pattern as § 3 of `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md`. The row is upserted on offer and again on resolution (`_persist_dilemma_event`).

### 3.4 REST Endpoint — Resolving a Dilemma

File: `backend/app/api/v1/dilemmas.py`:

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

`_apply_dilemma_choice` applies the deltas (`tech_debt` through `clamp_tech_debt`; `user_happiness` and `reputation` through `clamp_percentage`), persists the `DilemmaEvent` row, opens the risk window if the choice has one, routes the budget delta through the financial choke point `_apply_financial_event` (category `dilemma_outcome`, which also writes the `DILEMMA_RESOLVED` audit row), clears `self.active_dilemma = None`, and reschedules `self.next_dilemma_tick = self.current_tick + random.randint(40, 60)`. A resolve call for an unknown/expired dilemma or choice id returns HTTP 400. After the REST command the engine pushes fresh state to WebSocket clients (`app/core/state_push.py`).

Audit event types owned by this document (plus `FEATURE_FREEZE_ENGAGED`/`FEATURE_FREEZE_LIFTED` in § 2.4 and `ELEVATED_RISK_WINDOW_OPENED` above):

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `DILEMMA_OFFERED` | New dilemma raised | `BOARD_OF_DIRECTORS` | `True` | `{"dilemma_id": string, "title": string}` |
| `DILEMMA_RESOLVED` | Player choice recorded or auto-expiry fires | `VP_OF_INFRA` (explicit) or `BOARD_OF_DIRECTORS` (auto-resolved) | `True` unless the resolved choice's `tech_debt_delta > 5` (a materially debt-injecting decision, flagged for reviewer attention exactly as `emergency_patch` overuse is flagged in Document 04 § 3) | `{"dilemma_id": string, "choice_id": string, "auto_resolved": bool, "budget_delta": float, "tech_debt_delta": int, "tech_debt_after": int, "happiness_delta": float, "reputation_delta": int, "reputation_after": float}` |

### 3.5 WebSocket Broadcast Payload

`TICK_BROADCAST` (§ 4 below covers the Topbar; this is the data contract) carries two keys for this document:

```python
"error_budget_remaining_ratio": round(self.error_budget_remaining_ratio, 4),
"feature_freeze_active": self.feature_freeze_active,
```

A dilemma offering is pushed as its own out-of-band frame (queued in `_pending_broadcasts` and flushed through the shared `_broadcast_json` helper described in `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md` § 5.2) when `_evaluate_cab_dilemma` creates one. A restored, still-open dilemma is re-queued on boot so the frontend learns about it. Each choice in the frame carries all four deltas plus the risk-window fields where present:

```json
{
  "type": "DILEMMA_OFFERED",
  "dilemma_id": "dil-4f9a21bc",
  "title": "Compressed Release Timeline",
  "narrative": "Product leadership requests skipping the full load-testing cycle to hit an external launch deadline.",
  "choices": [
    {"id": "skip", "label": "Skip load testing, ship on time", "budget_delta": 6000.0, "tech_debt_delta": 10, "happiness_delta": 2.0, "reputation_delta": -5, "risk_window_ticks": 15, "risk_multiplier": 1.35},
    {"id": "delay", "label": "Delay launch, run full test suite", "budget_delta": -4000.0, "tech_debt_delta": -1, "happiness_delta": -1.5, "reputation_delta": 4}
  ],
  "expires_at_tick": 347
}
```

---

## 4. UI/UX Specification

### 4.1 Topbar Error Budget Meter

`frontend/src/components/layout/Topbar.tsx` renders a **primary status cluster** (one bordered, elevated container shared by the critical ops metrics, with fixed-width pieces so nothing re-centers when a label changes): `DefconMeter`, `ShieldGauge` (SLA), `ErrorBudgetMeter` and `CreditCounter` (cash), separated by vertical dividers. The **secondary indicators** (tech debt, morale, reputation) sit beside it inline at widths >= 1720 px, or inside a labelled "Indicators" popover below that (see `08_QUALITY_GATES_AND_INSTALLABILITY_SPEC.md` § 5). Each meter is a small memoized component that subscribes only to its own telemetry value.

`frontend/src/components/common/ErrorBudgetMeter.tsx` (built on the shared `MeterShell`) renders a compact horizontal burn-down bar filled to `remainingRatio * 100`%, a rounded percentage and a per-tick delta tag. Colour comes from `errorBudgetBand` / `toneFor("errorBudget", band)` in `utils/kpiBands.ts`. When `frozen === true` the gauge icon becomes a snowflake and a "FREEZE" badge appears in a **reserved slot** (absolute-positioned) so the meter never changes width when the freeze toggles. `NaN`/`null`/infinite inputs fall back to a full, safe budget.

### 4.2 CAB Decision Modal

`frontend/src/components/modals/CABDilemmaModal.tsx`, mounted once at the app root (`App.tsx`) and driven by `useGameStore().activeDilemma`. It is built on the shared `Modal` with `role="alertdialog"`, **`layer="critical"`** (above every other overlay) and `closeOnBackdrop={false}`: the CAB decision cannot be dismissed, only answered or expired.

**Presentation:**

- **Draining deadline bar:** a `role="timer"` header shows whole seconds left (rounded up, so `0s` only ever means the window is over) and ticks left; a bar drains from the full 30-tick window to zero and shifts blue -> amber (<= 50%) -> red/pulsing (<= 20% or <= 5 s). Between two tick frames the bar glides using wall-clock time (`requestAnimationFrame`); with reduced motion it steps per tick. A countdown beep plays once per whole second in the final 5 s. All of this math is pure and unit-tested in `frontend/src/utils/cabDeadline.ts`.
- **Choice cards:** two choices side by side, each with four impact pills (runway, tech debt, morale, reputation); a pill is green when favorable (a tech-debt *decrease* counts as favorable) and red otherwise. Hovering or focusing a choice previews its effect in a footer row of live meters (`now -> projected`, using the engine's own clamps via `projectMeters`).
- **Outcome card:** after a pick, the card covers the choices ("The board decided..." + the deltas actually applied); if the window expires first, the card reads "The committee decided for you" with the default option applied and an amber hint. The outcome kind (explicit vs expired) is read from the `DILEMMA_RESOLVED` audit row (`auto_resolved`), then the dialog leaves after about 1.2 s (1.6 s for the expired case).

**Server-authoritative expiry:** the countdown is presentational. If it reaches zero client-side before the server confirms, the modal stays open in a "resolving..." state; a `success: false` response (the window closed under the click) also stays in that state until the next frame lets the reconcile effect show the committee's decision; a network failure returns to the deciding phase with an error toast. The store itself drops `activeDilemma` once `telemetry.tick >= expires_at_tick` or on a reset.

### 4.3 Zustand Store Extension

```typescript
interface GameStore {
  // ...
  activeDilemma: DilemmaOffer | null;
  setActiveDilemma: (dilemma: DilemmaOffer | null) => void;
}
```

`activeDilemma` is set by the WebSocket handler (`useSimulationSocket.ts`) on a `"type": "DILEMMA_OFFERED"` frame, cleared to `null` by the CAB modal after its outcome card, and cleared by the store when a `TICK_BROADCAST` shows `tick >= expires_at_tick` (or a reset). `DilemmaChoice` in `types/game.ts` includes `reputation_delta`.

### 4.4 i18n Extension

`errorBudget` and `cabDilemma` namespaces exist in `Translations` (`frontend/src/i18n/translations.ts`), and the modal's richer copy (deadline, outcome card, preview text) lives in `t.gameplayModals.cab` (`frontend/src/i18n/gameplayModals.ts`):

```typescript
errorBudget: { label: "Error Budget", remaining: (pct) => `${pct.toFixed(1)}% remaining`, featureFreezeActive: "FEATURE FREEZE ACTIVE" },
cabDilemma: {
  modalTitle: "Change Advisory Board — Decision Required",
  timeRemaining: (seconds) => `${seconds}s to decide`,
  choiceImpact: { budget: "Runway", techDebt: "Tech Debt", morale: "Morale", reputation: "Reputation" },
},
```

`pt-BR` and `es` are populated in parallel (`frontend/src/i18n/locales/`).

---

## 5. Non-Breaking Compliance Checklist

- [x] `SLA_BENCHMARK`, `SLA_BREACH_THRESHOLD`, and every other `formulas.py` constant are read, never modified by this system; `TOTAL_ERROR_BUDGET_PCT` is a derived constant.
- [x] `feature_freeze_active` gates only the `hotfix` category (`emergency_patch`), through a guard clause in `apply_mitigation` that is bypassed when the target service has an open incident; the other three runbooks (`rollback`, `scale_replicas`, `circuit_breaker`) are unaffected.
- [x] `TICK_BROADCAST` carries `error_budget_remaining_ratio` and `feature_freeze_active`; `DILEMMA_OFFERED` is a distinct, separately-typed frame, not a mutation of the tick contract.
- [x] `dilemma_events` is created by the initial Alembic revision; the error-budget history and temporary hazard windows are columns of the session snapshot (added by later Alembic revisions).
- [x] The Audit Ledger Data Dictionary catalogs the event types introduced here (`FEATURE_FREEZE_ENGAGED`/`LIFTED`, `DILEMMA_OFFERED`/`RESOLVED`, `ELEVATED_RISK_WINDOW_OPENED`); see `audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md` § 2 for the authoritative list.
- [x] The error-budget meter lives in the Topbar's primary status cluster and the CAB modal uses the shared `Modal` primitive on the `critical` layer; both use the project's shared HUD idioms (`MeterShell`, `HudPopover`, Tailwind tokens).
