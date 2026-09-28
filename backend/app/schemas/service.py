from enum import Enum
from typing import List

from pydantic import BaseModel, ConfigDict, Field


class ServiceTier(str, Enum):
    CRITICAL = "critical"
    STANDARD = "standard"

class ServiceStatus(str, Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"

class ServiceBase(BaseModel):
    name: str
    tier: ServiceTier
    status: ServiceStatus = ServiceStatus.HEALTHY
    latency_ms: int = 45
    error_rate: float = 0.0000
    dependencies: List[str] = Field(default_factory=list)

class ServiceResponse(ServiceBase):
    id: str
    session_id: str

    model_config = ConfigDict(from_attributes=True)
