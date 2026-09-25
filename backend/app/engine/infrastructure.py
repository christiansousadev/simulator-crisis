"""build-mode infrastructure hardware catalog for the crisis simulation"""

from typing import Any, Dict, List, Optional

# multipliers applied at the _evaluate_random_failures call site in simulator.py
REDIS_LATENCY_DAMPENER = 0.55
DB_READ_REPLICA_HAZARD_MULTIPLIER = 0.40
NGINX_LB_HAZARD_MULTIPLIER = 0.80

INFRASTRUCTURE_CATALOG: List[Dict[str, Any]] = [
    {
        "node_type": "redis_cache",
        "name": "Redis Cache Cluster",
        "description": "Absorbs read spikes; reduces upstream latency by 45%.",
        "cost": 12000.0,
        "requires_producer": False,
    },
    {
        "node_type": "kafka_queue",
        "name": "Kafka Message Queue",
        "description": "Asynchronously decouples services; prevents cascade failures between producer and consumer nodes.",
        "cost": 20000.0,
        "requires_producer": True,
    },
    {
        "node_type": "db_read_replica",
        "name": "Database Read Replica",
        "description": "Divides database query load; reduces deadlock probability by 60%.",
        "cost": 16000.0,
        "requires_producer": False,
    },
    {
        "node_type": "nginx_lb",
        "name": "NGINX Load Balancer",
        "description": "Balances edge traffic across replicated compute nodes.",
        "cost": 9000.0,
        "requires_producer": False,
    },
]


def find_infrastructure_type(node_type: str) -> Optional[Dict[str, Any]]:
    """LOOK UP AN INFRASTRUCTURE CATALOG DEFINITION BY ITS NODE TYPE"""
    return next((n for n in INFRASTRUCTURE_CATALOG if n["node_type"] == node_type), None)
