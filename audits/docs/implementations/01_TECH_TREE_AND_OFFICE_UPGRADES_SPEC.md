# Tech Tree and Office Upgrades — Implementation Specification

**Document ID:** IZ-IMPL-01  
**Classification:** Implementation Contract / Technical Architecture Specification  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Integration baseline:** `backend/app/engine/formulas.py`, `backend/app/engine/simulator.py`, `backend/app/engine/upgrades.py`, `backend/app/models/upgrade.py`, `backend/app/api/v1/upgrades.py`, `frontend/src/components/dock/UpgradesTreePanel.tsx`, `frontend/src/components/dock/upgradeCatalog.ts`, `frontend/src/store/useGameStore.ts`

---

## 1. System Objective

Introduce a persistent, budget-gated capital-investment layer — the **Upgrade Shop** — that lets the player convert surplus runway budget into permanent, session-scoped modifiers on the core simulation formulas (Document 02: `formulas.py`). Upgrades are the strategic counterweight to the reactive runbook system (Document 04): where a mitigation heals one incident once, an upgrade permanently reshapes the odds and costs of every future tick. This system introduces no new failure modes to existing mechanics — it only attenuates or accelerates constants already defined in `formulas.py`, applied as multiplicative or additive hooks evaluated at the exact call sites those constants are already read from.

**Persistence and Resilience:** Upgrades are persisted in the `purchased_upgrades` table and are fully restored during process restart via `_try_restore_from_snapshot()`.

---

## 2. Upgrade Catalog

The catalog is a Python module-level constant, `UPGRADE_CATALOG`, defined in `backend/app/engine/upgrades.py`, mirroring the existing `MITIGATION_CATALOG` single-source-of-truth pattern in `formulas.py` (Document 04, § 1). Each upgrade is purchased at most once per session (no stacking/leveling in this phase — see § 3.1 for why the persistence schema nonetheless reserves a `level` column for forward compatibility).

| Upgrade ID | Display Name | Category | Cost | Prerequisite | Effect Hook | Modifier Value |
|---|---|---|---|---|---|---|
| `apm_tracing` | APM Distributed Tracing | `observability` | \$18,000.00 | None | `mtta_reduction_ticks` | Every incident's effective `mtta_seconds` used for regulatory-window checks (Document 02, § 4.2) is computed as `max(0, mtta_seconds - 2)` — a flat 2-tick head start toward acknowledgment thresholds. |
| `predictive_anomaly_detection` | Predictive Anomaly Detection | `observability` | \$32,000.00 | `apm_tracing` | `pre_alert_ticks` | Grants a 5-tick advance warning broadcast (`TYPE: PRE_ALERT_WARNING`, § 5.2) before a stochastically-selected service failure actually materializes as an `Incident` row. Does not change the underlying `cascading_failure_probability` — it only exposes the outcome of the hazard roll early. |
| `multi_az_clusters` | Multi-AZ Compute Clusters | `resilience` | \$45,000.00 | None | `cascade_hazard_multiplier` | Multiplies the output of `formulas.cascading_failure_probability(...)` by `0.60` (a 40% relative hazard reduction) before the `MAX_FAILURE_PROBABILITY` cap is applied. |
| `automated_cicd` | Automated CI/CD Pipelines | `resilience` | \$28,000.00 | None | `rollback_cost_multiplier`, `rollback_tdi_multiplier` | Multiplies the `rollback` runbook's `cost` field by `0.50` (\$1,800.00 → \$900.00) and its `tech_debt_delta` magnitude by `0.50` (−2 → −1, rounded toward zero) at the moment `apply_mitigation` resolves the `rollback` action. No other runbook in `MITIGATION_CATALOG` is affected. |
| `espresso_machine` | Commercial Espresso Machine | `facility` | \$9,500.00 | None | `happiness_drift_dampener` | Multiplies every negative `user_happiness` adjustment applied inside `_apply_happiness_drift` (both the outage penalty and the alert-fatigue penalty) by `0.75` — a 25% slower morale drop. Positive happiness recovery drift is unaffected. |
| `ergonomic_chairs` | Ergonomic Herman Miller Chairs | `facility` | \$14,000.00 | None | `engineer_fatigue_rate_multiplier` | Multiplies the `stress_gain_per_unacked_tick` constant consumed by the Staff On-Call engine (Document `03_STAFF_ONCALL_AND_FATIGUE_SPEC.md`, § 2.2) by `0.80` — a 20% slower stress accumulation rate for every on-duty engineer. This is a cross-system hook: it has no effect unless the Staff On-Call system (a sibling spec in this same directory) is also implemented; in isolation it is a no-op purchase that is still permitted and still billed, since the catalog is not aware of which other systems are live. |

