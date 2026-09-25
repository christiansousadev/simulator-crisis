from datetime import datetime
from enum import Enum
from pydantic import BaseModel, ConfigDict

class SessionStatus(str, Enum):
    RUNNING = "running"
    PAUSED = "paused"
    VICTORY = "victory"
    BANKRUPTED = "bankrupted"
    BREACHED = "breached"

class GameSessionCreate(BaseModel):
    player_name: str = "VP of Infrastructure"

class GameSessionResponse(BaseModel):
    id: str
    player_name: str
    budget: float
    sla_percentage: float
    tech_debt: int
    user_happiness: float
    status: SessionStatus
    current_tick: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
