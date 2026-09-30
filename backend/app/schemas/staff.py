from typing import Literal, Optional

from pydantic import BaseModel

# kept in sync with app.engine.staff.CORE_COMPETENCIES by hand (a Literal can't be built from a
# runtime tuple) -- rejecting an unrecognized competency here, at the schema layer, means a bad
# value never even reaches hire_engineer's own (now redundant, defense-in-depth) engine-level check
CoreCompetency = Literal["auth", "payments", "gateway", "db"]


class HireEngineerRequest(BaseModel):
    core_competency: CoreCompetency
    assigned_service_id: Optional[str] = None