This is the complete, exhaustive catalog for this implementation phase. No hidden tiers, no currency other than `budget`, and no upgrade with a `null` or TBD cost exists in this specification.

### 2.1 Prerequisite Enforcement

`predictive_anomaly_detection` is the only entry with a `prerequisite` field. The purchase endpoint (§ 4.2) MUST reject a purchase attempt for an upgrade whose `prerequisite` is not already present in the session's `purchased_upgrades` rows, returning HTTP 400 with `{"success": false, "error": "Prerequisite upgrade not yet purchased: apm_tracing"}`. This mirrors the existing budget-check rejection pattern in `apply_mitigation` (Document 04, § 2: `{"success": False, "error": "Insufficient budget runway"}`).

`backend/app/engine/upgrades.py` additionally runs `_validate_catalog_references()` at import time: any `prerequisite` that does not resolve to a real catalog id raises `ValueError`, so a typo can never leave an upgrade silently unpurchasable. The frontend mirrors the catalog's ids, costs, categories and prerequisites in `frontend/src/components/dock/upgradeCatalog.ts` (display copy lives in i18n).

---

## 3. Data & Persistence Contract

### 3.1 SQL Migration Schema — `purchased_upgrades`

The project uses **Alembic** (`backend/alembic/`, seven revisions at the time of this update; `backend/app/main.py` runs `command.upgrade(alembic_cfg, "head")` on boot; a legacy pre-Alembic SQLite file makes boot fail with an actionable error asking the operator to delete the regenerable database file). The `purchased_upgrades` table is created by the initial revision (`8907816f55ab_initial_schema.py`); any future column (for example a real `level` mechanic) requires a new Alembic revision, not a `create_all` edit. The SQLAlchemy model is exported from `backend/app/models/__init__.py`.

File: `backend/app/models/upgrade.py`

```python
from sqlalchemy import Column, String, Integer, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base


class PurchasedUpgrade(Base):
    """RECORDS A PERMANENT INFRASTRUCTURE OR FACILITY UPGRADE PURCHASED DURING A SESSION"""

    __tablename__ = "purchased_upgrades"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    upgrade_id = Column(String(50), nullable=False)
    level = Column(Integer, nullable=False, default=1)
    purchased_at_tick = Column(Integer, nullable=False)
    cost_paid = Column(Numeric(12, 2), nullable=False)

    session = relationship("GameSession", back_populates="purchased_upgrades")
```

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | `VARCHAR(36)` | No (PK) | Generated as `f"upg-{uuid.uuid4().hex[:8]}"`, following the `inc-`/`aud-` prefix convention established in `event_generator.py`. |
| `session_id` | `VARCHAR(36)` FK → `game_sessions.id`, `ON DELETE CASCADE` | No | Identical cascade-delete pattern to every other child table (`services`, `incidents`, `audit_logs`) — a session reset destroys purchase history along with everything else, consistent with the existing reset semantics documented in Document 03, § 2.1. |
| `upgrade_id` | `VARCHAR(50)` | No | Foreign key *by convention only* (not a DB-level `ForeignKey`, mirroring how `MitigationAction.id` is referenced from audit `details_json` rather than a hard FK — Document 05, `AUDIT_LEDGER_DATA_DICTIONARY.md`, § 4) into `UPGRADE_CATALOG`'s `id` field. |
| `level` | `INTEGER` | No, default `1` | Reserved for a future stacking/leveling mechanic. In this phase every purchase writes exactly `level=1` and the purchase endpoint rejects a second purchase of the same `upgrade_id` in the same session (§ 4.2) — the column is reserved so a future leveling feature does not need to reshape the table. |
| `purchased_at_tick` | `INTEGER` | No | `SimulationEngine.current_tick` at the moment of purchase — same provenance pattern as `Incident.created_tick`. |
| `cost_paid` | `NUMERIC(12,2)` | No | The exact amount deducted from `budget`, captured at purchase time so a later change to `UPGRADE_CATALOG` pricing does not retroactively misrepresent what a historical purchase actually cost — the same historical-accuracy rationale documented for `RUNBOOK_EXECUTED.cost` in Document 05, § 3.3. |

