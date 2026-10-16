from typing import Literal

from pydantic import BaseModel


class TriageSubmitRequest(BaseModel):
    line_id: str


class StatusUpdateRequest(BaseModel):
    # kept in sync with app.engine.war_room.STATUS_STAGES (a Literal cannot be built from a tuple)
    stage: Literal["investigating", "identified", "mitigating"]
