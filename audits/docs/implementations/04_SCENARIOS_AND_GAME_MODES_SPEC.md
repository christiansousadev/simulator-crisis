# Scenarios and Game Modes — Implementation Specification

**Document ID:** IZ-IMPL-04  
**Classification:** Technical Specification / Scenario Engine & Modes  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `backend/app/engine/scenarios/`, `backend/app/engine/simulator.py`, `backend/app/api/v1/scenarios.py`, `backend/app/api/v1/sessions.py`, `backend/app/schemas/scenario.py`

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
├── base.py                     # ScenarioEngine abstract base, SCENARIO_REGISTRY, @register_scenario
├── black_friday_rush.py        # High traffic surge & capacity constraints
├── ransomware_infiltration.py  # Lateral intrusion containment
├── chaos_engineering_drill.py  # Random automated failure injection
├── ddos_global.py              # Volumetric flood against the API gateway
├── deployment_rollback.py      # Bad deploy: memory leak on auth + search
├── third_party_outage.py       # Vendor-owned services down until the provider recovers
└── custom_scenario.py          # User-defined parameters & scripted injections (not registered)
```

Each scripted scenario registers itself with the `@register_scenario` decorator (a duplicate `scenario_id` raises at import time). `CustomScenario` is deliberately **not** registered: it has no fixed id to look up and is always instantiated with a config through `SimulationEngine.load_custom_scenario`. `base.py` establishes the abstract composition wrapper (abridged):

```python
class ScenarioEngine(ABC):
    scenario_id: str
    display_name: str
    duration_ticks: int
    description: str
    special_conditions: List[str]
    objectives_summary: List[str]
    unlock_requirement: Optional[str]

    @classmethod
    def is_unlocked(cls, career_records, achievements: set) -> bool:
        """Authoritative unlock check, evaluated against real career data (default: unlocked)."""
        return True

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

    def mitigation_block_reason(self, action_id: str, service_id: str) -> Optional[str]:
        """Optional: a human-readable reason this scenario forbids a runbook on a service right now."""
        return None

    def objectives(self) -> List[Dict[str, Any]]:
        """Return real-time backend-computed objective status: [{id, description, done[, failed]}]."""
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

**Achievements on the terminal tick:** the three terminal branches call `_evaluate_achievements()` *before* writing the `CareerRecord` (so `prestige_earned` counts what the final tick unlocked), and `_update_simulation_tick()` evaluates once more before returning on a terminal tick. Previously the early return skipped evaluation, so the run-defining achievements (SOC-2 Type II Certified, Chaos Survivor, Ransomware Repelled), which only become true on that tick, could never unlock.

---

## 3. Challenge Scenarios

| Scenario id | Duration (ticks) | Unlock requirement (`is_unlocked`) |
|---|---|---|
| `black_friday_rush` | 48 | Always unlocked |
| `chaos_engineering_drill` | 40 | Any career record exists, or the `century_club` achievement |
| `ransomware_infiltration` | 60 | `chaos_survivor` achievement, a victory in `chaos_engineering_drill`, or 75+ lifetime prestige |
| `ddos_global` | 52 | A `black_friday_rush` victory with final SLA >= 99.5% |
| `deployment_rollback` | 40 | Any scenario victory on `standard` or `chaos` difficulty |
| `third_party_outage` | 45 | A victory on `chaos` difficulty |
| `custom` | user-defined (10–100,000) | Always available through the builder; not in the catalog |

Unlocks are evaluated from the player's `CareerRecord` rows and achievements (see `commercial/04_ACHIEVEMENTS_AND_CAREER_SPEC.md`); `GET /api/scenarios/catalog?player_id=...` returns the `unlocked` flag per scenario.

### 3.1 "Black Friday Rush" (`black_friday_rush`)

