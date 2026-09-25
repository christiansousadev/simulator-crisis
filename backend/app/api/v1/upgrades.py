from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

from app.engine.upgrades import UPGRADE_CATALOG

router = APIRouter(tags=["upgrades"])


@router.get("/api/upgrades/catalog")
async def get_upgrade_catalog() -> List[Dict[str, Any]]:
    """RETRIEVE THE FULL INFRASTRUCTURE AND FACILITY UPGRADE CATALOG"""
    return UPGRADE_CATALOG


@router.post("/api/upgrades/{upgrade_id}/purchase")
async def purchase_upgrade(upgrade_id: str, request: Request) -> Dict[str, Any]:
    """PURCHASE A PERMANENT INFRASTRUCTURE OR FACILITY UPGRADE"""
    engine = request.app.state.engine
    result = engine.purchase_upgrade(upgrade_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Upgrade purchase failed"))
    return result
