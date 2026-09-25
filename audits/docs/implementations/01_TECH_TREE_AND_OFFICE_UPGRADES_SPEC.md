# Tech Tree and Office Upgrades — Implementation Specification

**Document ID:** IZ-IMPL-01
**Classification:** Implementation Contract / Next-Phase Architecture Blueprint
**Status:** Approved for implementation — additive only, non-breaking against the current codebase baseline documented in `audits/docs/01_SYSTEM_ARCHITECTURE_AND_DATA_FLOW.md` through `audits/docs/05_POST_MORTEM_STANDARD_OPERATING_PROCEDURE.md`
**Integration baseline:** `backend/app/engine/formulas.py`, `backend/app/engine/simulator.py`, `backend/app/models/`, `backend/app/api/v1/`, `frontend/src/components/layout/BottomDock.tsx`, `frontend/src/store/useGameStore.ts`, `frontend/src/i18n/translations.ts`

---

## 1. System Objective

Introduce a persistent, budget-gated capital-investment layer — the **Upgrade Shop** — that lets the player convert surplus runway budget into permanent, session-scoped modifiers on the core simulation formulas (Document 02: `formulas.py`). Upgrades are the strategic counterweight to the reactive runbook system (Document 04): where a mitigation heals one incident once, an upgrade permanently reshapes the odds and costs of every future tick. This system introduces no new failure modes to existing mechanics — it only attenuates or accelerates constants already defined in `formulas.py`, applied as multiplicative or additive hooks evaluated at the exact call sites those constants are already read from.

**Non-breaking guarantee:** no existing column, endpoint, WebSocket field, Zustand store field, or i18n key is renamed, removed, or given new required semantics. Every artifact introduced here is either a new table, a new endpoint, a new optional broadcast field, or a new UI surface reachable only through a net-new tab.

---

## 2. Upgrade Catalog

The catalog is a Python module-level constant, `UPGRADE_CATALOG`, defined in a new file `backend/app/engine/upgrades.py`, mirroring the existing `MITIGATION_CATALOG` single-source-of-truth pattern in `formulas.py` (Document 04, § 1). Each upgrade is purchased at most once per session (no stacking/leveling in this phase — see § 3.1 for why the persistence schema nonetheless reserves a `level` column for forward compatibility).

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

---

## 3. Data & Persistence Contract

### 3.1 SQL Migration Schema — `purchased_upgrades`

No migration framework (Alembic or otherwise) exists in the current codebase (Document 01 confirms schema creation is via `Base.metadata.create_all(bind=db_engine)` in `backend/app/main.py`, § `lifespan`). This table is therefore introduced the same way every existing table is: as a new SQLAlchemy model class, additive to `backend/app/models/__init__.py`'s `__all__` export list, picked up automatically by the existing `create_all` call with **zero changes to `main.py`**.

New file: `backend/app/models/upgrade.py`

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
| `level` | `INTEGER` | No, default `1` | Reserved for a future stacking/leveling mechanic. In this phase every purchase writes exactly `level=1` and the purchase endpoint rejects a second purchase of the same `upgrade_id` in the same session (§ 4.2) — the column exists now so that a future leveling feature does not require an additive-but-disruptive schema migration later. |
| `purchased_at_tick` | `INTEGER` | No | `SimulationEngine.current_tick` at the moment of purchase — same provenance pattern as `Incident.created_tick`. |
| `cost_paid` | `NUMERIC(12,2)` | No | The exact amount deducted from `budget`, captured at purchase time so a later change to `UPGRADE_CATALOG` pricing does not retroactively misrepresent what a historical purchase actually cost — the same historical-accuracy rationale documented for `RUNBOOK_EXECUTED.cost` in Document 05, § 3.3. |

**Required additive edit to `GameSession`** (`backend/app/models/session.py`): add one relationship line to the existing relationship block —

```python
purchased_upgrades = relationship("PurchasedUpgrade", back_populates="session", cascade="all, delete-orphan")
```

This is a pure addition beside the existing `services`, `incidents`, and `audit_logs` relationships; it does not alter any existing column or relationship.

**Required additive edit to `backend/app/models/__init__.py`:**

