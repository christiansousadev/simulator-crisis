from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, field_validator

from app.core.version import get_app_version
from app.engine.scenarios import SCENARIO_REGISTRY

router = APIRouter(tags=["session"])


class SpeedRequest(BaseModel):
    # the UI only ever offers 1x/2x/5x (frontend/src/components/layout/Topbar.tsx's SPEED_OPTIONS);
    # le=10 covers that with headroom while blocking an arbitrarily large multiplier from driving
    # tick_rate_seconds (= 1.0/multiplier) toward zero and spinning the tick loop uncontrollably
    multiplier: float = Field(gt=0, le=10)


class SessionResetRequest(BaseModel):
    scenario_id: Optional[str] = None
    # bounded to the same shape frontend/src/utils/playerId.ts actually generates
    # (crypto.randomUUID(), or its "player-<ms>-<hex>" fallback) and to the DB column width
    # (models.career.CareerRecord.player_id is String(64)) -- this is a sanity/storage-abuse
    # guard, not an identity check: nothing here proves the caller owns this id (there is no
    # auth layer), so career/leaderboard records remain attributable only on trust
    player_id: Optional[str] = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    difficulty: Optional[str] = None

    @field_validator("scenario_id")
    @classmethod
    def _scenario_must_exist(cls, v: Optional[str]) -> Optional[str]:
        """REJECT AN UNRECOGNIZED scenario_id HERE, BEFORE THE ROUTE HANDLER EVER CALLS
        engine.reset() -- PREVIOUSLY, A TYPO'D/UNKNOWN scenario_id SILENTLY FELL BACK TO "NO
        SCENARIO" WITH NO ERROR, EVEN THOUGH THE RESPONSE STILL ECHOED IT BACK AS IF IT HAD
        WORKED. VALIDATING HERE MEANS THE CURRENT SESSION IS NEVER RESET FOR AN INVALID REQUEST."""
        if v is not None and v not in SCENARIO_REGISTRY:
            raise ValueError(f"Unknown scenario_id: {v!r}")
        return v


@router.get("/api/health")
async def health_check(request: Request) -> Dict[str, Any]:
    """SYSTEM HEALTHCHECK AND RUNTIME STATUS"""
    engine = request.app.state.engine
    return {
        "status": "online",
        "version": get_app_version(),
        "engine_active": engine.is_running,
        "current_tick": engine.current_tick,
        "active_clients": len(engine.active_websockets),
    }


@router.get("/api/difficulty/presets")
async def get_difficulty_presets() -> List[Dict[str, Any]]:
    """LIST THE FORMAL DIFFICULTY PRESETS AND THEIR EXACT ENGINE IMPACT DIMENSIONS"""
    return [
        {
            "id": "intern",
            "name": "Intern",
            "starting_budget": 320000.0,
            "hazard_multiplier": 0.7,
            "budget_delta_label": "+$70,000 (+28%)",
            "incident_rate_label": "0.7x (-30%)",
            "cascade_severity": "Low",
            "description": "Starting runway: $320,000. Incident hazard rate: 0.7x (-30%). Forgiving operational environment for learning runbooks.",
        },
        {
            "id": "standard",
            "name": "Standard",
            "starting_budget": 250000.0,
            "hazard_multiplier": 1.0,
            "budget_delta_label": "$250,000 (Baseline)",
            "incident_rate_label": "1.0x (Baseline)",
            "cascade_severity": "Moderate",
            "description": "Starting runway: $250,000. Incident hazard rate: 1.0x. The canonical enterprise crisis simulation experience.",
        },
        {
            "id": "chaos",
            "name": "Chaos",
            "starting_budget": 180000.0,
            "hazard_multiplier": 1.4,
            "budget_delta_label": "-$70,000 (-28%)",
            "incident_rate_label": "1.4x (+40%)",
            "cascade_severity": "Severe",
            "description": "Starting runway: $180,000. Incident hazard rate: 1.4x (+40%). High cascading failure probability and strict cost limits.",
        },
    ]


@router.get("/api/session/state")
async def get_state(request: Request) -> Dict[str, Any]:
    """RETRIEVE COMPLETE SYSTEM TELEMETRY SNAPSHOT"""
    return request.app.state.engine.get_state_payload()


@router.post("/api/session/start")
async def start_simulation(request: Request) -> Dict[str, Any]:
    """RESUME SIMULATION TICK ADVANCEMENT"""
    engine = request.app.state.engine
    engine.start()
    return {"message": "Simulation started", "is_running": engine.is_running}


@router.post("/api/session/pause")
async def pause_simulation(request: Request) -> Dict[str, Any]:
    """PAUSE SIMULATION TICK ADVANCEMENT"""
    engine = request.app.state.engine
    engine.pause()
    return {"message": "Simulation paused", "is_running": engine.is_running}


@router.post("/api/session/speed")
async def set_speed(payload: SpeedRequest, request: Request) -> Dict[str, Any]:
    """UPDATE TICK SPEED FACTOR"""
    engine = request.app.state.engine
    engine.set_speed(payload.multiplier)
    return {"message": f"Speed factor set to {payload.multiplier}x", "multiplier": payload.multiplier}


@router.post("/api/session/reset")
async def reset_simulation(
    request: Request,
    # a shared default instance is safe here (unlike ruff's B008 concern about mutable-default
    # traps): every field is Optional[...]=None, nothing in this handler mutates `payload`, and
    # this lets a bare `POST /api/session/reset` with no body reset to the same defaults
    payload: SessionResetRequest = SessionResetRequest(),  # noqa: B008
) -> Dict[str, Any]:
    """RESTART THE SIMULATION FROM A CLEAN STATE, OPTIONALLY INTO A SCRIPTED SCENARIO"""
    engine = request.app.state.engine
    engine.reset(scenario_id=payload.scenario_id, player_id=payload.player_id, difficulty=payload.difficulty)
    return {
        "message": "Simulation reset",
        "is_running": engine.is_running,
        "scenario_id": payload.scenario_id,
        "difficulty": engine.difficulty,
    }
