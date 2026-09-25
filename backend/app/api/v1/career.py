from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from app.core.database import SessionLocal
from app.models.career import CareerRecord

router = APIRouter(tags=["career"])


@router.get("/api/career/records")
async def list_career_records(player_id: Optional[str] = Query(default=None), scope: str = Query(default="mine")) -> List[Dict[str, Any]]:
    """LIST HALL-OF-FAME RUNS, EITHER FOR ONE PLAYER OR ACROSS EVERYONE ON THIS SERVER"""
    db = SessionLocal()
    try:
        query = db.query(CareerRecord)
        if scope == "mine" and player_id:
            query = query.filter(CareerRecord.player_id == player_id)
        records = query.order_by(CareerRecord.days_survived.desc()).limit(50).all()
        return [
            {
                "id": r.id,
                "player_id": r.player_id,
                "scenario_id": r.scenario_id,
                "outcome": r.outcome,
                "days_survived": r.days_survived,
                "final_sla_percentage": float(r.final_sla_percentage),
                "final_budget": float(r.final_budget),
                "prestige_earned": r.prestige_earned,
            }
            for r in records
        ]
    finally:
        db.close()
