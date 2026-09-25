from typing import Any, Dict, List

from fastapi import APIRouter, Request

from app.engine.scenarios import SCENARIO_REGISTRY
from app.schemas.scenario import CustomScenarioConfig

router = APIRouter(tags=["scenarios"])


@router.get("/api/scenarios/catalog")
async def get_scenario_catalog() -> List[Dict[str, Any]]:
    """LIST EVERY REGISTERED SCRIPTED CRISIS CHALLENGE MODE"""
    return [
        {"scenario_id": cls.scenario_id, "display_name": cls.display_name, "duration_ticks": cls.duration_ticks}
        for cls in SCENARIO_REGISTRY.values()
    ]


@router.get("/api/scenarios/active")
async def get_active_scenario(request: Request) -> Dict[str, Any]:
    """RETRIEVE THE CURRENTLY RUNNING SCENARIO'S PROGRESS AND OUTCOME, IF ANY"""
    engine = request.app.state.engine
    scenario = engine.active_scenario
    if not scenario:
        return {"active": False}
    return {
        "active": True,
        "scenario_id": scenario.scenario_id,
        "elapsed_ticks": scenario.elapsed_ticks,
        "duration_ticks": scenario.duration_ticks,
        "completed": scenario.completed,
        "outcome": scenario.outcome,
    }


@router.post("/api/scenarios/custom/load")
async def load_custom_scenario(payload: CustomScenarioConfig, request: Request) -> Dict[str, Any]:
    """RESET THE SESSION AND ATTACH A PLAYER-CONFIGURED CUSTOM CHAOS SCENARIO"""
    engine = request.app.state.engine
    engine.reset()
    engine.load_custom_scenario(payload.model_dump())
    return {"success": True}
