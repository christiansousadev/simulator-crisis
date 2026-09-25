from typing import Any, Dict, List

from fastapi import APIRouter

from app.engine.achievements import ACHIEVEMENT_CATALOG

router = APIRouter(tags=["achievements"])


@router.get("/api/achievements/catalog")
async def get_achievement_catalog() -> List[Dict[str, Any]]:
    """RETRIEVE THE FULL 12-ACHIEVEMENT CAREER CATALOG"""
    return ACHIEVEMENT_CATALOG
