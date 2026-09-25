from datetime import datetime
from typing import Dict, Any
from pydantic import BaseModel, ConfigDict

class AuditLogResponse(BaseModel):
    id: str
    session_id: str
    timestamp: datetime
    tick: int
    event_type: str
    actor: str
    details: Dict[str, Any]
    compliance_flag: bool

    model_config = ConfigDict(from_attributes=True)
