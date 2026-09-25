from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Request

from app.engine.cosmetics import COSMETIC_CATALOG

router = APIRouter(tags=["cosmetics"])


@router.get("/api/cosmetics/catalog")
async def get_cosmetic_catalog() -> List[Dict[str, Any]]:
    """RETRIEVE THE FULL PRESTIGE-POINT COSMETIC CATALOG"""
    return COSMETIC_CATALOG


@router.post("/api/cosmetics/{cosmetic_id}/unlock")
async def unlock_cosmetic(cosmetic_id: str, request: Request) -> Dict[str, Any]:
    """SPEND PRESTIGE POINTS TO UNLOCK A COSMETIC OFFICE PROP"""
    engine = request.app.state.engine
    result = engine.unlock_cosmetic(cosmetic_id)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Unlock failed"))
    return result
