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

# nearest competency match for each service in the fixed topology
SERVICE_COMPETENCY_MAP = {
    "srv-auth": "auth",
    "srv-payment": "payments",
    "srv-api-gw": "gateway",
    "srv-search": "gateway",
    "srv-notify": "gateway",
}


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