- **Duration:** 48 ticks.
- **Mechanics:**
  - Sustained load multiplies the latency of every `healthy` service by 1.02 each tick.
  - The scenario hazard multiplier is `TRAFFIC_MULTIPLIER / 4.0 + 1.0 = 2.0x`, applied at the failure-evaluation call site through `engine._scenario_hazard_multiplier` (the persisted `tech_debt` is never touched).
  - Accelerated passive cloud burn: each tick an extra `PASSIVE_CLOUD_BURN * (2.5 - 1.0)` is charged through `_apply_financial_event(category="operational_expense")`.
  - Mitigation constraint (in `apply_mitigation`): while this scenario is active, `rollback` and `emergency_patch` are rejected on any service whose `latency_ms > 500` with the error "only Spin Replicas is permitted to address capacity-driven degradation". The permitted runbook is `scale_replicas`.
- **Dynamic Objectives (`objectives()`):**
  - `maintain_sla`: rolling SLA >= `SLA_BREACH_THRESHOLD` (99.0). `done` is the instantaneous condition (true at tick 0); `failed` is sticky once the SLA dipped under 99.0 after the 24-tick grace window (`SLA_GRACE_TICKS`, mirroring the engine's `BREACH_GRACE_TICKS`).
  - `survive_surge`: `done` once the 48 ticks have elapsed.
- **Victory Condition:** after 48 ticks, final rolling SLA >= 99.0 (`compliant`). The outcome records `final_sla_percentage` and `net_runway_saved` (the final budget). Budget exhaustion is handled earlier by the generic bankruptcy branch.

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
  - On each lateral-movement step (every 4 ticks), every infected and unquarantined node is set `degraded` and its error rate rises by $+15$ percentage points (capped at 1.0); there is no per-tick drift between steps.
  - Executing runbook `circuit_breaker` on an infected service adds it to `quarantined_service_ids` (done in `apply_mitigation`), which stops the node from re-degrading and excludes it as a pivot target.
- **State Persistence:**
  - `snapshot_extra()` and `restore_extra()` persist `infected_service_ids` and `quarantined_service_ids` in database snapshots.
- **Dynamic Objectives (`objectives()`):**
  - `protect_master_db`: `done: "srv-payment" not in self.infected_service_ids`.
  - `contain_spread`: `done: bool(infected_service_ids) and infected_service_ids <= quarantined_service_ids`.
- **Victory Condition:** Instant defeat if `srv-payment` is infected and reaches `status == "down"` (outcome `defeat`, `compliant: False`). Victory (`compliant: True`) if the 60 ticks elapse without Master DB encryption; the outcome records `services_contained`.

### 3.3 "Chaos Engineering Drill" (`chaos_engineering_drill`)

- **Duration:** 40 ticks.
- **Mechanics:**
  - 20% probability per tick (`CHAOS_STRIKE_PROBABILITY_PER_TICK`) of striking a random healthy service, independent of tech debt, triggering `_trigger_service_failure()` and logging `CHAOS_STRIKE` (`actor="AUTOMATED_MONITOR"`, `compliance_flag=True`).
- **Dynamic Objectives (`objectives()`):**
  - `zero_breach_flags`: `done` while no audit-ledger entry with `compliance_flag == False` was logged since the drill's window start; `failed` is true as soon as one exists (flags are never removed).
  - `survive_drill`: `done` once the 40 ticks have elapsed.
- **Victory Condition:** after 40 ticks, zero `compliance_flag == False` entries in the window (`compliant`). The outcome records `regulatory_breach_flags` and `final_sla_percentage`.

### 3.4 "Custom Scenario" (`custom`)

- Player-configured scenario loaded through `POST /api/scenarios/custom/load` (resets the session, then `engine.load_custom_scenario(config)`); the class is `CustomScenario` in `custom_scenario.py`, `scenario_id = "custom"`, and it is not part of `SCENARIO_REGISTRY` or the catalog. The config is persisted in `snapshot_extra()` so a restart resumes it.
- **Config (`CustomScenarioConfig`, `backend/app/schemas/scenario.py`):**

| Field | Bounds |
|---|---|
| `duration_ticks` | integer, 10 to 100,000 |
| `hazard_multiplier` | float, 0.0 to 20.0 (NaN/Infinity rejected) |
| `budget_floor` | float, `>= 0` and `<` the `standard` starting budget (250,000) |
| `chaos_injections` | up to 50 entries `{at_tick >= 0, service_id}`; `service_id` must be one of `CANONICAL_SERVICE_IDS` (`srv-auth`, `srv-payment`, `srv-api-gw`, `srv-search`, `srv-notify`); `at_tick` must be `< duration_ticks` |
| `starting_budget` (optional) | float, 1,000 to 2,000,000, and `> budget_floor` |
| `starting_tech_debt` (optional) | integer, 0 to 100 |

- **Mechanics:** `on_start` applies the optional starting budget/tech debt once (never on a restore); each tick sets `_scenario_hazard_multiplier` to `hazard_multiplier` and fires any injection whose `at_tick` equals the scenario's elapsed ticks against a still-healthy service (the elapsed counter is incremented before `on_tick`, so `at_tick = 0` is accepted by the schema but never fires).
- **Objectives:** `stay_above_budget_floor` (`budget > budget_floor`) and `survive_duration`.
- **Outcome:** defeat (`compliant: False`) as soon as `budget <= budget_floor`; victory (`compliant: True`) when the duration elapses. A custom run uses the sandbox mitigation rules (specialist/cause effectiveness applies); only the six registered scenarios use the "any permitted runbook fully heals" simplification.
- The builder UI is documented in `commercial/06_CUSTOM_SCENARIO_CREATOR_SPEC.md`.

### 3.5 "Global DDoS Flood" (`ddos_global`)

- **Duration:** 52 ticks.
- **Mechanics:**
  - `on_start` logs `DDOS_ATTACK_DETECTED` (`actor="BORDER_FIREWALL"`, `compliance_flag=True`).
  - Each tick the effective flood is `FLOOD_BASE_MULTIPLIER (8.0) x wave`, where `wave = 1 + 0.45 * sin(2*pi * (elapsed_ticks % 6) / 6)` (`WAVE_PERIOD_TICKS = 6`, a sinusoidal wave between 0.55x and 1.45x).
  - Active synergy: owning `predictive_anomaly_detection` scrubs 40% of the flood (`effective_flood *= 0.60`).
  - A **healthy** `srv-api-gw` has its latency multiplied by `1 + effective_flood * 0.04` every tick (compounding); every other healthy service gains +4 ms per tick of collateral congestion.
  - The scenario hazard multiplier is `1 + effective_flood * 0.18`, raising spontaneous incident chances.
  - Tracking: `_api_gw_down_ticks` counts ticks with the gateway `down`; `_payment_incident_breach` becomes true when an unresolved `srv-payment` incident is older than 6 ticks. Both, plus the sticky gateway-uptime violation, are persisted via `snapshot_extra()`.
- **Dynamic Objectives (`objectives()`):**
  - `gw_uptime`: gateway uptime (`100 * (1 - down_ticks / max(1, elapsed))`) >= 80%; `failed` is sticky.
  - `payment_sla`: no `srv-payment` incident left unresolved for more than 6 ticks; `failed` is sticky.
  - `survive_attack`: `done` once the 52 ticks have elapsed.
- **Victory Condition:** after 52 ticks, gateway uptime >= 80%, no payment breach **and** final rolling SLA >= 99.0. Outcome fields: `gw_uptime_pct`, `payment_breach`, `final_sla_percentage`, `net_runway_saved`.

### 3.6 "Deployment Rollback Emergency" (`deployment_rollback`)

- **Duration:** 40 ticks.
- **Mechanics:**
  - `on_start` pre-degrades `srv-auth` and `srv-search` (latency x1.6, error rate +0.12 capped at 0.25) and logs `DEPLOYMENT_REGRESSION_DETECTED` (`actor="CI_PIPELINE"`).
  - Each tick, affected services that are not `down` gain **+6 ms** latency (the memory leak). Owning `automated_cicd` halves the growth (integer division: +3 ms).
  - Tech debt grows **+2 per tick** while fewer than two affected services have a `triage_solved` incident (the cost of the hasty hotfix); once both are triaged the tick is recorded in `both_triaged_by`.
  - A second regression wave fires once, at elapsed tick 20, **only if neither service has been triaged** (error rate +0.18 on both, capped at 0.55; audit event `SECOND_REGRESSION_WAVE`).
- **Dynamic Objectives (`objectives()`):**
  - `triage_both`: root cause solved in the Log Triage Terminal on both `srv-auth` and `srv-search`.
  - `restore_services`: both services `healthy` while `elapsed_ticks <= 38`.
  - `protect_budget`: `error_budget_remaining_ratio > 0.20`; `failed` is sticky once the ratio dipped to 0.20 or below.
- **Victory Condition:** evaluated when the 40 ticks elapse: both affected services `healthy`, error budget remaining `> 20%` and final rolling SLA >= 99.0. (The "before tick 38" wording belongs to the live objective; the verdict itself is taken at the end of the window.) Outcome fields: `services_restored`, `error_budget_protected`, `second_wave_triggered`, `both_triaged_by_tick`, `final_sla_percentage`, `net_runway_saved`.

### 3.7 "Third-Party Outage" (`third_party_outage`)

- **Duration:** 45 ticks (the run normally ends earlier, when the provider recovers).
- **Mechanics:**
  - `srv-payment` and `srv-notify` are vendor-owned: forced `down` (9999ms, 100% errors) in `on_start` and **re-pinned to `down` every tick** until the provider recovers, so nothing can leave them healed.
  - No internal fix exists: `mitigation_block_reason()` rejects every runbook on those two services until recovery (`"External provider outage: no internal fix is available..."`). Downstream `srv-auth` and `srv-api-gw` bleed error rate (+8%/tick, capped at 75%) and latency (+12ms/tick) and can be treated with runbooks.
  - Vendor recovery lottery: 20% per tick from tick 15, **guaranteed at tick 40** so every run reaches a verdict. Recovery heals both providers and ends the run on that tick. The RNG is unseeded (the constant session id used to replay the identical recovery tick every run).
  - Morale drain: `-1.6`/tick from the scenario (`-0.8` with `espresso_machine`) on top of the engine's outage drift.
  - Audit flags: `THIRD_PARTY_PROVIDER_OUTAGE` is `compliance_flag=False` (adverse event); `THIRD_PARTY_PROVIDER_RECOVERED` is `True`.
- **Dynamic Objectives (`objectives()`), exactly the victory conditions:**
  - `downstream_latency`: mean of the `srv-auth`/`srv-api-gw` average latency, sampled every tick of the outage, below 500ms (a running mean, so one incident spiking a service on the recovery tick does not decide the run).
  - `team_morale`: `user_happiness >= 40`.
  - `survive_outage`: provider recovered and `budget > 0`.
- **Unlock:** a victory on `chaos` difficulty.
- **Victory Condition:** provider recovered (by lottery or the tick-40 guarantee) with morale $\ge 40\%$, budget $> 0$ and average downstream latency $< 500$ms. The rolling SLA is reported in the outcome but is **not** part of the rule: the two vendor services keep it near 64% for the whole outage, so the previous `SLA >= 99%` gate made victory unreachable. Budget exhaustion is handled earlier by the generic bankruptcy branch. A recovery after roughly tick 24 (tick 33 with the espresso machine) usually loses on morale, which is the intended pressure.

---

## 4. REST Endpoints & Objective Architecture

### 4.1 Scenario Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/scenarios/catalog` | `GET` | Lists the six registered scripted scenarios (the custom scenario is not in the catalog) with `scenario_id`, `display_name`, `duration_ticks`, `description`, `special_conditions`, `objectives` (summary strings), `unlock_requirement`, `unlocked` and `best_record`. The optional `player_id` query parameter (`^[A-Za-z0-9_-]+$`, max 64) selects whose career records and achievements drive `unlocked` and `best_record`; without it every scenario is evaluated against an empty career. |
| `/api/scenarios/active` | `GET` | `{"active": false}` in sandbox, otherwise `scenario_id`, `elapsed_ticks`, `duration_ticks`, `completed`, `outcome` and the live `objectives` (recomputed server-side on every call). |
| `/api/scenarios/custom/load` | `POST` | Body: `CustomScenarioConfig` (§ 3.4). Resets the session and attaches a custom scenario; returns `{"success": true}`. HTTP 422 on a bound violation. |
| `/api/session/reset` | `POST` | Body `{scenario_id?, player_id?, difficulty?}`: restarts the run, optionally into a registered scenario (an unknown `scenario_id` is rejected with 422 before the session is touched). |

State is pushed to WebSocket clients after each of these REST commands (`app/core/state_push.py`), and `telemetry.active_scenario` carries the same objective list in every `TICK_BROADCAST`.

### 4.2 Separation of Objectives in UI

- **Objective `failed` flag:** objective dicts may carry an optional boolean `failed`, true once a maintenance-style condition was violated at any point in the window (tracked across ticks, persisted via `snapshot_extra`), while `done` keeps its original meaning (the condition holds right now, or the window completed). Emitted by `black_friday_rush` (`maintain_sla`, only counted after the 24-tick SLA grace window), `chaos_engineering_drill` (`zero_breach_flags`), `deployment_rollback` (`protect_budget`) and `ddos_global` (`gw_uptime`, `payment_sla`). Objectives without a failure mode omit the key. It is served in `GET /api/scenarios/active` and in `telemetry.active_scenario.objectives` (now included in every `TICK_BROADCAST`). It is a progress indicator; the final verdict is still computed by `evaluate_victory()`.
- **`ObjectiveTracker` (HUD Overlay):** Presents official, backend-computed scenario objectives derived directly from `GET /api/scenarios/active` (or `telemetry.active_scenario.objectives`). The backend is the sole authority on completion status. Resets and unmounts when returning to sandbox.
- **`ObjectiveHint` (Contextual Widget):** Local UI heuristic providing helpful guidance prompts based on current operational health (e.g. reminding player to acknowledge an active P1 incident or refill coffee). Not a scenario scoring authority.

---

## 5. UI/UX & Match Lifecycle

- **Pre-match Selection:** `ScenarioSelectModal` presents available scenarios, narrative briefings, difficulty selectors, unlock criteria, and personal best records; `ScenarioBuilderModal` configures a custom run (see `commercial/06_CUSTOM_SCENARIO_CREATOR_SPEC.md`).
- **Briefing:** `ScenarioBriefingModal` displays operational objectives and rules prior to launch. Simulation is paused during briefing.
- **Post-Match Debrief:** On terminal status (`victory` or `bankrupted`/`scenario_defeat`), `PostMatchDebriefModal` mounts as the primary debriefing experience. It displays scenario outcome, SLA, final cash, tech debt, duration, achievements unlocked, prestige gain, and next recommended challenges. The debrief is staged (see `commercial/04_ACHIEVEMENTS_AND_CAREER_SPEC.md`). Historical screens (`VictoryScreen`/`LiquidationScreen`) are legacy fallback presentations superseded by `PostMatchDebriefModal`.

---

## 6. Implementation Reconciliation & Checklist

- [x] Composition-based `ScenarioEngine` architecture integrated cleanly into `SimulationEngine`.
- [x] Full catalog of 6 core scenarios implemented (`black_friday_rush` 48, `chaos_engineering_drill` 40, `ransomware_infiltration` 60, `ddos_global` 52, `deployment_rollback` 40, `third_party_outage` 45 ticks) plus the unregistered `custom` scenario.
- [x] Operational failure cascade (downstream) and ransomware lateral movement (outbound dependencies) strictly separated.
- [x] Dedicated `_lateral_movement_map` isolates security pivots from runtime operational changes.
- [x] `_evaluate_session_status()` enforces correct precedence (Bankruptcy $\to$ Scenario $\to$ Sandbox 720-tick survival).
- [x] Scenario state (`infected_service_ids`, `quarantined_service_ids`) persisted across restarts via `snapshot_extra()`/`restore_extra()`.
- [x] Backend calculates real-time scenario objectives exposed via `/api/scenarios/active`.
- [x] `PostMatchDebriefModal` established as the consolidated post-match experience.
- [x] Backend tests in `test_new_scenarios.py` and `test_engine_features.py` cover the scenario lifecycles and scoring paths (no coverage percentage is claimed here).
