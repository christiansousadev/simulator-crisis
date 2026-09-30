# Scenarios and Game Modes — Implementation Specification

**Document ID:** IZ-IMPL-04  
**Classification:** Technical Specification / Scenario Engine & Modes  
**Status:** Implementado  
**Source of Truth:** `backend/app/engine/scenarios/`, `backend/app/engine/simulator.py`, `backend/app/api/v1/sessions.py`

---

## 1. System Objective

The `ScenarioEngine` orchestration layer wraps the core `SimulationEngine` tick loop with scripted and custom time-boxed crisis challenges without subclassing or breaking substitutability of the underlying engine. The default sandbox mode (unscripted continuous operation) remains the standard operational environment when no scenario is active. Scenarios are opt-in, instantiated via session reset/creation parameters, and fully serializable across restarts.

---

## 2. Architectural Design

### 2.1 `ScenarioEngine` Architecture & Registry

All scenarios live in `backend/app/engine/scenarios/`:

```
backend/app/engine/scenarios/
├── __init__.py
├── base.py                     # ScenarioEngine abstract base + SCENARIO_REGISTRY
├── black_friday_rush.py        # High traffic surge & capacity constraints
├── ransomware_infiltration.py  # Lateral intrusion containment
├── chaos_engineering_drill.py  # Random automated failure injection
└── custom_scenario.py          # User-defined parameters & scripted injections
```

`base.py` establishes the abstract composition wrapper:

```python
class ScenarioEngine(ABC):
    scenario_id: str
    display_name: str
    duration_ticks: int
    description: str
    special_conditions: List[str]
    objectives_summary: List[str]
    unlock_requirement: str

    def __init__(self, engine: "SimulationEngine"):
        self.engine = engine
        self.elapsed_ticks: int = 0
        self.completed: bool = False
        self.outcome: Optional[Dict[str, Any]] = None

    def on_start(self) -> None:
        """Invoked when session begins or restarts fresh under this scenario."""
        pass

    @abstractmethod
    def on_tick(self) -> None:
        """Apply scenario-specific state mutations for the current tick."""
        raise NotImplementedError

    def objectives(self) -> List[Dict[str, Any]]:
        """Return real-time backend-computed objective status."""
        return []

    @abstractmethod
    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        """Return scoring payload when scenario concludes, else None."""
        raise NotImplementedError

    def is_expired(self) -> bool:
        return self.elapsed_ticks >= self.duration_ticks

    def snapshot_extra(self) -> Dict[str, Any]:
        """Serialize scenario-specific internal state."""
        return {}

    def restore_extra(self, extra: Dict[str, Any]) -> None:
        """Restore scenario-specific internal state from snapshot."""
        pass
```

### 2.2 Integration Point and Session Status Evaluation Precedence

The simulation loop evaluates session state in `SimulationEngine._update_simulation_tick()`. Session termination is governed solely by `SimulationEngine._evaluate_session_status()`, which enforces a strict three-tier precedence:

1. **Monetary Bankruptcy (`budget <= 0.0`):**
   - **Highest Precedence:** Hard stop that ends the session regardless of whether a scenario is running.
   - Sets `self.budget = 0.0`, `self.status = "bankrupted"`, `self.is_running = False`.
   - Logs `BANKRUPTCY_LIQUIDATION` (`actor="BOARD_OF_DIRECTORS"`, `compliance_flag=False`).
   - Persists a `CareerRecord(outcome="bankrupted")`.
2. **Active Scenario Outcome (`active_scenario and not active_scenario.completed`):**
   - **Scenario Authority:** If a scenario is running, its `evaluate_victory()` outcome is evaluated before any generic survival rules.
   - If non-`None`, the scenario concludes:
     - Marks `self.active_scenario.completed = True`.
     - Logs `SCENARIO_CONCLUDED` (`actor="AUDIT_SYSTEM"`, `compliance_flag=outcome["compliant"]`).
     - Sets engine `status = "victory" if compliant else "bankrupted"`.
     - Persists `CareerRecord(outcome="victory" if compliant else "scenario_defeat", scenario_outcome=outcome)`.
     - Sets `self.is_running = False`.
3. **Sandbox Monthly Survival (`active_scenario is None`):**
   - Gated to sandbox runs only. Checked when `current_tick >= 720` and `sla_percentage >= 99.0%`.
   - Sets `self.status = "victory"`, logs `MONTHLY_AUDIT_CYCLE_SURVIVED`, persists `CareerRecord(outcome="victory")`, and stops execution.

---

## 3. Challenge Scenarios

### 3.1 "Black Friday Rush" (`black_friday_rush`)

- **Duration:** 48 ticks.
- **Mechanics:**
  - Sustained load increases latency of healthy services by 2% each tick.
  - Scenario hazard multiplier of $2.0\times$ applied during the surge window via `self.engine._scenario_hazard_multiplier`.
  - Accelerated passive cloud burn surcharge applied to budget.
  - Mitigation constraint: Only `spin_replicas` is permitted to treat capacity-driven degradation (`latency_ms > 500`). Actions like `rollback` and `emergency_patch` targeting capacity overload are rejected.
- **Dynamic Objectives (`objectives()`):**
  - Maintain SLA $\ge 99.0\%$ (`done: sla_percentage >= 99.0`).
  - Maintain positive budget balance (`done: budget > 0`).
- **Victory Condition:** Survived 48 ticks with final SLA $\ge 99.0\%$ and solvency.

### 3.2 "Ransomware Infiltration" (`ransomware_infiltration`)