**`GameSession`** (`backend/app/models/session.py`) carries the matching relationship line in its relationship block —

```python
purchased_upgrades = relationship("PurchasedUpgrade", back_populates="session", cascade="all, delete-orphan")
```

It sits beside the existing `services`, `incidents`, and `audit_logs` relationships.

**`backend/app/models/__init__.py`** exports the model:

```python
from app.models.upgrade import PurchasedUpgrade
# ...
__all__ = ["Base", "GameSession", "Service", "Incident", "MitigationAction", "AuditLog", "PurchasedUpgrade"]
```

### 3.2 In-Memory Engine State

Following the established pattern where `SimulationEngine` holds authoritative in-memory state mirrored to SQLite on each tick (Document 01, § "State Immutability Safeguards"), `SimulationEngine.__init__` (`backend/app/engine/simulator.py`) holds:

```python
self.purchased_upgrade_ids: Set[str] = set()
```

The set is emptied on reset, appended to on each successful purchase, and **rebuilt from the `purchased_upgrades` table by `_try_restore_from_snapshot()`** after a process restart, so purchases survive a crash. It is the runtime source of truth `apply_mitigation`, `_apply_happiness_drift`, and `_evaluate_random_failures` consult via the modifier hooks in § 2 — the SQL table (§ 3.1) is the durable audit record, not the hot-path read source, exactly mirroring how `self.incidents` (a Python list) is the hot-path source while the `incidents` table is the durable mirror (Document 01, § "Persistence Layer").

---

## 4. REST Endpoints

### 4.1 `GET /api/upgrades/catalog`

File: `backend/app/api/v1/upgrades.py`, registered in `backend/app/api/router.py` through `api_router.include_router(upgrades.router)`.

```python
@router.get("/api/upgrades/catalog")
async def get_upgrade_catalog() -> List[Dict[str, Any]]:
    """RETRIEVE THE FULL INFRASTRUCTURE AND FACILITY UPGRADE CATALOG"""
    return UPGRADE_CATALOG
```

Returns the full § 2 catalog verbatim as JSON, mirroring `GET /api/mitigations/catalog`'s contract exactly (Document 01, § REST endpoint table).

### 4.2 `POST /api/upgrades/{id}/purchase`

```python
@router.post("/api/upgrades/{upgrade_id}/purchase")
async def purchase_upgrade(upgrade_id: str, request: Request) -> Dict[str, Any]:
    """PURCHASE A PERMANENT INFRASTRUCTURE OR FACILITY UPGRADE"""
    engine = request.app.state.engine
    result = engine.purchase_upgrade(upgrade_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Upgrade purchase failed"))
    return result
```

`SimulationEngine.purchase_upgrade` (`backend/app/engine/simulator.py`) as implemented:

