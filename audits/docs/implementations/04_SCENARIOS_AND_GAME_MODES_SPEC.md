# Scenarios and Game Modes — Implementation Specification

**Document ID:** IZ-IMPL-04
**Classification:** Implementation Contract / Next-Phase Architecture Blueprint
**Status:** Approved for implementation — additive only, non-breaking
**Integration baseline:** `backend/app/engine/simulator.py`, `backend/app/main.py`, `backend/app/api/v1/sessions.py`

---

## 1. System Objective

Introduce a `ScenarioEngine` orchestration layer that can wrap the existing `SimulationEngine` tick loop with a scripted, time-boxed challenge — without forking, subclassing in a way that breaks substitutability, or altering a single line of the default sandbox behavior when no scenario is active. The default sandbox mode (the entire currently-shipped game) remains the unconditional default and requires zero changes to run exactly as it does today; scenarios are an opt-in session-creation parameter.

---

## 2. Architectural Design

### 2.1 `ScenarioEngine` Placement and Contract

New package: `backend/app/engine/scenarios/`, containing:

```
backend/app/engine/scenarios/
├── __init__.py
├── base.py                 # ScenarioEngine abstract base + registry
├── black_friday_rush.py
├── ransomware_infiltration.py
└── chaos_engineering_drill.py
```

