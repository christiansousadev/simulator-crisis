from typing import List
from pydantic import BaseModel
from app.schemas.service import ServiceResponse
from app.schemas.incident import IncidentResponse
from app.schemas.audit import AuditLogResponse

class SimulationTickPayload(BaseModel):
    type: str = "TICK_BROADCAST"
    session_id: str
    tick: int
    budget: float
    sla_percentage: float
    tech_debt: int
    user_happiness: float
    is_running: bool
    tick_rate_seconds: float
    services: List[ServiceResponse]
    active_incidents: List[IncidentResponse]
    recent_audits: List[AuditLogResponse]