```python
from app.models.upgrade import PurchasedUpgrade
# ...
__all__ = ["Base", "GameSession", "Service", "Incident", "MitigationAction", "AuditLog", "PurchasedUpgrade"]
```

### 3.2 In-Memory Engine State

Following the established pattern where `SimulationEngine` holds authoritative in-memory state mirrored to SQLite on each tick (Document 01, § "State Immutability Safeguards"), a new attribute is added to `SimulationEngine.__init__` (`backend/app/engine/simulator.py`):

```python
self.purchased_upgrade_ids: Set[str] = set()
```

This is populated on `_persist_bootstrap`/`reset` (empty set) and appended to on each successful purchase. It is the runtime source of truth `apply_mitigation`, `_apply_happiness_drift`, and `_evaluate_random_failures` consult via the modifier hooks in § 2 — the SQL table (§ 3.1) is the durable audit record, not the hot-path read source, exactly mirroring how `self.incidents` (a Python list) is the hot-path source while the `incidents` table is the durable mirror (Document 01, § "Persistence Layer").

---

## 4. REST Endpoints

### 4.1 `GET /api/upgrades/catalog`

New file: `backend/app/api/v1/upgrades.py`, registered additively in `backend/app/api/router.py` via one new line: `api_router.include_router(upgrades.router)` — appended after the existing `audits.router` line, not replacing it.

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

New `SimulationEngine.purchase_upgrade` method (`backend/app/engine/simulator.py`), added beside `apply_mitigation` under the existing `# --- player actions ---` section marker:

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

    self.budget -= upgrade["cost"]
    self.purchased_upgrade_ids.add(upgrade_id)
    self._persist_upgrade_purchase(upgrade_id, upgrade["cost"])
    self._log_audit_event(
        event_type="UPGRADE_PURCHASED",
        actor="VP_OF_INFRA",
        details={"upgrade_id": upgrade_id, "cost": upgrade["cost"], "category": upgrade["category"]},
        compliance_flag=True,
    )
    return {"success": True, "upgrade_id": upgrade_id, "budget": self.budget}
```

`_persist_upgrade_purchase` follows the exact `db.add(...)` / `db.commit()` / `finally: db.close()` pattern already used by `_persist_incident` (Document 05, `simulator.py` reference).

**New audit event type — `UPGRADE_PURCHASED`:** this is an *additive* ninth entry to the eight-entry closed set enumerated in the Audit Ledger Data Dictionary (`audits/specs/AUDIT_LEDGER_DATA_DICTIONARY.md`, § 2). Implementing this spec requires updating that document's enumerated-event-types table from 8 to 9 rows — the only change this specification requires to a previously-published compliance document, and it is additive (a new row, not a modification of the existing eight).

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `UPGRADE_PURCHASED` | `POST /api/upgrades/{id}/purchase` succeeds | `VP_OF_INFRA` | `True` | `{"upgrade_id": string, "cost": float, "category": string}` |

### 4.3 Modifier Hook Integration Points in `formulas.py`

Per the "strictly additive" constraint, no existing function signature in `formulas.py` changes. Instead, each modifier is applied by the **caller** (`simulator.py`), which already holds `self.purchased_upgrade_ids`, immediately before or after invoking the pure formula function — preserving `formulas.py`'s documented purity guarantee ("kept free of engine state so each function is independently testable," `formulas.py:1-4`, Document 02 § 0). Four call sites change:

1. **`_evaluate_random_failures`** — hazard multiplier:
   ```python
   failure_probability = formulas.cascading_failure_probability(self.tech_debt, dep_statuses)
   if "multi_az_clusters" in self.purchased_upgrade_ids:
       failure_probability *= 0.60
   ```
2. **`_progress_incidents`** — MTTA reduction for regulatory-window checks only (the raw `mtta_seconds` counter stored on the incident and shown in the UI is NOT altered, preserving Document 05 §3.3's MTTA field semantics; only the *breach evaluation* uses the adjusted value):
   ```python
   effective_mtta = inc["mtta_seconds"]
   if "apm_tracing" in self.purchased_upgrade_ids:
       effective_mtta = max(0, effective_mtta - 2)
   if formulas.is_unattended_breach(effective_mtta):
       ...
   ```
3. **`_apply_happiness_drift`** — happiness dampener, applied as a multiplier on every negative delta:
   ```python
   dampener = 0.75 if "espresso_machine" in self.purchased_upgrade_ids else 1.0
   self.user_happiness = max(5.0, self.user_happiness - 0.7 * dampener)
   # and, within the per-incident alert-fatigue loop:
   self.user_happiness = max(0.0, self.user_happiness - penalty * dampener)
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

