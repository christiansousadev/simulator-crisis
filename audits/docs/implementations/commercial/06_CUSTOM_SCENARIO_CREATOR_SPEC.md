# Custom Scenario Creator (Chaos Sandbox) — Implementation Specification

**Document ID:** IZ-COMM-06  
**Classification:** Technical Specification / Custom Scenarios & Chaos Scripting  
**Status:** Implementado e verificado contra o código (Outubro 2026)  
**Last Updated:** Outubro 2026  
**Source of Truth:** `backend/app/schemas/scenario.py`, `backend/app/engine/scenarios/custom_scenario.py`, `backend/app/api/v1/scenarios.py`, `frontend/src/components/modals/ScenarioBuilderModal.tsx`, `frontend/src/utils/scenarioConfig.ts`, `frontend/src/utils/launchFlow.ts`

---

## 1. System Objective

Allow operators to script and load data-driven custom crisis scenarios via structured JSON configurations. Operators can configure a custom hazard multiplier, a duration window, a budget floor (the defeat line), optional starting economic parameters, and scheduled chaos failure injections across the canonical services.

---

## 2. `CustomScenario` Engine Integration

Implemented in `backend/app/engine/scenarios/custom_scenario.py` (`scenario_id = "custom"`; it is intentionally **not** in `SCENARIO_REGISTRY`, so it is absent from `GET /api/scenarios/catalog` and is always created through `SimulationEngine.load_custom_scenario(config)`):
- Inherits from `ScenarioEngine`; `duration_ticks` comes from the config.
- `on_start()` applies the optional `starting_budget` and `starting_tech_debt` once (never again on a restore from a snapshot), sets the hazard multiplier, and fires every injection scheduled at `at_tick = 0` (see the timing semantics below).
- `on_tick()` sets the scenario hazard multiplier to the configured `hazard_multiplier` and fires `_trigger_service_failure()` for every not-yet-fired injection scheduled for the current tick, provided its target service is still `healthy` at that moment (an injection aimed at a service that is already degraded is skipped, and still counts as fired).
- **Timing semantics (tick-0 gap fixed):** `at_tick = N` (N >= 1) fires on the N-th simulated tick of the scenario (`elapsed_ticks` is incremented before `on_tick()` runs, so the first tick `on_tick()` sees is 1). `at_tick = 0` fires exactly once, at the start of the run, from `on_start()`, i.e. right after the session reset and before the first tick. The last tick that can fire an injection is `duration_ticks - 1`. Each injection fires at most once: the indices of fired injections are persisted in `snapshot_extra()` (`fired`) and rehydrated by `restore_extra()`, so a restored session neither re-fires past injections nor skips future ones. Covered by `backend/tests/test_custom_scenario_injections.py`.
- `objectives()` returns `stay_above_budget_floor` (`budget > budget_floor`) and `survive_duration`.
- `evaluate_victory()`: defeat (`outcome: "defeat"`, `compliant: false`) as soon as `budget <= budget_floor`; victory (`outcome: "victory"`, `compliant: true`) once `duration_ticks` have elapsed.
- The config is persisted by `snapshot_extra()` and the scenario is rebuilt from it on restart. A custom run uses the normal sandbox mitigation rules (only the six registered scenarios use the fixed "any permitted runbook fully heals" simplification) and, because it has a scenario attached, the generic 720-tick sandbox victory does not apply to it.

---

## 3. Configuration Schema & Strict Pre-Reset Validations

Configuration inputs are parsed and strictly validated by Pydantic in `backend/app/schemas/scenario.py`. **All validations occur before any session state is mutated or reset.** An invalid payload is rejected with HTTP 422 by FastAPI before the route handler runs, preserving the running session unharmed:

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
1. **Canonical Service Verification:** Targeted `service_id` values are checked against `CANONICAL_SERVICE_IDS`, the engine's own topology catalog in `simulator.py`: **the five services `srv-auth`, `srv-payment`, `srv-api-gw`, `srv-search` and `srv-notify`**. (An engine-level assertion keeps this tuple in sync with the default topology; it deliberately does not use `staff.SERVICE_COMPETENCY_MAP`, which only maps an existing service to a competency.)
2. **Temporal Window Bounds:** All scheduled chaos injection ticks must fall strictly before `duration_ticks`.
3. **Numeric Bounds & Solvency:** Rejects non-finite values (`NaN`, `Infinity`). `budget_floor` must be at least 0 and strictly below the `standard` starting budget (250,000, read from `DIFFICULTY_PRESETS`), and an explicit `starting_budget` must strictly exceed `budget_floor`, which prevents instant-defeat traps.
4. **Pre-Reset Execution:** If validation fails, `engine.reset()` is never called, safeguarding the active session from accidental destruction.