```python
def purchase_upgrade(self, upgrade_id: str) -> Dict[str, Any]:
    """PURCHASE A PERMANENT UPGRADE, VALIDATING PREREQUISITES AND BUDGET"""
    upgrade = upgrades.find_upgrade(upgrade_id)
    if not upgrade:
        return {"success": False, "error": "Unknown upgrade id"}
    if upgrade_id in self.purchased_upgrade_ids:
        return {"success": False, "error": "Upgrade already purchased"}
    prereq = upgrade.get("prerequisite")
    if prereq and prereq not in self.purchased_upgrade_ids:
        return {"success": False, "error": f"Prerequisite upgrade not yet purchased: {prereq}"}
    if self.budget < upgrade["cost"]:
        return {"success": False, "error": "Insufficient budget runway"}

    self.purchased_upgrade_ids.add(upgrade_id)
    self._persist_upgrade_purchase(upgrade_id, upgrade["cost"])
    self._apply_financial_event(
        category="upgrade_purchase",
        amount=-upgrade["cost"],
        reference=upgrade_id,
        audit_event_type="UPGRADE_PURCHASED",
        audit_details={"upgrade_id": upgrade_id, "cost": upgrade["cost"], "category": upgrade["category"]},
    )
    return {"success": True, "upgrade_id": upgrade_id, "budget": self.budget}
```

`_persist_upgrade_purchase` follows the `db.add(...)` / `db.commit()` / `finally: db.close()` pattern used by `_persist_incident`. The budget deduction and the audit row both go through the single financial choke point `_apply_financial_event` (category `upgrade_purchase`), which also feeds the in-memory financial ledger; that ledger is reconstructed from `UPGRADE_PURCHASED` audit rows on restore. Like every REST command, a successful purchase triggers an immediate state push to WebSocket clients (`app/core/state_push.py`), so the dock reflects ownership without waiting for the next tick.

**Audit event type — `UPGRADE_PURCHASED`:** one entry in the closed set of event types enumerated in the Audit Ledger Data Dictionary (`audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md`, § 2; the ledger now carries more than thirty event types, so no count is repeated here). It is a financial event: its `cost` is what the engine replays on restore to rebuild the in-memory financial ledger.

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `UPGRADE_PURCHASED` | `POST /api/upgrades/{id}/purchase` succeeds | `VP_OF_INFRA` | `True` | `{"upgrade_id": string, "cost": float, "category": string}` |

### 4.3 Modifier Hook Integration Points in `formulas.py`

No function signature in `formulas.py` is altered by upgrades. Each modifier is applied by the **caller** (`simulator.py`), which already holds `self.purchased_upgrade_ids`, immediately before or after invoking the pure formula function — preserving `formulas.py`'s documented purity guarantee ("kept free of engine state so each function is independently testable," `formulas.py:1-4`, Document 02 § 0). Four call sites carry upgrade modifiers (snippets are simplified: the real call sites also fold in scenario, difficulty, reputation, specialist and infrastructure multipliers described in the sibling specs):

1. **`_evaluate_random_failures`** — hazard multiplier:
   ```python
   failure_probability = formulas.cascading_failure_probability(self.tech_debt, dep_statuses)
   # ... exposure / specialist / scenario multipliers ...
   if "multi_az_clusters" in self.purchased_upgrade_ids:
       failure_probability *= 0.60
   # ... infrastructure / difficulty / reputation multipliers ...
   failure_probability = formulas.clamp_probability(failure_probability)  # the only cap, applied last
   ```
