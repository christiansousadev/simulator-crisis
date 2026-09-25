from pydantic import BaseModel


class CareerRecordResponse(BaseModel):
    id: str
    player_id: str
    scenario_id: str | None
    outcome: str
    days_survived: int
    final_sla_percentage: float
    final_budget: float
    prestige_earned: int
