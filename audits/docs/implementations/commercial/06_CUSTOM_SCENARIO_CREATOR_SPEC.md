# Custom Scenario Creator (Chaos Sandbox) — Implementation Specification

**Document ID:** IZ-COMM-06  
**Classification:** Technical Specification / Custom Scenarios & Chaos Scripting  
**Status:** Implementado  
**Source of Truth:** `backend/app/schemas/scenario.py`, `backend/app/engine/scenarios/custom_scenario.py`, `backend/app/api/v1/scenarios.py`, `frontend/src/components/modals/ScenarioBuilderModal.tsx`

---

## 1. System Objective

Allow operators to script and load data-driven custom crisis scenarios via structured JSON configurations. Operators can configure custom hazard multipliers, starting economic parameters, duration windows, victory constraints, and scheduled chaos failure injections across canonical services.

---

## 2. `CustomScenario` Engine Integration

Implemented in `backend/app/engine/scenarios/custom_scenario.py`:
- Inherits from `ScenarioEngine`.
- Applies the configured `hazard_multiplier` to the simulation loop.
- Evaluates scheduled `chaos_injections` on matching ticks, triggering `_trigger_service_failure()` on targeted services.
- Evaluates dynamic victory: defeat if budget breaches `budget_floor`, victory upon surviving `duration_ticks` without liquidation.

---

## 3. Configuration Schema & Strict Pre-Reset Validations

Configuration inputs are parsed and strictly validated by Pydantic in `backend/app/schemas/scenario.py`. **All validations occur before any session state is mutated or reset.** An invalid payload immediately aborts with HTTP 422, preserving the running session unharmed:

```python
class ChaosInjection(BaseModel):
    at_tick: int = Field(ge=0)
    service_id: str

    @field_validator("service_id")
    @classmethod
    def _service_must_exist(cls, v: str) -> str:
        # Validates against the engine's canonical topology catalog
        if v not in CANONICAL_SERVICE_IDS:
            raise ValueError(f"Unknown service_id: {v!r}")
        return v


class CustomScenarioConfig(BaseModel):
    duration_ticks: int = Field(ge=10, le=100_000)
    hazard_multiplier: float = Field(ge=0.0, le=20.0) # Rejects negative and non-finite NaN/Inf
    budget_floor: float = Field(ge=0.0, lt=_STANDARD_STARTING_BUDGET) # Must be < $250,000 baseline
    chaos_injections: List[ChaosInjection] = Field(default_factory=list, max_length=50)
    starting_budget: Optional[float] = Field(default=None, ge=1_000.0, le=2_000_000.0)
    starting_tech_debt: Optional[int] = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def _injections_within_window(self) -> "CustomScenarioConfig":
        for injection in self.chaos_injections:
            if injection.at_tick >= self.duration_ticks:
                raise ValueError(f"chaos_injections at_tick {injection.at_tick} must be before duration_ticks {self.duration_ticks}")
        return self

    @model_validator(mode="after")
    def _starting_budget_above_floor(self) -> "CustomScenarioConfig":
        if self.starting_budget is not None and self.starting_budget <= self.budget_floor:
            raise ValueError(f"starting_budget {self.starting_budget} must be greater than budget_floor {self.budget_floor}")
        return self
```

### Key Validation Guarantees:
1. **Canonical Service Verification:** Targeted `service_id` values are checked against `CANONICAL_SERVICE_IDS` (`{"srv-auth", "srv-payment", "srv-order", "srv-inventory", "srv-notify", "srv-api-gw"}`). It does not use `SERVICE_COMPETENCY_MAP`, ensuring strict topological accuracy.
2. **Temporal Window Bounds:** All scheduled chaos injection ticks must fall strictly before `duration_ticks`.
3. **Numeric Bounds & Solvency:** Rejects non-finite values (`NaN`, `Infinity`). Ensures starting budget strictly exceeds `budget_floor` to prevent instant defeat traps.
4. **Pre-Reset Execution:** If validation fails, `engine.reset()` is never called, safeguarding the active session from accidental destruction.

---

## 4. Loading Endpoint

- `POST /api/scenarios/custom/load` accepts `CustomScenarioConfig`.
- Only after successful schema validation, resets engine state and attaches `CustomScenario(engine, config)`:
  ```python
  @router.post("/api/scenarios/custom/load")
  async def load_custom_scenario(payload: CustomScenarioConfig, request: Request) -> Dict[str, Any]:
      engine = request.app.state.engine
      engine.reset()
      engine.load_custom_scenario(payload.model_dump())
      return {"success": True}
  ```

---

## 5. Challenge Codes & Sharing

Scenarios are encoded client-side into base64 challenge strings (`btoa(JSON.stringify(config))`) for sharing. The recipient decodes the string in `ScenarioBuilderModal.tsx` and submits it directly to the load endpoint.

---

## 6. Frontend Builder (`ScenarioBuilderModal.tsx`)

Accessible from `ScenarioSelectModal`. Provides reactive controls for duration, hazard multipliers, starting conditions, and an interactive list for scheduling chaos injection ticks and target services.
