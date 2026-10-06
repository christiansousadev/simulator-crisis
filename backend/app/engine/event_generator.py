"""randomized incident and audit content generation for the crisis simulation"""

import random
import uuid
from typing import Any, Dict, Optional

from app.engine.log_generator import generate_incident_log_stream

ROOT_CAUSE_POOL = [
    "Memory leak in connection pooling thread",
    "OOM killer invoked by kernel",
    "Cascading deadlock under unindexed query storm",
    "TLS certificate expiration across cluster pods",
    "Corrupted Redis cache serialization payload",
    "Unbounded goroutine leak under retry storm",
    "DNS resolver cache poisoning on service mesh sidecar",
    "Disk I/O saturation from runaway log rotation",
]

INCIDENT_TITLE_TEMPLATES = [
    "Service disruption detected on {service_name}",
    "Elevated error rate on {service_name}",
    "Latency spike breaching SLO on {service_name}",
    "Availability drop on {service_name}",
]

# maps each root cause narrative to one of 4 categories the mitigation compatibility matrix
# (formulas.MITIGATION_EFFECTIVENESS) understands. Kept as a lookup by exact root-cause text
# (rather than a field on ROOT_CAUSE_POOL) so the pool itself stays a simple flat list; any
# future/unrecognized root cause safely defaults to "acute_defect" (needs a direct fix, no clean
# infra lever) rather than crashing or silently granting a free full-resolution match.
ROOT_CAUSE_CATEGORY = {
    "Memory leak in connection pooling thread": "deploy_regression",
    "OOM killer invoked by kernel": "capacity_saturation",
    "Cascading deadlock under unindexed query storm": "dependency_fault",
    "TLS certificate expiration across cluster pods": "acute_defect",
    "Corrupted Redis cache serialization payload": "deploy_regression",
    "Unbounded goroutine leak under retry storm": "dependency_fault",
    "DNS resolver cache poisoning on service mesh sidecar": "dependency_fault",
    "Disk I/O saturation from runaway log rotation": "capacity_saturation",
}
DEFAULT_ROOT_CAUSE_CATEGORY = "acute_defect"


def cause_category_for_root_cause(root_cause: str) -> str:
    """CLASSIFY A ROOT CAUSE NARRATIVE INTO ITS MITIGATION-COMPATIBILITY CATEGORY"""
    return ROOT_CAUSE_CATEGORY.get(root_cause, DEFAULT_ROOT_CAUSE_CATEGORY)


def generate_incident_id() -> str:
    """GENERATE A UNIQUE INCIDENT IDENTIFIER"""
    return f"inc-{uuid.uuid4().hex[:6]}"


def generate_audit_id() -> str:
    """GENERATE A UNIQUE AUDIT LOG IDENTIFIER"""
    return f"aud-{uuid.uuid4().hex[:8]}"


def pick_root_cause() -> str:
    """SELECT A RANDOM ROOT CAUSE NARRATIVE"""
    return random.choice(ROOT_CAUSE_POOL)


def pick_incident_title(service_name: str) -> str:
    """SELECT A RANDOM INCIDENT TITLE FROM THE TEMPLATE POOL"""
    template = random.choice(INCIDENT_TITLE_TEMPLATES)
    return template.format(service_name=service_name)


def severity_for_tier(tier: str) -> str:
    """MAP SERVICE TIER TO INCIDENT SEVERITY CLASSIFICATION"""
    return "P1_CRITICAL" if tier == "critical" else "P2_HIGH"


def build_incident(service: Dict[str, Any], current_tick: int, root_cause: Optional[str] = None) -> Dict[str, Any]:
    """CONSTRUCT A NEW INCIDENT RECORD FOR A FAILING SERVICE. root_cause PINS THE NARRATIVE (THE
    GUIDED TUTORIAL NEEDS A KNOWN, ROLLBACK-FIXABLE CAUSE); OMITTED = A RANDOM ONE FROM THE POOL"""
    severity = severity_for_tier(service["tier"])
    incident = {
        "id": generate_incident_id(),
        "session_id": service["session_id"],
        "service_id": service["id"],
        "severity": severity,
        "title": pick_incident_title(service["name"]),
        "root_cause": root_cause or pick_root_cause(),
        "mtta_seconds": 0,
        "mttr_seconds": 0,
        "status": "active",
        "created_tick": current_tick,
        "acknowledged_tick": None,
        "resolved_tick": None,
        "triage_solved": False,
    }
    # log stream is generated once, at creation, and never regenerated on subsequent reads
    log_stream = generate_incident_log_stream(incident)
    incident["log_lines"] = log_stream["lines"]
    incident["root_cause_line_id"] = log_stream["root_cause_line_id"]
    return incident


def build_audit_entry(
    session_id: str, tick: int, event_type: str, actor: str, details: Dict[str, Any], compliance_flag: bool
) -> Dict[str, Any]:
    """CONSTRUCT A GOVERNANCE AUDIT LEDGER ENTRY"""
    from datetime import datetime, timezone

    return {
        "id": generate_audit_id(),
        "session_id": session_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "tick": tick,
        "event_type": event_type,
        "actor": actor,
        "details": details,
        "compliance_flag": compliance_flag,
    }