- **Duration:** 60 ticks.
- **Directional Separation: Operational Cascade vs. Lateral Movement:**
  - **Operational Failure Cascade (`formulas.cascading_failure_probability`):** Flows *downstream* from upstream infrastructure to dependent services ("an unhealthy upstream dependency increases its dependents' hazard").
  - **Ransomware Lateral Movement (`self._lateral_movement_map`):** Flows *outbound* along the compromised host's outbound `dependencies` ("an attacker compromises a host and pivots outward using outbound credentials/connections to services it calls").
  - Initial infection begins at peripheral node `srv-notify` (Patient Zero), which depends on `srv-api-gw`, which depends on `srv-payment` (Master DB).
  - Dedicated relation `_lateral_movement_map` is frozen at initialization (`{srv["id"]: list(srv["dependencies"]) for srv in engine.services}`) ensuring isolation from runtime topological status changes.
- **Lifecycle & Governance:**
  - `on_start()` logs `PATIENT_ZERO_IDENTIFIED` with `actor="AUTOMATED_MONITOR"`, `compliance_flag=False`.
  - Every 4 ticks (`LATERAL_MOVEMENT_INTERVAL_TICKS`), unquarantined infected nodes spread infection to their outbound targets.
  - Infected nodes suffer $+15\%$ error rate drift per tick while unquarantined.
  - Executing runbook `circuit_breaker` on an infected service adds it to `quarantined_service_ids`, halting further lateral pivots from that node.
- **State Persistence:**
  - `snapshot_extra()` and `restore_extra()` persist `infected_service_ids` and `quarantined_service_ids` in database snapshots.
- **Dynamic Objectives (`objectives()`):**
  - Protect `srv-payment` (Master DB): `done: "srv-payment" not in self.infected_service_ids`.
  - Contain spread: `done: infected_service_ids <= quarantined_service_ids`.
- **Victory Condition:** Instant defeat if `srv-payment` is infected and reaches `status == "down"`. Victory if survived 60 ticks without Master DB encryption.

### 3.3 "Chaos Engineering Drill" (`chaos_engineering_drill`)

- **Duration:** 40 ticks.
- **Mechanics:**
  - 20% probability per tick of striking a healthy service, triggering `_trigger_service_failure()` and logging `CHAOS_STRIKE` (`actor="AUTOMATED_MONITOR"`, `compliance_flag=True`).
- **Dynamic Objectives (`objectives()`):**
  - Zero regulatory breach flags logged during the drill window.
- **Victory Condition:** Survived 40 ticks with 0 regulatory compliance breaches logged in the audit ledger during the drill.

### 3.4 "Custom Scenario" (`custom_scenario`)

- User-defined scripted scenario created via `POST /api/scenarios/custom`.
- Dynamically schedules discrete failure injections at specific ticks and bounds baseline parameters.
- Validates bounds before session reset using `CANONICAL_SERVICE_IDS`.

---

## 4. REST Endpoints & Objective Architecture

### 4.1 Scenario Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/scenarios/catalog` | `GET` | Returns catalog of registered scenarios, descriptions, unlock statuses, and conditions. |
| `/api/scenarios/active` | `GET` | Returns live scenario status: `scenario_id`, `elapsed_ticks`, `duration_ticks`, `completed`, `outcome`, and dynamic `objectives`. |
| `/api/scenarios/custom` | `POST` | Validates and starts a custom-scripted scenario session. |

### 4.2 Separation of Objectives in UI

- **`ObjectiveTracker` (HUD Overlay):** Presents official, backend-computed scenario objectives derived directly from `GET /api/scenarios/active` (or `telemetry.active_scenario.objectives`). The backend is the sole authority on completion status. Resets and unmounts when returning to sandbox.
- **`ObjectiveHint` (Contextual Widget):** Local UI heuristic providing helpful guidance prompts based on current operational health (e.g. reminding player to acknowledge an active P1 incident or refill coffee). Not a scenario scoring authority.

---

## 5. UI/UX & Match Lifecycle

- **Pre-match Selection:** `ScenarioSelectModal` presents available scenarios, narrative briefings, difficulty selectors, unlock criteria, and personal best records.
- **Briefing:** `ScenarioBriefingModal` displays operational objectives and rules prior to launch. Simulation is paused during briefing.
- **Post-Match Debrief:** On terminal status (`victory` or `bankrupted`/`scenario_defeat`), `PostMatchDebriefModal` mounts as the primary debriefing experience. It displays scenario outcome, SLA, final cash, tech debt, duration, achievements unlocked, prestige gain, and next recommended challenges. Historical screens (`VictoryScreen`/`LiquidationScreen`) are legacy fallback presentations superseded by `PostMatchDebriefModal`.

---

## 6. Implementation Reconciliation & Checklist

- [x] Composition-based `ScenarioEngine` architecture integrated cleanly into `SimulationEngine`.
- [x] Operational failure cascade (downstream) and ransomware lateral movement (outbound dependencies) strictly separated.
- [x] Dedicated `_lateral_movement_map` isolates security pivots from runtime operational changes.
- [x] `_evaluate_session_status()` enforces correct precedence (Bankruptcy $\to$ Scenario $\to$ Sandbox 720-tick survival).
- [x] Scenario state (`infected_service_ids`, `quarantined_service_ids`) persisted across restarts via `snapshot_extra()`/`restore_extra()`.
- [x] Backend calculates real-time scenario objectives exposed via `/api/scenarios/active`.
- [x] `PostMatchDebriefModal` established as the consolidated post-match experience.
