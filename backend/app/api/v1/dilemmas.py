from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from app.schemas.dilemma import DilemmaResolveRequest

router = APIRouter(tags=["dilemmas"])


@router.post("/api/dilemmas/{dilemma_id}/resolve")
async def resolve_dilemma(dilemma_id: str, payload: DilemmaResolveRequest, request: Request) -> Dict[str, Any]:
    """RECORD THE PLAYER'S CHOICE FOR AN ACTIVE CAB DILEMMA"""
    engine = request.app.state.engine
    result = engine.resolve_dilemma(dilemma_id, payload.choice_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Dilemma resolution failed"))
    return result