---

## 4. Loading Endpoint

- `POST /api/scenarios/custom/load` accepts `CustomScenarioConfig`.
- Only after successful schema validation, resets engine state (a plain `engine.reset()`, i.e. the default `standard` difficulty and a fresh run) and attaches `CustomScenario(engine, config)`:
  ```python
  @router.post("/api/scenarios/custom/load")
  async def load_custom_scenario(payload: CustomScenarioConfig, request: Request) -> Dict[str, Any]:
      engine = request.app.state.engine
      engine.reset()
      engine.load_custom_scenario(payload.model_dump())
      return {"success": True}
  ```
- Like every successful POST under `/api`, it triggers an immediate state push to WebSocket clients.

---

## 5. Challenge Codes & Sharing

Scenarios are encoded client-side into base64 challenge strings (`btoa(JSON.stringify(config))`, `encodeChallengeCode` in `utils/scenarioConfig.ts`) for sharing. `decodeChallengeCode` decodes and sanity-checks a pasted code (it must be a JSON object with numeric `duration_ticks`, `hazard_multiplier` and `budget_floor`; malformed injections are dropped) and returns `null` when the code is not a well-formed config. The decoded config is loaded into the builder, where it goes through the same client-side validation and then the same load endpoint, which re-validates on the server. A challenge code also carries the optional `starting_budget` and `starting_tech_debt` when they are set; they are omitted otherwise, so a code without them is byte-identical to one issued before they existed, and such old codes still decode (the fields stay unset). A `null` start field is treated as unset, a non-numeric one makes the whole code malformed (`null`).

---

## 6. Frontend Builder (`ScenarioBuilderModal.tsx`)

Accessible from `ScenarioSelectModal` ("Build Custom Scenario"); a `system`-layer `Modal`. The defaults are 60 ticks, hazard 1.5x, budget floor \$20,000 and no injections.

- **Sliders with live read-outs:** duration (10 to 720 ticks in steps of 10, shown with the approximate number of in-game days), hazard multiplier (0.0x to 5.0x in steps of 0.1) and budget floor (\$0 to \$240,000 in steps of \$5,000), each with a hint line. The slider ranges are deliberately narrower than the backend's (`duration` up to 100,000, `hazard` up to 20); the backend limits remain authoritative.
- **Chaos-injection list:** "Add injection" appends a row (up to 50, with a live `n/50` counter); each row has a tick slider (0 up to `duration - 1`, with a live "at tick N" label), a **friendly service picker** (a select listing the five canonical services by display name, using the same ids as the backend) and a remove button. An empty list shows a hint.
- **Inline validation:** `validateConfig` mirrors everything the backend would reject (duration, hazard and budget-floor ranges, more than 50 injections, an injection tick outside the window, an unknown service) and returns field-level errors that are shown next to the offending control (`aria-invalid`, `role="alert"` messages). The footer reports "N problems to fix" or "configuration valid", and the launch button is disabled while there are errors or a launch is in progress.
- **Share / import:** an export button copies the challenge code to the clipboard (falling back to filling the import box when the clipboard is unavailable), and an import box decodes a pasted code into the builder.
- **Launch:** "Test scenario" runs `launchCustomScenario(config, label)` through the shared launch flow, which calls the load endpoint, closes the dialog on success and raises an error toast on failure.
- **Starting conditions:** `Starting Budget ($)` (slider \$10,000 to \$1,000,000 in steps of \$5,000) and `Starting Tech Debt (TDI)` (0 to 100), each behind a `Use difficulty default` checkbox that is on by default and shows the standard default (\$250,000 and 25). Switching a field on seeds the slider with that default; switching it off omits the field from the payload. `validateConfig` mirrors the backend: the start must be within \$1,000 to \$2,000,000 and strictly above the budget floor, and tech debt must be an integer from 0 to 100.
