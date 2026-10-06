# Dynamic Topology Builder & Infrastructure Expansion — Implementation Specification

**Document ID:** IZ-COMM-01  
**Classification:** Technical Specification / Infrastructure Topology  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `backend/app/engine/infrastructure.py`, `backend/app/engine/simulator.py`, `backend/app/api/v1/infrastructure.py`, `backend/app/schemas/infrastructure.py`, `backend/app/models/infrastructure.py`, `frontend/src/components/office/BuildModeOverlay.tsx`, `BuildPlacementGhost.tsx`, `buildGhost.ts`, `InfrastructureNodeSprite.tsx`, `IsometricOffice.tsx`

---

## 1. System Objective

Give the player a build-mode overlay on the Server Room grid where new infrastructure hardware — a Redis cache, a Kafka queue, a database read replica, or an NGINX load balancer — can be placed against a specific existing service to permanently reshape that service's hazard/latency profile. This is the spatial, visual counterpart to the existing upgrade-tree system (`01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md`): where an upgrade is a global, catalog-purchased modifier, an infrastructure node is a placed, positioned, per-service modifier with its own grid coordinates and a cable rendered back to its target.

## 2. Component Catalog

`backend/app/engine/infrastructure.py` defines `INFRASTRUCTURE_CATALOG`, a 4-entry list mirroring `MITIGATION_CATALOG`'s and `UPGRADE_CATALOG`'s single-source-of-truth convention, plus the three multiplier constants the simulator reads (`REDIS_LATENCY_DAMPENER = 0.55`, `DB_READ_REPLICA_HAZARD_MULTIPLIER = 0.40`, `NGINX_LB_HAZARD_MULTIPLIER = 0.80`). Each entry carries `node_type`, `name`, `description`, `cost` and `requires_producer`:

| `node_type` | Display Name | Cost | Mechanical Effect |
|---|---|---|---|
| `redis_cache` | Redis Cache Cluster | \$12,000 | When a failure materializes on the target service, its initial incident latency (`random.randint(850, 2400)` ms) is multiplied by `0.55` (45% less severe). It dampens the latency of new incidents on that service; it does not change failure probability. |
| `kafka_queue` | Kafka Message Queue | \$20,000 | Requires a `producer_service_id` in addition to the target (`target_service_id` is the protected consumer). The named producer's status is excluded from the target's dependency-shock calculation entirely — a full cascade decoupling, not a partial dampener. |
| `db_read_replica` | Database Read Replica | \$16,000 | Multiplies the target service's cascading failure hazard by `0.40` (a 60% reduction), mirroring `multi_az_clusters`'s global hook but scoped to one service. |
| `nginx_lb` | NGINX Load Balancer | \$9,000 | Multiplies the target service's cascading failure hazard by `0.80` (a 20% reduction) — smaller than a read replica's effect, reflecting that edge load-balancing smooths traffic distribution rather than eliminating a whole class of contention. |

Every node requires a `target_service_id` (the service it protects); `kafka_queue` additionally requires `producer_service_id` (the upstream dependency it decouples from). Effects do not stack: the simulator only checks *whether* a node of a given type targets the service, so a second `db_read_replica` or `nginx_lb` on the same service adds cost but no extra reduction. A `db_read_replica` and an `nginx_lb` on the same service do combine multiplicatively (0.40 x 0.80), and both combine with the other hazard factors (upgrades, difficulty, reputation) before the final probability cap.

## 3. Mathematical Hook — `formulas.py`

One pure function in `formulas.py`; no existing signature is altered:

```python
def apply_queue_decoupling(dependency_statuses_by_id: Dict[str, str], decoupled_ids: Iterable[str]) -> List[str]:
    """REMOVE QUEUE-ISOLATED DEPENDENCY STATUSES FROM CASCADE HAZARD EVALUATION"""
    decoupled = set(decoupled_ids)
    return [status for dep_id, status in dependency_statuses_by_id.items() if dep_id not in decoupled]
```

`_evaluate_random_failures` (`simulator.py`) is the caller: it builds a `dep_id -> status` map instead of a bare status list, computes the set of `producer_service_id`s decoupled by any `kafka_queue` node targeting the current service, and passes the filtered list into the existing `formulas.cascading_failure_probability`. The `db_read_replica`/`nginx_lb` hazard multipliers and the `redis_cache` latency dampener are applied at the same caller-side call site, following the exact additive-hook pattern established for `multi_az_clusters` in Document `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md` § 4.3 — `formulas.py` itself gains no new engine-state-aware logic.

## 4. Data & Persistence Contract

`backend/app/models/infrastructure.py` (the table is created by the initial Alembic revision):

```python
class InfrastructureNode(Base):
    __tablename__ = "infrastructure_nodes"
    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    node_type = Column(String(30), nullable=False)
    grid_x = Column(Numeric(6, 2), nullable=False)
    grid_y = Column(Numeric(6, 2), nullable=False)
    status = Column(String(20), nullable=False, default="active")
    config_json = Column(Text, nullable=False)
```

