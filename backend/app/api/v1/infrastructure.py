from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

from app.engine.infrastructure import INFRASTRUCTURE_CATALOG
from app.schemas.infrastructure import PlaceInfrastructureNodeRequest

router = APIRouter(tags=["infrastructure"])


@router.get("/api/infrastructure/catalog")
async def get_infrastructure_catalog() -> List[Dict[str, Any]]:
    """RETRIEVE THE FULL BUILD-MODE HARDWARE CATALOG"""
    return INFRASTRUCTURE_CATALOG


@router.post("/api/infrastructure/nodes")
async def place_infrastructure_node(payload: PlaceInfrastructureNodeRequest, request: Request) -> Dict[str, Any]:
    """PLACE A NEW HARDWARE MODULE ON THE SERVER ROOM BUILD-MODE GRID"""
    engine = request.app.state.engine
    result = engine.place_infrastructure_node(
        payload.node_type, payload.grid_x, payload.grid_y, payload.target_service_id, payload.producer_service_id
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Placement failed"))
    return result


@router.delete("/api/infrastructure/nodes/{node_id}")
async def remove_infrastructure_node(node_id: str, request: Request) -> Dict[str, Any]:
    """REMOVE A PLACED INFRASTRUCTURE NODE"""
    engine = request.app.state.engine
    result = engine.remove_infrastructure_node(node_id)
    if not result.get("success"):
        raise HTTPException(status_code=404, detail=result.get("error", "Node not found"))
    return result
