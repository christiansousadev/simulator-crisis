from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(tags=["tutorial"])


@router.post("/api/tutorial/incident")
async def spawn_tutorial_incident(request: Request) -> Dict[str, Any]:
    """STAGE THE GUIDED TUTORIAL'S DETERMINISTIC P2 INCIDENT ON srv-notify (ROLLBACK FIXES IT),
    ALSO WHILE PAUSED -- THE STATE PUSH AFTER A SUCCESSFUL COMMAND DELIVERS IT TO THE UI"""
    engine = request.app.state.engine
    result = engine.spawn_tutorial_incident()
    if not result.get("success"):
        raise HTTPException(status_code=409, detail=result.get("error", "Tutorial incident unavailable"))
    return result
