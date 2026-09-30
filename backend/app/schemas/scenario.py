from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from app.engine.simulator import CANONICAL_SERVICE_IDS, DIFFICULTY_PRESETS

# the standard-difficulty starting budget is exactly what load_custom_scenario's engine.reset()
# call always sets self.budget to (it passes no difficulty) -- a client-supplied budget_floor at
# or above this guarantees an instant, unconditional defeat on the very next tick, so it's the
# natural, non-duplicated ceiling to bound against rather than an arbitrary magic number
_STANDARD_STARTING_BUDGET = DIFFICULTY_PRESETS["standard"]["starting_budget"]
_MAX_CHAOS_INJECTIONS = 50


class ScenarioCatalogEntry(BaseModel):
    scenario_id: str
    display_name: str
    duration_ticks: int


class ActiveScenarioResponse(BaseModel):
    scenario_id: Optional[str] = None
    elapsed_ticks: Optional[int] = None
    duration_ticks: Optional[int] = None
    completed: Optional[bool] = None
    outcome: Optional[Dict[str, Any]] = None
    objectives: Optional[List[Dict[str, Any]]] = None


class ChaosInjection(BaseModel):
    at_tick: int = Field(ge=0)
    service_id: str

    @field_validator("service_id")
    @classmethod
    def _service_must_exist(cls, v: str) -> str:
        """REJECT A REFERENCE TO A SERVICE THAT DOESN'T EXIST IN THE ENGINE'S FIXED TOPOLOGY --
        VALIDATES AGAINST THE ENGINE'S OWN CANONICAL SERVICE CATALOG (NOT staff.py's COMPETENCY
        MAP, WHICH ONLY MAPS AN EXISTING SERVICE TO ITS NEAREST COMPETENCY AND MUST NEVER BE
        TREATED AS THE SOURCE OF WHICH SERVICES EXIST)"""
        if v not in CANONICAL_SERVICE_IDS:
            raise ValueError(f"Unknown service_id: {v!r}")
        return v


class CustomScenarioConfig(BaseModel):
    # bounds chosen to comfortably cover the scenario builder UI (default 60 ticks, a 10-tick
    # floor already enforced client-side) while rejecting a degenerate config (a <=0 duration
    # makes is_expired() true on the very first tick, i.e. an instant, unconditional "victory")
    duration_ticks: int = Field(ge=10, le=100_000)
    # a negative multiplier would drive failure_probability to (or below) zero -- an "unloseable"
    # custom scenario -- and an unbounded one is pointless since clamp_probability already caps
    # the effective probability regardless; ge/le also reject NaN/Infinity here (any comparison
    # against them is False, so the bound check fails and pydantic rejects the payload outright)
    hazard_multiplier: float = Field(ge=0.0, le=20.0)
    # ge=0 blocks a negative floor (self.budget is already clamped to >=0 everywhere, so a
    # negative floor could never be crossed -- another "unloseable" shape); lt=starting budget
    # blocks the instant-defeat shape described above
    budget_floor: float = Field(ge=0.0, lt=_STANDARD_STARTING_BUDGET)
    chaos_injections: List[ChaosInjection] = Field(default_factory=list, max_length=_MAX_CHAOS_INJECTIONS)
    # optional initial-condition overrides applied once by CustomScenario.on_start() -- omitted
    # fields just keep whatever reset() already set from the selected difficulty preset
    starting_budget: Optional[float] = Field(default=None, ge=1_000.0, le=2_000_000.0)
    starting_tech_debt: Optional[int] = Field(default=None, ge=0, le=100)

    @model_validator(mode="after")
    def _injections_within_window(self) -> "CustomScenarioConfig":
        """A CHAOS INJECTION SCHEDULED AT OR AFTER THE SCENARIO'S OWN duration_ticks WOULD NEVER
        FIRE (on_tick STOPS ADVANCING elapsed_ticks PAST THE SCENARIO'S END) -- REJECTED HERE
        RATHER THAN SILENTLY ACCEPTED AND SILENTLY INERT"""
        for injection in self.chaos_injections:
            if injection.at_tick >= self.duration_ticks:
                raise ValueError(
                    f"chaos_injections at_tick {injection.at_tick} must be before duration_ticks {self.duration_ticks}"
                )
        return self

    @model_validator(mode="after")
    def _starting_budget_above_floor(self) -> "CustomScenarioConfig":
        """AN EXPLICIT starting_budget AT OR BELOW budget_floor WOULD BE AN INSTANT, GUARANTEED
        DEFEAT ON THE VERY FIRST TICK -- THE SAME DEGENERATE SHAPE budget_floor's OWN BOUNDS
        ALREADY REJECT AGAINST THE DEFAULT STANDARD STARTING BUDGET, NOW ALSO CHECKED AGAINST A
        PLAYER-CHOSEN STARTING BUDGET WHEN ONE IS GIVEN"""
        if self.starting_budget is not None and self.starting_budget <= self.budget_floor:
            raise ValueError(
                f"starting_budget {self.starting_budget} must be greater than budget_floor {self.budget_floor}"
            )
        return self
