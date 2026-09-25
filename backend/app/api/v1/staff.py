from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request

from app.schemas.staff import HireEngineerRequest

router = APIRouter(tags=["staff"])


@router.post("/api/staff/hire")
async def hire_engineer(payload: HireEngineerRequest, request: Request) -> Dict[str, Any]:
    """HIRE A NEW ENGINEER ONTO THE ON-CALL ROSTER"""
    engine = request.app.state.engine
    result = engine.hire_engineer(payload.core_competency, payload.assigned_service_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Hiring failed"))
    return result


@router.post("/api/staff/{engineer_id}/rotate-shift")
async def rotate_shift(engineer_id: str, request: Request) -> Dict[str, Any]:
    """ROTATE AN ENGINEER'S ON-CALL DUTY STATUS"""
    engine = request.app.state.engine
    result = engine.rotate_shift(engineer_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Engineer not found"))
    return result
