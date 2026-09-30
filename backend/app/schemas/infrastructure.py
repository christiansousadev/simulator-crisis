from typing import Optional

from pydantic import BaseModel, Field


class PlaceInfrastructureNodeRequest(BaseModel):
    node_type: str
    # the build-mode UI always computes these as small offsets from a fixed origin
    # (frontend/src/components/office/IsometricOffice.tsx), never a raw user drag -- this bound is
    # generous for that layout while rejecting NaN/Infinity/absurd values that would otherwise be
    # stored verbatim and echoed into every subsequent websocket state broadcast forever
    grid_x: float = Field(ge=-100.0, le=100.0)
    grid_y: float = Field(ge=-100.0, le=100.0)
    target_service_id: str
    producer_service_id: Optional[str] = None