`base.py` defines the orchestrator contract as a composition wrapper, not an inheritance relationship with `SimulationEngine` — this is the key non-breaking design decision: `SimulationEngine` itself gains exactly one new optional constructor parameter and one new optional per-tick hook call, both defaulting to no-ops, so every existing instantiation site (`main.py`'s `SimulationEngine(session_id="incidentzero-alpha")`) continues to work verbatim.

```python
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class ScenarioEngine(ABC):
    """BASE CLASS FOR A SCRIPTED CRISIS CHALLENGE MODE LAYERED OVER THE CORE SIMULATION ENGINE"""

    scenario_id: str
    display_name: str
    duration_ticks: int

    def __init__(self, engine: "SimulationEngine"):
        self.engine = engine
        self.elapsed_ticks: int = 0
        self.completed: bool = False
        self.outcome: Optional[Dict[str, Any]] = None

    @abstractmethod
    def on_tick(self) -> None:
        """APPLY SCENARIO-SPECIFIC STATE MUTATIONS FOR THE CURRENT TICK. CALLED AFTER THE CORE TICK RESOLVES."""
        raise NotImplementedError

    @abstractmethod
    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        """RETURN A SCORING PAYLOAD IF THE SCENARIO HAS CONCLUDED, ELSE NONE"""
        raise NotImplementedError

    def is_expired(self) -> bool:
        """CHECK WHETHER THE SCENARIO'S FIXED DURATION HAS ELAPSED"""
        return self.elapsed_ticks >= self.duration_ticks


SCENARIO_REGISTRY: Dict[str, type] = {}


def register_scenario(cls: type) -> type:
    """DECORATOR: REGISTER A SCENARIOENGINE SUBCLASS BY ITS SCENARIO_ID"""
    SCENARIO_REGISTRY[cls.scenario_id] = cls
    return cls
```

**Integration point in `SimulationEngine`** (`backend/app/engine/simulator.py`):

```python
def __init__(self, session_id: str = "default-session", scenario_id: Optional[str] = None):
    # ...every existing line unchanged...
    self.active_scenario: Optional["ScenarioEngine"] = None
    if scenario_id:
        from app.engine.scenarios.base import SCENARIO_REGISTRY
        scenario_cls = SCENARIO_REGISTRY.get(scenario_id)
        if scenario_cls:
            self.active_scenario = scenario_cls(self)
```

```python
def _update_simulation_tick(self):
    """EXECUTE SYSTEMIC DEGRADATION, BURN RATES, INCIDENT PENALTIES AND CASCADE RISK"""
    instant_sla = formulas.instant_sla_percentage(self.services)
    self.cumulative_sla_points += instant_sla
    self.sla_percentage = self.cumulative_sla_points / (self.current_tick + 1)

    self._apply_budget_burn()
    self._apply_happiness_drift()
    self._progress_incidents()
    self._apply_quiet_period_refactor()
    self._evaluate_random_failures()
    self._evaluate_session_status()

    if self.active_scenario:
        self.active_scenario.elapsed_ticks += 1
        self.active_scenario.on_tick()
        outcome = self.active_scenario.evaluate_victory()
        if outcome is not None:
            self.active_scenario.completed = True
            self.active_scenario.outcome = outcome
            self._log_audit_event(
                event_type="SCENARIO_CONCLUDED",
                actor="AUDIT_SYSTEM",
                details=outcome,
                compliance_flag=outcome.get("compliant", True),
            )
```

Every line above the `if self.active_scenario:` guard is **byte-identical** to the current implementation (Document 05, `simulator.py:327-338` reference). The scenario hook is a strict appendix to the existing method body — the default sandbox session (`active_scenario is None`) executes exactly the same six calls it does today, in the same order, with no wrapper overhead beyond one `if` check that short-circuits to nothing.

### 2.2 Session Creation Parameter

`backend/app/api/v1/sessions.py`'s session-reset/creation endpoint gains one new optional field on its request schema (additive, defaulting to `None` so every existing client request continues to behave identically):

```python
class SessionResetRequest(BaseModel):
    scenario_id: Optional[str] = None
```

`SimulationEngine.reset()` gains the same optional parameter, threaded through to re-instantiate `self.active_scenario` exactly as `__init__` does, preserving the existing zero-argument `reset()` call sites (Document 01, `sessions.py` reference) as fully valid.

New endpoint, additive to the same router: `GET /api/scenarios/catalog`, returning the display metadata (`scenario_id`, `display_name`, `duration_ticks`, a narrative summary) for every entry in `SCENARIO_REGISTRY` — the frontend's scenario-select screen (§ 4) consumes this rather than hardcoding scenario metadata client-side, mirroring the `MITIGATION_CATALOG`/`UPGRADE_CATALOG` server-is-source-of-truth convention already established twice in this directory.

---

## 3. Challenge Scenarios

### 3.1 "Black Friday Rush"

```python
@register_scenario
class BlackFridayRushScenario(ScenarioEngine):
    scenario_id = "black_friday_rush"
    display_name = "Black Friday Rush"
    duration_ticks = 48

    TRAFFIC_MULTIPLIER = 4.0
    CLOUD_BURN_ACCELERATION = 2.5

    def on_tick(self):
        """APPLY 4X QUERY LOAD, MANDATORY AUTO-SCALING PRESSURE, AND ACCELERATED CLOUD BURN"""
        for srv in self.engine.services:
            if srv["status"] == "healthy":
                srv["latency_ms"] = int(srv["latency_ms"] * 1.02)  # gradual creeping latency under sustained load
        # traffic multiplier feeds directly into the cascading hazard evaluation via a scenario-scoped
        # tech-debt-equivalent surcharge, since formulas.cascading_failure_probability takes tech_debt
        # as its sole non-topology input — this scenario temporarily inflates the *effective* tech debt
        # term read at the _evaluate_random_failures call site, without mutating the persisted tech_debt stat:
        self.engine._scenario_hazard_multiplier = self.TRAFFIC_MULTIPLIER / 4.0 + 1.0  # 2.0x hazard during the surge
        # cloud burn acceleration is applied as a direct passive-burn surcharge:
        self.engine.budget = max(0.0, self.engine.budget - (formulas.PASSIVE_CLOUD_BURN * (self.CLOUD_BURN_ACCELERATION - 1.0)))

    def evaluate_victory(self):
        """SCORE SURVIVAL OF THE 48-TICK SURGE WINDOW"""
        if not self.is_expired():
            return None
        return {
            "scenario_id": self.scenario_id,
            "sla_maintained": self.engine.sla_percentage >= formulas.SLA_BREACH_THRESHOLD,
            "final_sla_percentage": round(self.engine.sla_percentage, 2),
            "net_runway_saved": round(self.engine.budget, 2),
            "compliant": self.engine.sla_percentage >= formulas.SLA_BREACH_THRESHOLD,
        }
```

`self.engine._scenario_hazard_multiplier` is read by one additive line in `_evaluate_random_failures`:

```python
failure_probability = formulas.cascading_failure_probability(self.tech_debt, dep_statuses)
failure_probability *= getattr(self, "_scenario_hazard_multiplier", 1.0)
```

`getattr(..., 1.0)` guarantees the default sandbox path (where `_scenario_hazard_multiplier` is never set) is mathematically unaffected — multiplying by `1.0` is the identity operation, making this line a provable no-op in the absence of an active scenario.

"Mandatory horizontal pod auto-scaling" is realized as a scenario-specific constraint on `apply_mitigation`: while `BlackFridayRushScenario` is active and incomplete, `apply_mitigation` rejects `rollback` and `emergency_patch` action IDs targeting a service currently exhibiting `latency_ms > 500` with `{"success": false, "error": "Black Friday Rush: only Spin Replicas is permitted to address capacity-driven degradation"}` — implemented as one additional guard clause in `apply_mitigation`, gated behind `if self.active_scenario and self.active_scenario.scenario_id == "black_friday_rush"`, so it has zero effect on any other session state.

### 3.2 "Ransomware Infiltration"

```python
@register_scenario
class RansomwareInfiltrationScenario(ScenarioEngine):
    scenario_id = "ransomware_infiltration"
    display_name = "Ransomware Infiltration"
    duration_ticks = 60

    LATERAL_MOVEMENT_INTERVAL_TICKS = 4

    def __init__(self, engine):
        super().__init__(engine)
        # infection spreads along the existing dependency graph, starting from the lowest-tier, most
        # peripheral service — srv-notify has no downstream dependents, making it a realistic initial
        # foothold that must be contained before it can pivot toward srv-api-gw and, ultimately, the
        # topology's implicit "master db" represented here by srv-payment (the most upstream critical node)
        self.infected_service_ids = {"srv-notify"}
        self.quarantined_service_ids = set()

    def on_tick(self):
        """PROPAGATE INFECTION ALONG UNQUARANTINED DEPENDENCY EDGES EVERY 4 TICKS"""
        if self.elapsed_ticks % self.LATERAL_MOVEMENT_INTERVAL_TICKS != 0:
            return
        newly_infected = set()
        for srv in self.engine.services:
            if srv["id"] in self.quarantined_service_ids:
                continue
            for dep_id in srv["dependencies"]:
                if dep_id in self.infected_service_ids and srv["id"] not in self.quarantined_service_ids:
                    newly_infected.add(srv["id"])
        self.infected_service_ids |= newly_infected
        for srv in self.engine.services:
            if srv["id"] in self.infected_service_ids and srv["id"] not in self.quarantined_service_ids:
                srv["status"] = "degraded"
                srv["error_rate"] = min(1.0, srv["error_rate"] + 0.15)

    def evaluate_victory(self):
        """VICTORY IF THE MASTER DB (SRV-PAYMENT) NEVER BECOMES FULLY ENCRYPTED (STATUS=DOWN WHILE INFECTED); DEFEAT OTHERWISE"""
        master_db_encrypted = "srv-payment" in self.infected_service_ids and any(
            s["id"] == "srv-payment" and s["status"] == "down" for s in self.engine.services
        )
        if master_db_encrypted:
            return {
                "scenario_id": self.scenario_id,
                "outcome": "defeat",
                "master_db_encrypted": True,
                "compliant": False,
            }
        if not self.is_expired():
            return None
        return {
            "scenario_id": self.scenario_id,
            "outcome": "victory",
            "master_db_encrypted": False,
            "services_contained": len(self.quarantined_service_ids),
            "compliant": True,
        }
```

Quarantine is realized by mapping the existing `circuit_breaker` runbook (Document 04 § 1) onto this scenario's infection model: while `RansomwareInfiltrationScenario` is active, executing `circuit_breaker` against an infected, unquarantined service adds that `service_id` to `self.active_scenario.quarantined_service_ids` (one additional line inside `apply_mitigation`, gated the same way as § 3.1's guard clause) **in addition to** its normal healing effect — quarantine does not replace or bypass the existing runbook mechanics, it is layered on top of them for this scenario only.

