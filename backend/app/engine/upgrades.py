"""infrastructure and facility upgrade catalog for the crisis simulation"""

from typing import Any, Dict, List, Optional

UPGRADE_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "apm_tracing",
        "name": "APM Distributed Tracing",
        "description": "Reduces effective MTTA by 2 ticks for regulatory breach evaluation.",
        "category": "observability",
        "cost": 18000.0,
        "prerequisite": None,
    },
    {
        "id": "predictive_anomaly_detection",
        "name": "Predictive Anomaly Detection",
        "description": "Warns of an incoming failure 5 ticks before it materializes.",
        "category": "observability",
        "cost": 32000.0,
        "prerequisite": "apm_tracing",
    },
    {
        "id": "multi_az_clusters",
        "name": "Multi-AZ Compute Clusters",
        "description": "Reduces cascading failure hazard by 40%.",
        "category": "resilience",
        "cost": 45000.0,
        "prerequisite": None,
    },
    {
        "id": "automated_cicd",
        "name": "Automated CI/CD Pipelines",
        "description": "Halves the cost and technical debt penalty of the Rollback runbook.",
        "category": "resilience",
        "cost": 28000.0,
        "prerequisite": None,
    },
    {
        "id": "espresso_machine",
        "name": "Commercial Espresso Machine",
        "description": "Slows morale decline by 25%.",
        "category": "facility",
        "cost": 9500.0,
        "prerequisite": None,
    },
    {
        "id": "ergonomic_chairs",
        "name": "Ergonomic Herman Miller Chairs",
        "description": "Reduces on-call engineer fatigue accumulation by 20%.",
        "category": "facility",
        "cost": 14000.0,
        "prerequisite": None,
    },
]


def find_upgrade(upgrade_id: str) -> Optional[Dict[str, Any]]:
    """LOOK UP AN UPGRADE DEFINITION BY ITS CATALOG ID"""
    return next((u for u in UPGRADE_CATALOG if u["id"] == upgrade_id), None)
