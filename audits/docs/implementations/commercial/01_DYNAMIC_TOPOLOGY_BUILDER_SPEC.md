# Dynamic Topology Builder & Infrastructure Expansion — Implementation Specification

**Document ID:** IZ-COMM-01
**Classification:** Implementation Contract — Commercial Pillar 1
**Status:** Implemented, additive only, non-breaking
**Integration baseline:** `backend/app/engine/formulas.py`, `backend/app/engine/simulator.py`, `backend/app/models/`, `frontend/src/components/office/ServerRoom.tsx`

---

## 1. System Objective

Give the player a build-mode overlay on the Server Room grid where new infrastructure hardware — a Redis cache, a Kafka queue, a database read replica, or an NGINX load balancer — can be placed against a specific existing service to permanently reshape that service's hazard/latency profile. This is the spatial, visual counterpart to the existing upgrade-tree system (`01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md`): where an upgrade is a global, catalog-purchased modifier, an infrastructure node is a placed, positioned, per-service modifier with its own grid coordinates and a cable rendered back to its target.

## 2. Component Catalog

`backend/app/engine/infrastructure.py` defines `INFRASTRUCTURE_CATALOG`, a 4-entry list mirroring `MITIGATION_CATALOG`'s and `UPGRADE_CATALOG`'s single-source-of-truth convention:

| `node_type` | Display Name | Cost | Mechanical Effect |
|---|---|---|---|
| `redis_cache` | Redis Cache Cluster | \$12,000 | Any future outage on the target service degrades to 45% less severe latency (`random.randint(850,2400)` band scaled down 45%). |
| `kafka_queue` | Kafka Message Queue | \$20,000 | Requires a `producer_service_id` in addition to the target (`target_service_id` is the protected consumer). The named producer's status is excluded from the target's dependency-shock calculation entirely — a full cascade decoupling, not a partial dampener. |
| `db_read_replica` | Database Read Replica | \$16,000 | Multiplies the target service's cascading failure hazard by `0.40` (a 60% reduction), mirroring `multi_az_clusters`'s global hook but scoped to one service. |
| `nginx_lb` | NGINX Load Balancer | \$9,000 | Multiplies the target service's cascading failure hazard by `0.80` (a 20% reduction) — smaller than a read replica's effect, reflecting that edge load-balancing smooths traffic distribution rather than eliminating a whole class of contention. |

Every node requires a `target_service_id` (the service it protects); `kafka_queue` additionally requires `producer_service_id` (the upstream dependency it decouples from).

## 3. Mathematical Hook — `formulas.py`

One new pure function, additive, zero changes to any existing signature:

```python
def apply_queue_decoupling(dependency_statuses_by_id: Dict[str, str], decoupled_ids: Iterable[str]) -> List[str]:
    """REMOVE QUEUE-ISOLATED DEPENDENCY STATUSES FROM CASCADE HAZARD EVALUATION"""
    decoupled = set(decoupled_ids)
    return [status for dep_id, status in dependency_statuses_by_id.items() if dep_id not in decoupled]
```

`_evaluate_random_failures` (`simulator.py`) is the caller: it now builds a `dep_id -> status` map instead of a bare status list, computes the set of `producer_service_id`s decoupled by any `kafka_queue` node targeting the current service, and passes the filtered list into the existing `formulas.cascading_failure_probability`. The `db_read_replica`/`nginx_lb` hazard multipliers and the `redis_cache` latency dampener are applied at the same caller-side call site, following the exact additive-hook pattern established for `multi_az_clusters` in Document `01_TECH_TREE_AND_OFFICE_UPGRADES_SPEC.md` § 4.3 — `formulas.py` itself gains no new engine-state-aware logic.

## 4. Data & Persistence Contract

`backend/app/models/infrastructure.py`:

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

`config_json` carries `{"target_service_id": ..., "producer_service_id": ...|null}`. `status` is reserved for a future "under maintenance" state; today every placed node is created and remains `"active"` until deleted. `GameSession.infrastructure_nodes` relationship added with `cascade="all, delete-orphan"`, identical to every other child table.

## 5. REST Endpoints

- `GET /api/infrastructure/catalog` — returns `INFRASTRUCTURE_CATALOG` verbatim.
- `POST /api/infrastructure/nodes` — body `{node_type, grid_x, grid_y, target_service_id, producer_service_id?}`; validates catalog membership, budget, and that `target_service_id` (and `producer_service_id` for `kafka_queue`) resolve to real services; deducts cost; logs `INFRASTRUCTURE_NODE_PLACED`.
- `DELETE /api/infrastructure/nodes/{id}` — removes the node (no refund, matching the codebase's existing no-refund convention for every other spend), logs `INFRASTRUCTURE_NODE_REMOVED`.

`TICK_BROADCAST` gains one additive key: `"infrastructure_nodes": self.infrastructure_nodes`.

## 6. Frontend — Build Mode

`components/office/BuildModeOverlay.tsx` renders a semi-transparent placement grid over the Server Room bounds when build mode is toggled (new `buildModeActive` boolean in the Zustand store); a palette strip lists the 4 catalog entries. Clicking a grid cell while a catalog item is selected calls `api.placeInfrastructureNode(...)`. `components/office/InfrastructureNodeSprite.tsx` renders each placed node as a small `IsoBox`-based prop keyed by `node_type`, and a dynamic SVG cable — a `<line>` (or a `<path>` with a subtle curve) from the node's projected position to its `target_service_id` rack, animated with the existing `dash-flow` keyframe already used elsewhere for data-pulse lines, so newly placed components visibly wire into the topology rather than sitting disconnected.
