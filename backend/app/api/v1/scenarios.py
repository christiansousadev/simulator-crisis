from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, Request

from app.core.database import SessionLocal
from app.engine.scenarios import SCENARIO_REGISTRY
from app.models.achievement import Achievement
from app.models.career import CareerRecord
from app.schemas.scenario import CustomScenarioConfig

router = APIRouter(tags=["scenarios"])


@router.get("/api/scenarios/catalog")
async def get_scenario_catalog(
    player_id: Optional[str] = Query(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
) -> List[Dict[str, Any]]:
    """LIST EVERY REGISTERED SCRIPTED CRISIS CHALLENGE MODE WITH REAL DURATION, CONDITIONS, OBJECTIVES, AND BEST RUNS"""
    records: List[CareerRecord] = []
    achievements: set = set()
    if player_id:
        db = SessionLocal()
        try:
            records = db.query(CareerRecord).filter(CareerRecord.player_id == player_id).all()
            ach_rows = db.query(Achievement).filter(Achievement.player_id == player_id).all()
            achievements = {a.achievement_key for a in ach_rows}
        finally:
            db.close()

    result = []
    for cls in SCENARIO_REGISTRY.values():
        unlocked = cls.is_unlocked(records, achievements)

        # Best record for this scenario
        matching_runs = [r for r in records if r.scenario_id == cls.scenario_id]
        best_run_dict = None
        if matching_runs:
            # Sort by victory, then days_survived, then final_sla_percentage
            best = max(
                matching_runs,
                key=lambda r: (
                    1 if r.outcome == "victory" else 0,
                    2 if getattr(r, "difficulty", "standard") == "chaos" else (1 if getattr(r, "difficulty", "standard") == "standard" else 0),
                    r.days_survived,
                    float(r.final_sla_percentage),
                ),
            )
            best_run_dict = {
                "id": best.id,
                "outcome": best.outcome,
                "difficulty": getattr(best, "difficulty", "standard") or "standard",
                "days_survived": best.days_survived,
                "final_sla_percentage": float(best.final_sla_percentage),
                "final_budget": float(best.final_budget),
                "recorded_at": best.recorded_at.isoformat() if best.recorded_at else None,
            }

        result.append({
            "scenario_id": cls.scenario_id,
            "display_name": cls.display_name,
            "duration_ticks": cls.duration_ticks,
            "description": cls.description,
            "special_conditions": cls.special_conditions,
            "objectives": cls.objectives_summary,
            "unlock_requirement": cls.unlock_requirement,
            "unlocked": unlocked,
            "best_record": best_run_dict,
        })
    return result


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
        # always recomputed here, server-side, from live scenario/engine state -- never cached or
        # declared by the client (see ScenarioEngine.objectives's docstring)
        "objectives": scenario.objectives(),
    }


@router.post("/api/scenarios/custom/load")
async def load_custom_scenario(payload: CustomScenarioConfig, request: Request) -> Dict[str, Any]:
    """RESET THE SESSION AND ATTACH A PLAYER-CONFIGURED CUSTOM CHAOS SCENARIO"""
    engine = request.app.state.engine
    engine.reset()
    engine.load_custom_scenario(payload.model_dump())
    return {"success": True}
