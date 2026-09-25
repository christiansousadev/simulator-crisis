from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

from app.engine.formulas import MITIGATION_CATALOG
from app.schemas.mitigation import MitigationExecuteRequest

router = APIRouter(tags=["mitigations"])


@router.get("/api/mitigations/catalog")
async def get_catalog() -> List[Dict[str, Any]]:
    """RETRIEVE THE FULL SRE RUNBOOK MITIGATION CATALOG"""
    return MITIGATION_CATALOG


@router.post("/api/mitigations/execute")
async def execute_mitigation(payload: MitigationExecuteRequest, request: Request) -> Dict[str, Any]:
    """INVOKE SRE RUNBOOK ACTION ON TARGET SERVICE"""
    engine = request.app.state.engine
    result = engine.apply_mitigation(payload.action_id, payload.service_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Mitigation failed"))
    return result
