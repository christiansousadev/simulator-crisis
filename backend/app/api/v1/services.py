from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

router = APIRouter(tags=["services"])


@router.get("/api/services")
async def list_services(request: Request) -> List[Dict[str, Any]]:
    """LIST CURRENT MICROSERVICE MESH TOPOLOGY AND HEALTH"""
    return request.app.state.engine.services


@router.post("/api/services/{service_id}/throttle")
async def throttle_service(service_id: str, request: Request) -> Dict[str, Any]:
    """EMERGENCY TRAFFIC THROTTLING: SHED ~50% OF A FAILING SERVICE'S REQUESTS (DOES NOT RESOLVE IT)"""
    engine = request.app.state.engine
    result = engine.throttle_service(service_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Throttle rejected"))
    return result
