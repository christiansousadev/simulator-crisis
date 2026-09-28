"""synthetic application log stream generation for the root-cause triage mini-game"""

import random
import uuid
from typing import Any, Dict, List

INFO_LINES = [
    "GET /api/v1/health 200 12ms",
    "POST /api/v1/orders 201 84ms",
    "cache hit ratio 0.94 over last 60s window",
    "healthcheck probe succeeded, latency 8ms",
    "GC pause completed in 4ms, heap 62% utilized",
]

WARN_LINES = [
    "connection pool utilization at 82%, approaching configured limit",
    "retry attempt 2/3 for downstream call to payment-core",
    "slow query detected: SELECT * FROM orders WHERE status=? took 420ms",
    "thread pool queue depth rising: 340 pending tasks",
    "certificate expires in 9 days for internal mTLS endpoint",
]

ERROR_LINES = [
    "connection pool timeout: no available connection after 5000ms",
    "deadlock detected: transaction 4471 rolled back by database engine",
    "unhandled exception in request handler: NullReferenceException at OrderProcessor.charge()",
    "downstream call to auth-service failed: 503 Service Unavailable",
    "serialization error: unexpected token in cached payload, falling back to origin",
]

FATAL_LINES = [
    "OutOfMemoryError: Java heap space exhausted, killing worker process",
    "OOM killer invoked by kernel, sacrificed process pid=8842 (worker)",
    "panic: runtime error: index out of range, goroutine crashed",
    "segmentation fault (core dumped) in native extension module",
]

# maps a root_cause narrative substring to the fatal/error line pool it should draw from,
# so the generated log stream agrees with event_generator.ROOT_CAUSE_POOL's flavor text
ROOT_CAUSE_LOG_MAP = {
    "memory leak": "OutOfMemoryError: Java heap space exhausted, killing worker process",
    "oom killer": "OOM killer invoked by kernel, sacrificed process pid=8842 (worker)",
    "deadlock": "deadlock detected: transaction 4471 rolled back by database engine",
    "certificate": "downstream call to auth-service failed: 503 Service Unavailable",
    "redis": "serialization error: unexpected token in cached payload, falling back to origin",
    "goroutine": "panic: runtime error: index out of range, goroutine crashed",
    "dns": "downstream call to auth-service failed: 503 Service Unavailable",
    "disk i/o": "connection pool timeout: no available connection after 5000ms",
}

LOG_LINE_COUNT = 22


def _root_cause_message(root_cause: str) -> str:
    """PICK THE FATAL/ERROR LINE MATCHING THE INCIDENT'S NARRATIVE ROOT CAUSE"""
    lowered = root_cause.lower()
    for needle, message in ROOT_CAUSE_LOG_MAP.items():
        if needle in lowered:
            return message
    return random.choice(FATAL_LINES)


def generate_incident_log_stream(incident: Dict[str, Any]) -> Dict[str, Any]:
    """BUILD A DETERMINISTIC SYNTHETIC LOG STREAM FOR ONE INCIDENT, WITH ONE MARKED ROOT-CAUSE LINE"""
    # the root-cause message is drawn from the same ERROR/FATAL pools the decoy lines sample
    # from, so it must be excluded from those pools while generating decoys below -- otherwise
    # a decoy can land on the exact same text as the "correct" line, making the two
    # indistinguishable to the player (submit_triage matches by line id, not message text)
    root_cause_message = _root_cause_message(incident["root_cause"])
    root_cause_level = "FATAL" if root_cause_message in FATAL_LINES else "ERROR"
    decoy_error_lines = [m for m in ERROR_LINES if m != root_cause_message]
    decoy_fatal_lines = [m for m in FATAL_LINES if m != root_cause_message]

    lines: List[Dict[str, Any]] = []
    for tick_offset in range(LOG_LINE_COUNT):
        level = random.choices(
            ["INFO", "WARN", "ERROR", "FATAL"],
            weights=[55, 25, 15, 5],
            k=1,
        )[0]
        pool = {"INFO": INFO_LINES, "WARN": WARN_LINES, "ERROR": decoy_error_lines, "FATAL": decoy_fatal_lines}[level]
        lines.append(
            {
                "id": f"log-{uuid.uuid4().hex[:8]}",
                "tick_offset": tick_offset,
                "level": level,
                "message": random.choice(pool),
            }
        )

    # inject the deterministic root-cause line at a random position, always error-or-fatal
    root_cause_index = random.randint(3, LOG_LINE_COUNT - 2)
    root_cause_id = f"log-{uuid.uuid4().hex[:8]}"
    lines[root_cause_index] = {
        "id": root_cause_id,
        "tick_offset": root_cause_index,
        "level": root_cause_level,
        "message": root_cause_message,
    }

    return {"lines": lines, "root_cause_line_id": root_cause_id}
