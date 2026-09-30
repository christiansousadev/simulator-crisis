"""on-call engineer roster generation for the crisis simulation"""

import random
import uuid
from typing import Any, Dict, Optional

ENGINEER_NAME_POOL = [
    "Alex Rivera",
    "Priya Nair",
    "Jordan Kim",
    "Sofia Almeida",
    "Marcus Chen",
    "Fatima Al-Sayed",
    "Liam O'Connor",
    "Yuki Tanaka",
    "Elena Petrova",
    "Diego Morales",
    "Amara Okafor",
    "Noah Bergstrom",
]

# nearest competency match for each service ALREADY KNOWN to exist in the fixed topology -- this
# only maps an existing service to a competency, it is NOT the catalog of which services exist
# (see app.engine.simulator.CANONICAL_SERVICE_IDS for that; validating a service_id against this
# map instead would wrongly make "does this service exist" depend on staffing concerns)
SERVICE_COMPETENCY_MAP = {
    "srv-auth": "auth",
    "srv-payment": "payments",
    "srv-api-gw": "gateway",
    "srv-search": "gateway",
    "srv-notify": "gateway",
}

# every hireable specialization -- a superset of SERVICE_COMPETENCY_MAP's values ("db" has no
# service directly mapped to it yet but is still a valid hire). single source of truth shared by
# hire_engineer's engine-level check and HireEngineerRequest's schema-level Literal, so the two
# can never drift apart.
CORE_COMPETENCIES = ("auth", "payments", "gateway", "db")


def build_engineer(session_id: str, core_competency: str, assigned_service_id: Optional[str], current_tick: int) -> Dict[str, Any]:
    """CONSTRUCT A NEW ENGINEER RECORD FOR THE ON-CALL ROSTER"""
    return {
        "id": f"eng-{uuid.uuid4().hex[:6]}",
        "session_id": session_id,
        "name": random.choice(ENGINEER_NAME_POOL),
        "assigned_service_id": assigned_service_id,
        "core_competency": core_competency,
        "stress_index": 0,
        "stamina": 100,
        "on_call_status": "on_duty",
        "hired_at_tick": current_tick,
    }