`config_json` carries `{"target_service_id": ..., "producer_service_id": ...|null}`. `status` is reserved for a future "under maintenance" state; today every placed node is created and remains `"active"` until deleted. `GameSession.infrastructure_nodes` carries `cascade="all, delete-orphan"`, identical to every other child table. Placed nodes are restored from this table after a process restart (`_try_restore_from_snapshot`), and the placement cost is a financial event rebuilt from the `INFRASTRUCTURE_NODE_PLACED` audit rows.

## 5. REST Endpoints

- `GET /api/infrastructure/catalog` — returns `INFRASTRUCTURE_CATALOG` verbatim.
- `POST /api/infrastructure/nodes` — body `PlaceInfrastructureNodeRequest`: `{node_type, grid_x, grid_y, target_service_id, producer_service_id?}`. `grid_x`/`grid_y` must be finite numbers within -100..100 (rejects NaN/Infinity and absurd values that would otherwise be stored and echoed in every broadcast). The engine validates catalog membership ("Unknown infrastructure node type"), that `target_service_id` exists ("Target service not found"), that `producer_service_id` resolves for `kafka_queue` ("Producer service required for this node type") and the budget ("Insufficient budget runway"); every engine rejection is HTTP 400. On success it deducts the cost through `_apply_financial_event(category="infrastructure_purchase")`, which writes the `INFRASTRUCTURE_NODE_PLACED` audit row (`{node_id, node_type, target_service_id, cost}`), and returns `{success, node, budget}`.
- `DELETE /api/infrastructure/nodes/{id}` — removes the node with **no refund** (matching the codebase's no-refund convention) and logs `INFRASTRUCTURE_NODE_REMOVED` (`compliance_flag=True`); an unknown id is HTTP 404.

`TICK_BROADCAST` carries `"infrastructure_nodes": self.infrastructure_nodes`, and the engine pushes fresh state right after each successful POST/DELETE (`app/core/state_push.py`).

## 6. Frontend — Build Mode

**Entering build mode.** A "Build Mode" button (hammer icon) in the office's control cluster, or the `B` keyboard shortcut, toggles `buildModeActive` in the Zustand store. While active, `BuildModeOverlay.tsx` shows a screen-space palette strip with the four catalog entries (icon plus cost in thousands; the name is the tooltip) and, once a module is armed, a hint line ("select the target service", then "select the producer" for Kafka) with a cancel button. The prices in the palette mirror the backend catalog.

**Placement flow.** Arm a module in the palette, then click the **rack** (service) it should protect. `kafka_queue` takes two clicks: the first rack is the protected consumer (`target_service_id`), the second is the decoupled producer (`producer_service_id`). The click calls `api.placeInfrastructureNode(...)`, shows a success or error floating text (the server's rejection message is surfaced as-is) and disarms the module.

**Slot-based placement.** The player does not choose a position. The client computes the next free shelf slot in the Server Room from the number of nodes already placed (`infrastructureSlot(count)` in `officeLayout.ts`, mirrored by the placement maths in `IsometricOffice.tsx`): four modules per row in front of the racks, rows 0.6 grid units apart, starting at `SERVER_ROOM_ORIGIN + (0.5, 3.3)`. Those coordinates are what is sent as `grid_x`/`grid_y` and stored. Because the position derives from the node *count*, removing a node and placing another can reuse a slot already occupied by a remaining node (the layout does not compact).

**Placement ghost.** `BuildPlacementGhost.tsx` draws a translucent, dashed-ring preview of the armed module on exactly that next slot, labelled "next slot", rather than following the cursor to a place the node would never end up. The armed type travels from the HTML palette to the SVG scene through a tiny dedicated store (`buildGhost.ts`, `useBuildGhost`).

**Placed nodes.** `InfrastructureNodeSprite.tsx` renders each placed node as a small `IsoBox` prop coloured by `node_type` (redis red, kafka violet, replica cyan, nginx green) with a dashed, animated SVG cable (`ol-dash-7`) from the node to its target rack. A node placed while build mode is open drops in with a landing ring; a node already present when the office loads simply appears.

**Removal control.** Placed hardware is removed from the node inspector. `InstalledHardware.tsx` (mounted in `NodeInspector.tsx`) lists the modules attached to the selected service, either as protected target or as a queue's producer, with the module name and the cost paid (the catalog price; the node record carries none, see `utils/infraNodes.ts`). `Remove` opens an inline question, `No refund. Remove?` with Confirm and Cancel: focus lands on Cancel so a stray Enter cannot destroy hardware, and Escape cancels. Confirm calls `api.removeInfrastructureNode` through the shared in-flight guard; success raises a success toast (and pulls a state snapshot when the simulation is paused, since no tick broadcast would otherwise drop the node), and a failure shows the backend message verbatim in a danger toast. The control does not depend on build mode being active.