### 3.3 "Chaos Engineering Drill"

```python
@register_scenario
class ChaosEngineeringDrillScenario(ScenarioEngine):
    scenario_id = "chaos_engineering_drill"
    display_name = "Chaos Engineering Drill"
    duration_ticks = 40

    CHAOS_STRIKE_PROBABILITY_PER_TICK = 0.20

    def on_tick(self):
        """RANDOMLY DEGRADE A HEALTHY SERVICE EACH TICK WITH FIXED PROBABILITY, INDEPENDENT OF THE NATURAL HAZARD MODEL"""
        if random.random() >= self.CHAOS_STRIKE_PROBABILITY_PER_TICK:
            return
        healthy = [s for s in self.engine.services if s["status"] == "healthy"]
        if not healthy:
            return
        target = random.choice(healthy)
        self.engine._trigger_service_failure(target)
        self.engine._log_audit_event(
            event_type="CHAOS_STRIKE",
            actor="AUTOMATED_MONITOR",
            details={"service_id": target["id"]},
            compliance_flag=True,
        )

    def evaluate_victory(self):
        """SCORE RESILIENCE: ZERO REGULATORY BREACH FLAGS ACROSS THE FULL 40-TICK DRILL"""
        if not self.is_expired():
            return None
        breach_flags = sum(
            1 for entry in self.engine.audit_logs
            if entry["compliance_flag"] is False and entry["tick"] >= (self.engine.current_tick - self.duration_ticks)
        )
        return {
            "scenario_id": self.scenario_id,
            "regulatory_breach_flags": breach_flags,
            "compliant": breach_flags == 0,
            "final_sla_percentage": round(self.engine.sla_percentage, 2),
        }
```

