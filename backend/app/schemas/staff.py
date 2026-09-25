from typing import Optional

from pydantic import BaseModel


class HireEngineerRequest(BaseModel):
    core_competency: str
    assigned_service_id: Optional[str] = None