2. **`_progress_incidents`** — MTTA reduction for regulatory-window checks only (the raw `mtta_seconds` counter stored on the incident and shown in the UI is NOT altered, preserving Document 05 §3.3's MTTA field semantics; only the *breach evaluation* uses the adjusted value):
   ```python
   effective_mtta = inc["mtta_seconds"]
   if "apm_tracing" in self.purchased_upgrade_ids:
       effective_mtta = max(0, effective_mtta - 2)
   # a competency-matched engineer (specialist quality >= 0.7) shaves a further tick (Document 03)
   if formulas.is_unattended_breach(effective_mtta):
       ...
   ```
3. **`_apply_happiness_drift`** — happiness dampener, applied as a multiplier on every negative delta:
   ```python
   dampener = 0.75 if "espresso_machine" in self.purchased_upgrade_ids else 1.0
   self.user_happiness = formulas.happiness_after_outage_drift(self.user_happiness, any_unhealthy, dampener)
   # and, within the per-incident alert-fatigue loop:
   self.user_happiness = formulas.happiness_after_alert_fatigue(self.user_happiness, penalty, dampener)
   ```
4. **`apply_mitigation`** — rollback cost/TDI reduction, applied only when `action_id == "rollback"`:
   ```python
   effective_cost = action["cost"]
   effective_tdi_delta = action["tech_debt_delta"]
   if action_id == "rollback" and "automated_cicd" in self.purchased_upgrade_ids:
       effective_cost *= 0.50
       effective_tdi_delta = int(effective_tdi_delta * 0.50)
   ```
   with `effective_cost`/`effective_tdi_delta` substituted for `action["cost"]`/`action["tech_debt_delta"]` in every subsequent line of the method body (the budget deduction, the TDI clamp, and the `RUNBOOK_EXECUTED` audit payload — the ledger must record what was actually charged, not the catalog's list price, consistent with the historical-accuracy rationale in § 3.1).

`ergonomic_chairs` is applied inside the staff stress loop (`gain *= 0.80` on the per-tick stress gain of an unacknowledged alarm, Document 03). `predictive_anomaly_detection`'s pre-alert mechanic (§ 5.2) is the one hook that is not a formula modifier but a delayed-materialization queue plus a broadcast side-channel, detailed below.

---

## 5. WebSocket and State Broadcast Extensions

### 5.1 `TICK_BROADCAST` Additive Field

`SimulationEngine.get_state_payload()` (Document 01, § Architectural Data Flow) includes the key below (consumers key-access by name, never positionally):

```python
"purchased_upgrades": sorted(self.purchased_upgrade_ids),
```

On the client, `TelemetryState.purchased_upgrades: string[]` (`frontend/src/types/game.ts`) receives it. Note that `backend/app/schemas/websocket.py` (`SimulationTickPayload`) is a legacy, narrower Pydantic model that does **not** list this field: the live broadcast is the plain dict built by `get_state_payload()`, which is the real contract.

### 5.2 New Broadcast Type — `PRE_ALERT_WARNING`

`predictive_anomaly_detection` requires the hazard-roll evaluation in `_evaluate_random_failures` to distinguish "roll succeeded, materialize immediately" (current behavior, unchanged for all players without the upgrade) from "roll succeeded, queue a 5-tick delayed materialization with an advance broadcast" (new behavior, gated behind upgrade ownership). This is implemented as an engine-internal queue, not a mutation of the existing incident-creation path:

```python
PRE_ALERT_LEAD_TICKS = 5                              # module constant in simulator.py
self.pending_pre_alerts: List[Dict[str, Any]] = []    # in __init__
self._pending_broadcasts: List[Dict[str, Any]] = []   # out-of-band frames, flushed by the tick loop
```

The `_evaluate_random_failures` branch:

```python
if random.random() < failure_probability:
    if "predictive_anomaly_detection" in self.purchased_upgrade_ids:
        self._queue_pre_alert(srv)      # appends {"service_id", "fire_at_tick": tick + 5} and queues the frame
    else:
        self._trigger_service_failure(srv)
```

`_progress_pre_alerts` (called from `_update_simulation_tick`) materializes the failure with `_trigger_service_failure(srv)` once `self.current_tick >= fire_at_tick`, **but only if the service is still `healthy` at that tick** (a service already degraded by another cause is not failed twice); the entry is then removed from `pending_pre_alerts`. The queue is cleared on reset and is not persisted across a process restart.

The out-of-band `PRE_ALERT_WARNING` message is sent as a **separate WebSocket frame**, not merged into `TICK_BROADCAST`: `_queue_pre_alert` appends it to `_pending_broadcasts`, `flush_pending_broadcasts()` (called from `_run_loop`) drains it, and both that path and `broadcast_state` fan out through the shared `_broadcast_json(payload)` helper. `TICK_BROADCAST`'s shape therefore stays stable.

```json
{
  "type": "PRE_ALERT_WARNING",
  "service_id": "srv-payment",
  "ticks_remaining": 5
}
```

`frontend/src/hooks/useSimulationSocket.ts` dispatches on `type`: `PRE_ALERT_WARNING` becomes a `warning` floating text (`floatingTexts.preAlertWarning(service_id, ticks_remaining)`), and unrecognized frame types are ignored so the handler stays forward-compatible (the socket also handles `DILEMMA_OFFERED` and `ACHIEVEMENT_UNLOCKED`).

---

## 6. UI/UX Specification

### 6.1 Dock Tab (`UpgradesTreePanel`)

`frontend/src/components/layout/BottomDock.tsx` defines `type DockTab = "incidents" | "directives" | "compliance" | "upgrades" | "roster" | "achievements" | "metrics"`. The upgrades tab is registered with the lucide `TrendingUp` icon, the label `t.upgrades.header`, the **`U` hotkey**, and a badge that counts the upgrades the player could buy right now (`countAffordableUpgrades(budget, purchased)` in `upgradeCatalog.ts`: not owned, prerequisite met, `budget >= cost`); the badge is hidden while the tab is open. The tab body renders `<UpgradesTreePanel />`.

The earlier flat-grid `UpgradesPanel.tsx` has been **removed**; `UpgradesTreePanel.tsx` is the only upgrades UI.

### 6.1.1 Tree Layout and Card States

1. **Three branch columns:** on wide screens (`lg:grid-cols-3`) the panel shows one column per branch — Observability, Resilience, Facility & Ergonomics — so the whole tree is visible at a glance inside the short dock; narrow screens stack the branches. Each column has a coloured category header (cyan / violet / amber).
2. **Dependency connectors:** a root upgrade renders as a card; its children (`predictive_anomaly_detection` under `apm_tracing`) are indented beneath it behind a dashed vertical connector line and a "next tier" label (`CornerDownRight` glyph). The tree is built by grouping the catalog by `prerequisite`, so any future prerequisite chain nests the same way. (The connectors are CSS borders, not SVG paths.)
3. **Card states:** *owned* — emerald border, check mark and "Owned" label; *locked* (prerequisite missing) — dimmed slate border, padlock and "Requires: <name>"; *unaffordable* — neutral border with the cost and an amber "short by $X" hint; *available* — neutral border that lights up on hover, showing the cost as a plain neutral price (red is reserved for alarms). A card is disabled when owned, locked, unaffordable or while its request is pending.
4. **Purchase flow:** a click runs `api.purchaseUpgrade(id)` through `runExclusive`, which keeps the card pending until telemetry shows the upgrade as owned (a double click cannot buy twice). On success the UI shows floating text, a budget KPI delta and the cash sound; on a rejected purchase it shows the server error (or the localized "Insufficient budget runway").

### 6.2 `api.ts` Client Methods

`frontend/src/services/api.ts` exposes:

```typescript
getUpgradesCatalog: () => request<Upgrade[]>("/api/upgrades/catalog"),
purchaseUpgrade: (upgradeId: string) =>
  request<{ success: boolean; upgrade_id: string; budget: number }>(`/api/upgrades/${upgradeId}/purchase`, {
    method: "POST",
  }),
```

The panel itself renders from the static mirror in `upgradeCatalog.ts`; `getUpgradesCatalog` is available for tooling and tests.

### 6.3 Zustand Store Extension

`frontend/src/types/game.ts`'s `TelemetryState` interface carries one typed field matching § 5.1's broadcast key:

```typescript
export interface TelemetryState {
  // ...existing fields unchanged...
  purchased_upgrades: string[];
}
```

and `useGameStore.ts`'s `INITIAL_TELEMETRY` constant holds the matching bootstrap value `purchased_upgrades: []`, consistent with every other array field's empty-array initial state.

### 6.4 i18n Extension

`frontend/src/i18n/translations.ts`'s `Translations` interface has a top-level `upgrades` namespace (typed with `UpgradeCategoryKey` and `UpgradeActionId` aliases), following the shape convention of the `mitigations` namespace. The panel's hint strings (`requires`, `shortBy`, `nextTier`, `buyTitle`) live in `t.hud.upgrades`; the pre-alert toast lives in `t.floatingTexts.preAlertWarning`.

```typescript
upgrades: {
  header: string;
  categories: Record<"observability" | "resilience" | "facility", string>;
  actions: Record<
    "apm_tracing" | "predictive_anomaly_detection" | "multi_az_clusters" | "automated_cicd" | "espresso_machine" | "ergonomic_chairs",
    { name: string; description: string }
  >;
  purchase: string;
  owned: string;
  prerequisiteLocked: (upgradeName: string) => string;
  insufficientBudget: string;
};
```

English (`en`) values for the `TRANSLATIONS` record:

```typescript
upgrades: {
  header: "Upgrades",
  categories: {
    observability: "Observability",
    resilience: "Resilience",
    facility: "Facility & Ergonomics",
  },
  actions: {
    apm_tracing: { name: "APM Distributed Tracing", description: "Reduces effective MTTA by 2 ticks for regulatory breach evaluation." },
    predictive_anomaly_detection: { name: "Predictive Anomaly Detection", description: "Warns of an incoming failure 5 ticks before it materializes." },
    multi_az_clusters: { name: "Multi-AZ Compute Clusters", description: "Reduces cascading failure hazard by 40%." },
    automated_cicd: { name: "Automated CI/CD Pipelines", description: "Halves the cost and technical debt penalty of the Rollback runbook." },
    espresso_machine: { name: "Commercial Espresso Machine", description: "Slows morale decline by 25%." },
    ergonomic_chairs: { name: "Ergonomic Herman Miller Chairs", description: "Reduces on-call engineer fatigue accumulation by 20%." },
  },
  purchase: "Purchase",
  owned: "Owned",
  prerequisiteLocked: (upgradeName) => `Requires: ${upgradeName}`,
  insufficientBudget: "Insufficient budget runway",
},
```

The `pt-BR` and `es` locale files (`frontend/src/i18n/locales/`) carry parallel, fully-translated values — the project ships no partially-translated namespace. The English block above is the source text those translations derive from.

### 6.5 In-Game Hardware FX

**Predictive Anomaly Aura (`ServerRack.tsx`):** when `predictive_anomaly_detection` is owned, a rack whose service is still `healthy` but shows simmering telemetry (`latency_ms > 110` or `error_rate > 0.012`) renders a dashed, pulsing amber halo at the rack foundation (`animate-pulse`) and a small warning badge overhead (tooltip `t.officeLife.predictiveAnomaly`), giving the operator an early-warning cue before the incident materializes. This complements, and does not replace, the `PRE_ALERT_WARNING` toast of § 5.2.

---

## 7. Non-Breaking Compliance Checklist

- [x] `purchased_upgrades` is created by the initial Alembic revision; no existing column was altered for upgrades.
- [x] Two routes added (`GET /api/upgrades/catalog`, `POST /api/upgrades/{id}/purchase`); no existing route changed.
- [x] `TICK_BROADCAST`'s existing keys are unchanged; `purchased_upgrades` is an additional key (the client defaults it to `[]`).
- [x] The store gained one field (`telemetry.purchased_upgrades`); `setTelemetry` remains the single entry point for whole-telemetry updates.
- [x] The `upgrades` namespace is filled in for all three locales (en, pt-BR, es) together, per the project's i18n completeness convention.
- [x] No existing `formulas.py` function signature changed; all four modifier hooks are applied at the call site in `simulator.py`, preserving `formulas.py`'s pure-function contract.
- [x] `UPGRADE_PURCHASED` is catalogued in the Audit Ledger Data Dictionary; no other event type's trigger, actor, or payload schema is affected.
- [x] `UpgradesTreePanel.tsx` is the dock's upgrades tab (hotkey `[U]`); the legacy `UpgradesPanel.tsx` no longer exists.