This scenario deliberately reuses the existing `_trigger_service_failure` method verbatim (Document 05, `simulator.py:413-426`) rather than duplicating incident-construction logic — chaos-injected incidents are indistinguishable in the audit ledger from naturally-occurring ones except via the separate `CHAOS_STRIKE` audit event this method also logs, giving a reviewer a clean way to filter "which incidents were drill-injected" without altering the `Incident` schema itself.

One additive audit event type introduced across § 3.2–3.3, plus the scenario-conclusion event from § 2.1:

| `event_type` | Trigger | Actor | `compliance_flag` | Payload |
|---|---|---|---|---|
| `CHAOS_STRIKE` | Chaos Engineering Drill's random strike fires | `AUTOMATED_MONITOR` | `True` | `{"service_id": string}` |
| `SCENARIO_CONCLUDED` | Any active scenario's `evaluate_victory()` returns non-`None` | `AUDIT_SYSTEM` | Mirrors the scenario's own `outcome["compliant"]` value | Scenario-specific outcome dict (union of the three `evaluate_victory()` return shapes above) |

---

## 4. Scoring & Victory Conditions

All three scenarios share a common scoring vocabulary, satisfying the specification's three named criteria (`SLA maintained`, `net runway saved`, `zero regulatory breach flags`) even where a given scenario's primary win condition is narratively distinct (e.g., Ransomware's binary encrypted/not-encrypted outcome):

| Scenario | SLA Maintained | Net Runway Saved | Zero Regulatory Breach Flags |
|---|---|---|---|
| Black Friday Rush | Primary win condition (`sla_percentage >= SLA_BREACH_THRESHOLD` at expiry) | Reported as `net_runway_saved`, informational | Derived: any `compliance_flag=False` audit row during the window is visible in the post-scenario ledger review, not gating |
| Ransomware Infiltration | Reported, not gating | Reported, not gating | Primary win condition is binary containment (`master_db_encrypted`), a stricter and more narratively appropriate criterion than a percentage threshold for a security-breach scenario |
| Chaos Engineering Drill | Reported (`final_sla_percentage`) | Not applicable to this scenario's design intent | Primary win condition (`regulatory_breach_flags == 0`) |

Every scenario's `evaluate_victory()` return dict includes a `compliant: bool` field specifically so `SCENARIO_CONCLUDED`'s `compliance_flag` (§ 3.3's table) is always mechanically derived from the scenario's own stated success criterion — a governance-consistent design decision preventing a "the scenario is displayed as won but the audit ledger marks it a compliance violation" contradiction.

### 4.1 REST Endpoint — Scenario Status

`GET /api/scenarios/active` — additive, returns `null` when `self.active_scenario is None` (the default sandbox case) or the scenario's `scenario_id`, `elapsed_ticks`, `duration_ticks`, `completed`, and `outcome` (once concluded). This is the endpoint the frontend's scenario HUD overlay (§ 5) polls/derives from the `TICK_BROADCAST` extension below.

`TICK_BROADCAST` gains one additive key:

```python
"active_scenario": (
    {
        "scenario_id": self.active_scenario.scenario_id,
        "elapsed_ticks": self.active_scenario.elapsed_ticks,
        "duration_ticks": self.active_scenario.duration_ticks,
        "completed": self.active_scenario.completed,
        "outcome": self.active_scenario.outcome,
    }
    if self.active_scenario else None
),
```

---

## 5. UI/UX Integration Notes

A new pre-session **Scenario Select** screen (a new top-level route/view, not replacing the existing default game view — the existing "start sandbox" path remains the default action) lists the `GET /api/scenarios/catalog` entries as selectable cards, each launching `POST /api/session/reset` (Document 01's existing reset endpoint) with the new optional `scenario_id` field populated. A persistent scenario HUD banner (new component, `frontend/src/components/layout/ScenarioBanner.tsx`) renders conditionally — `hidden` via the codebase's established `[hidden]` visibility convention — whenever `telemetry.active_scenario !== null`, showing `elapsed_ticks / duration_ticks` as a progress bar and, on conclusion, a scenario-specific victory/defeat summary card reusing the existing `VictoryScreen.tsx`/`LiquidationScreen.tsx` full-screen modal idiom (Document 01 § Component Inventory) rather than introducing a fourth terminal-state screen pattern.

---

## 6. Non-Breaking Compliance Checklist

- [x] `SimulationEngine.__init__` and `_update_simulation_tick` gain strictly additive parameters/steps; every existing call site and every line preceding the new scenario hook is untouched.
- [x] `getattr(self, "_scenario_hazard_multiplier", 1.0)` guarantees the hazard-multiplier hook is a provable identity operation when no scenario is active.
- [x] All three scenario-specific `apply_mitigation` guard clauses are gated on `self.active_scenario and self.active_scenario.scenario_id == "..."`, making them unreachable, and therefore behaviorally inert, for the default sandbox session and for every other scenario.
- [x] `_trigger_service_failure` and the existing `MITIGATION_CATALOG`/`circuit_breaker` mechanics are reused verbatim rather than forked, avoiding logic duplication that could drift from the core engine's behavior.
- [x] `TICK_BROADCAST` gains one additive, nullable-by-default `active_scenario` key.
- [x] Two new audit event types are additive rows in the enumerated event-type set.
- [x] The default sandbox mode requires no scenario-related configuration and is unreachable-by-construction from any scenario-only code path.