`predictive_anomaly_detection`'s pre-alert mechanic (§ 5.2) is the one hook that is not a formula modifier but a new broadcast side-channel, detailed below.

---

## 5. WebSocket and State Broadcast Extensions

### 5.1 `TICK_BROADCAST` Additive Field

`SimulationEngine.get_state_payload()` (Document 01, § Architectural Data Flow) gains one new key, appended after the existing `recent_audits` key so no consumer that positionally destructures the object (none currently do — all consumers key-access by name) is affected:

```python
"purchased_upgrades": sorted(self.purchased_upgrade_ids),
```

The corresponding Pydantic contract (`backend/app/schemas/websocket.py`) gains a matching optional field with a default, preserving backward-compatible deserialization for any client still running the previous schema:

```python
purchased_upgrades: List[str] = []
```

### 5.2 New Broadcast Type — `PRE_ALERT_WARNING`

`predictive_anomaly_detection` requires the hazard-roll evaluation in `_evaluate_random_failures` to distinguish "roll succeeded, materialize immediately" (current behavior, unchanged for all players without the upgrade) from "roll succeeded, queue a 5-tick delayed materialization with an advance broadcast" (new behavior, gated behind upgrade ownership). This is implemented as a new engine-internal queue, not a mutation of the existing incident-creation path:

```python
self.pending_pre_alerts: List[Dict[str, Any]] = []  # added to __init__
```

Modified `_evaluate_random_failures` branch:

```python
if random.random() < failure_probability:
    if "predictive_anomaly_detection" in self.purchased_upgrade_ids:
        self.pending_pre_alerts.append({"service_id": srv["id"], "fire_at_tick": self.current_tick + 5})
        await_broadcast = {"type": "PRE_ALERT_WARNING", "service_id": srv["id"], "ticks_remaining": 5}
        # queued for the next broadcast_state() call via self._out_of_band_events, see below
    else:
        self._trigger_service_failure(srv)
```

A new `_progress_pre_alerts` step (invoked from `_update_simulation_tick`, alongside `_progress_incidents`) decrements `ticks_remaining` each tick and calls `_trigger_service_failure(srv)` once `self.current_tick >= fire_at_tick`, removing the entry from `pending_pre_alerts`. This is an **additive tick-loop step**: it is inserted into the existing sequential call chain in `_update_simulation_tick` without reordering or removing any existing call.

The out-of-band `PRE_ALERT_WARNING` message is sent as a **separate WebSocket frame**, not merged into `TICK_BROADCAST`, using the existing `broadcast_state`-style fan-out loop (Document 01, § WS Broadcaster) factored into a small reusable `_broadcast_json(payload: dict)` helper that both `broadcast_state` (unchanged call site) and the new pre-alert path invoke. This keeps `TICK_BROADCAST`'s shape completely stable (no new required field to parse every tick) while still delivering the warning promptly rather than waiting for the next tick's regular frame.

```json
{
  "type": "PRE_ALERT_WARNING",
  "service_id": "srv-payment",
  "ticks_remaining": 5
}
```

Frontend clients that do not recognize `"type": "PRE_ALERT_WARNING"` MUST ignore unknown `type` values in their WebSocket message handler — this is already the required behavior per Document 01's WS contract, since `TICK_BROADCAST` is the only `type` currently emitted and any forward-compatible client already needs a `switch`/`if` dispatch keyed on `type` rather than assuming every frame is a tick update.

---

## 6. UI/UX Specification

### 6.1 New Dock Tab

`frontend/src/components/layout/BottomDock.tsx` currently defines `type DockTab = "incidents" | "directives" | "compliance"` (three tabs, Document 01 § Component Inventory). This is extended additively:

```typescript
type DockTab = "incidents" | "directives" | "compliance" | "upgrades";
```

