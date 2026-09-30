from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class CareerRecordResponse(BaseModel):
    id: str
    player_id: str
    scenario_id: Optional[str] = None
    difficulty: Optional[str] = "standard"
    outcome: str
    days_survived: int
    final_sla_percentage: float
    final_budget: float
    final_tech_debt: Optional[int] = None
    final_reputation: Optional[float] = None
    incidents_total: Optional[int] = None
    incidents_resolved: Optional[int] = None
    prestige_earned: int = 0
    recorded_at: Optional[str] = None
    scenario_outcome: Optional[Dict[str, Any]] = None
    objectives: Optional[List[Dict[str, Any]]] = None


class CareerSummaryResponse(BaseModel):
    total_runs: int
    victories: int
    bankruptcies: int
    defeats: int
    total_incidents_resolved: int
    lifetime_prestige: int
    operator_rank: str
    best_runs: Dict[str, Optional[CareerRecordResponse]]
    recommended_challenge: Dict[str, Any]
