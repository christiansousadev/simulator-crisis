from typing import Any, Dict, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

router = APIRouter(tags=["session"])


class SpeedRequest(BaseModel):
    multiplier: float


class SessionResetRequest(BaseModel):
    scenario_id: Optional[str] = None
    # bounded to the same shape frontend/src/utils/playerId.ts actually generates
    # (crypto.randomUUID(), or its "player-<ms>-<hex>" fallback) and to the DB column width
    # (models.career.CareerRecord.player_id is String(64)) -- this is a sanity/storage-abuse
    # guard, not an identity check: nothing here proves the caller owns this id (there is no
    # auth layer), so career/leaderboard records remain attributable only on trust
    player_id: Optional[str] = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    difficulty: Optional[str] = None


@router.get("/api/health")
async def health_check(request: Request) -> Dict[str, Any]:
    """SYSTEM HEALTHCHECK AND RUNTIME STATUS"""
    engine = request.app.state.engine
    return {
        "status": "online",
        "engine_active": engine.is_running,
        "current_tick": engine.current_tick,
        "active_clients": len(engine.active_websockets),
    }


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
