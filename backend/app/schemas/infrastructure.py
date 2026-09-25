from typing import Optional

from pydantic import BaseModel


class PlaceInfrastructureNodeRequest(BaseModel):
    node_type: str
    grid_x: float
    grid_y: float
    target_service_id: str
    producer_service_id: Optional[str] = None
