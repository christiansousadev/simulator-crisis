from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class ScenarioCatalogEntry(BaseModel):
    scenario_id: str
    display_name: str
    duration_ticks: int


class SessionResetRequest(BaseModel):
    scenario_id: Optional[str] = None


class ActiveScenarioResponse(BaseModel):
    scenario_id: Optional[str] = None
    elapsed_ticks: Optional[int] = None
    duration_ticks: Optional[int] = None
    completed: Optional[bool] = None
    outcome: Optional[Dict[str, Any]] = None


class ChaosInjection(BaseModel):
    at_tick: int
    service_id: str


class CustomScenarioConfig(BaseModel):
    duration_ticks: int
    hazard_multiplier: float
    budget_floor: float
    chaos_injections: List[ChaosInjection] = []
