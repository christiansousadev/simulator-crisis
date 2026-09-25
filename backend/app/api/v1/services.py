from typing import Any, Dict, List

from fastapi import APIRouter, Request

router = APIRouter(tags=["services"])


@router.get("/api/services")
async def list_services(request: Request) -> List[Dict[str, Any]]:
    """LIST CURRENT MICROSERVICE MESH TOPOLOGY AND HEALTH"""
    return request.app.state.engine.services
