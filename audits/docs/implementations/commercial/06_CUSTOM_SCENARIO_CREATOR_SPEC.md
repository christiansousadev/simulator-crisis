# Custom Scenario Creator (Chaos Sandbox) — Implementation Specification

**Document ID:** IZ-COMM-06
**Classification:** Implementation Contract — Commercial Pillar 6
**Status:** Implemented, additive only, non-breaking
**Integration baseline:** `backend/app/engine/scenarios/base.py`, `backend/app/api/v1/scenarios.py`

---

## 1. System Objective

Generalize the fixed, hand-authored `ScenarioEngine` subclasses (`04_SCENARIOS_AND_GAME_MODES_SPEC.md`) into a fifth, data-driven scenario whose entire behavior is supplied by the player as a JSON configuration at load time, rather than compiled into a Python class — the foundation for a scenario-sharing community feature.

## 2. `CustomScenario` Engine

`backend/app/engine/scenarios/custom_scenario.py` defines `CustomScenario(ScenarioEngine)`, **not** registered in `SCENARIO_REGISTRY` (it has no fixed `scenario_id` string to register under — it is instantiated directly with a config, never looked up by name):

```python
class CustomScenario(ScenarioEngine):
    scenario_id = "custom"
    display_name = "Custom Scenario"

    def __init__(self, engine, config: Dict[str, Any]):
        super().__init__(engine)
        self.config = config
        self.duration_ticks = config["duration_ticks"]

    def on_tick(self):
        self.engine._scenario_hazard_multiplier = self.config["hazard_multiplier"]
        for injection in self.config["chaos_injections"]:
            if injection["at_tick"] == self.elapsed_ticks:
                srv = next((s for s in self.engine.services if s["id"] == injection["service_id"]), None)
                if srv and srv["status"] == "healthy":
                    self.engine._trigger_service_failure(srv)

    def evaluate_victory(self):
        if self.engine.budget <= self.config["budget_floor"]:
            return {"scenario_id": self.scenario_id, "outcome": "defeat", "compliant": False}
        if not self.is_expired():
            return None
        return {"scenario_id": self.scenario_id, "outcome": "victory", "compliant": True}
```

`hazard_multiplier` is read through the same `getattr(self, "_scenario_hazard_multiplier", 1.0)` call site every other scenario already uses (Document `04_SCENARIOS_AND_GAME_MODES_SPEC.md` § 2.1) — no new read path in `_evaluate_random_failures` is required. `chaos_injections` reuses `_trigger_service_failure` verbatim, exactly as `ChaosEngineeringDrillScenario` already does.

## 3. Configuration Schema

`backend/app/schemas/scenario.py` gains `CustomScenarioConfig`:

```python
class ChaosInjection(BaseModel):
    at_tick: int
    service_id: str

class CustomScenarioConfig(BaseModel):
    duration_ticks: int
    hazard_multiplier: float
    budget_floor: float
    chaos_injections: List[ChaosInjection] = []
```

This is the complete, exhaustive configuration surface: base traffic rate is expressed as `hazard_multiplier` (identical mechanism the built-in `black_friday_rush` scenario already uses for its own traffic-surge effect), failure probability as the same multiplier, budget constraint as `budget_floor`, and scheduled chaos as the `chaos_injections` list.

## 4. Loading Endpoint

`POST /api/scenarios/custom/load` — additive to `scenarios.py`. Resets the engine to a clean state first (so a custom scenario always starts from the standard \$250,000/25-tech-debt baseline, never from mid-session leftover state), then attaches the configured instance directly:

```python
@router.post("/api/scenarios/custom/load")
async def load_custom_scenario(payload: CustomScenarioConfig, request: Request) -> Dict[str, Any]:
    engine = request.app.state.engine
    engine.reset()
    engine.load_custom_scenario(payload.model_dump())
    return {"success": True}
```

`SimulationEngine.load_custom_scenario(config)` is a new one-line method: `self.active_scenario = CustomScenario(self, config)`.

## 5. Sharing — Challenge Codes

No new database table or backend storage is introduced for saved scenarios. A "challenge code" is simply the JSON configuration, base64-encoded client-side (`btoa(JSON.stringify(config))`) for easy pasting into chat/forums, and decoded (`JSON.parse(atob(code))`) back into the builder form on import. This keeps the feature fully self-contained on the client and requires no scenario-hosting infrastructure for this release.

## 6. Frontend — Scenario Builder

`components/modals/ScenarioBuilderModal.tsx`, reachable from the existing `ScenarioSelectModal`, exposes number inputs for duration, hazard multiplier, and budget floor, plus a repeatable chaos-injection row editor (tick + service dropdown), an "Export Code" button (copies the base64 string to the clipboard) and an "Import Code" text field, and a "Test Scenario" button calling `POST /api/scenarios/custom/load`.
