from pydantic import BaseModel, ConfigDict


class MitigationActionResponse(BaseModel):
    id: str
    name: str
    description: str
    cost: float
    tech_debt_delta: int
    resolve_speed_multiplier: float
    cooldown_ticks: int
    category: str

    model_config = ConfigDict(from_attributes=True)


class MitigationExecuteRequest(BaseModel):
    action_id: str
    service_id: str