with one new entry appended to the `tabs` array (using a new icon import, e.g. `TrendingUp` from `lucide-react`, already a dependency per the existing `AlertTriangle`/`Wrench`/`ScrollText` imports):

```typescript
{ id: "upgrades", label: t.upgrades.header, icon: TrendingUp },
```

and one new conditional render branch alongside the existing three:

```tsx
{activeTab === "upgrades" && <UpgradesPanel />}
```

`UpgradesPanel` is a new component, `frontend/src/components/dock/UpgradesPanel.tsx`, structurally mirroring `MitigationsPanel.tsx`'s existing catalog-grid-plus-buy-button layout (Document 04, § "As-Implemented Mechanics" describes the client-side cooldown pattern that `MitigationsPanel` already implements; `UpgradesPanel` reuses the same `api.ts` client-call idiom but against `/api/upgrades/*` instead of `/api/mitigations/*`).

Each upgrade card renders: display name, category badge (color-coded per `observability`/`resilience`/`facility`, extending the existing category-badge palette already used for `deployment`/`compute`/`resilience`/`emergency` mitigation categories), cost, a locked/owned/prerequisite-missing state, and a "Purchase" button disabled when `budget < cost`, when already owned, or when the prerequisite is unmet — the disabled-state pattern already exists in `MitigationsPanel.tsx`'s cooldown-disabled button and `CooldownButton.tsx` (`frontend/src/components/common/CooldownButton.tsx`), reused here rather than reimplemented.

### 6.2 Required `api.ts` Client Methods

Additive methods appended to `frontend/src/services/api.ts`, following the existing method-per-endpoint convention (e.g. `getMitigationsCatalog`, `executeMitigation`):

```typescript
getUpgradesCatalog: () => request<UpgradeAction[]>("/api/upgrades/catalog"),
purchaseUpgrade: (upgradeId: string) =>
  request<{ success: boolean; upgrade_id: string; budget: number }>(`/api/upgrades/${upgradeId}/purchase`, {
    method: "POST",
  }),
```

### 6.3 Zustand Store Extension

`frontend/src/types/game.ts`'s `TelemetryState` interface gains one new optional-in-practice-but-typed-required field, matching § 5.1's default-populated broadcast field:

```typescript
export interface TelemetryState {
  // ...existing fields unchanged...
  purchased_upgrades: string[];
}
```

and `useGameStore.ts`'s `INITIAL_TELEMETRY` constant gains the matching bootstrap value `purchased_upgrades: []`, consistent with every other array field's empty-array initial state (`services: []`, `active_incidents: []`, `recent_audits: []`). No existing store action, selector, or field is renamed or removed.

### 6.4 i18n Extension

`frontend/src/i18n/translations.ts`'s `Translations` interface gains one new top-level namespace, `upgrades`, following the exact shape convention of the existing `mitigations` namespace:

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

The `pt-BR` and `es` entries in the same `TRANSLATIONS` record MUST be populated with parallel, fully-translated values before merge (the existing three-locale pattern in `translations.ts` has no precedent for a partially-translated namespace shipping to production) — the English block above is the authoritative source text those two translations are derived from.

---

## 7. Non-Breaking Compliance Checklist

- [x] No existing SQL column altered or dropped; `purchased_upgrades` is a wholly new table.
- [x] No existing REST route path or method changed; two new routes added.
- [x] `TICK_BROADCAST`'s existing keys are all unchanged; one new key appended with a safe default.
- [x] No existing Zustand store field, action, or selector renamed; one new field, no new required store method beyond internal `setTelemetry` (already the single entry point for whole-telemetry updates).
- [x] No existing i18n key removed; one new top-level namespace added, and all three locale blocks must be filled in together per the project's existing i18n completeness convention (Document 01, § Localization Layer).
- [x] No existing `formulas.py` function signature changed; all four modifier hooks are applied at the call site in `simulator.py`, preserving `formulas.py`'s pure-function contract.
- [x] The Audit Ledger Data Dictionary's enumerated event-type set grows from 8 to 9 via one additive row (`UPGRADE_PURCHASED`); no existing event type's trigger, actor, or payload schema changes.
