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


def _validate_catalog_references() -> None:
    """FAIL FAST, AT IMPORT TIME, IF ANY ENTRY'S prerequisite DOESN'T RESOLVE TO A REAL CATALOG
    ID -- WITHOUT THIS, A TYPO'D prerequisite WOULD NEVER CRASH ANYTHING; IT WOULD JUST MAKE THAT
    UPGRADE SILENTLY, PERMANENTLY UNPURCHASABLE (purchase_upgrade's prerequisite CHECK ONLY TESTS
    MEMBERSHIP IN THE PLAYER'S purchased_upgrade_ids SET, NEVER THAT THE prerequisite ID ITSELF
    EXISTS)"""
    catalog_ids = {u["id"] for u in UPGRADE_CATALOG}
    for upgrade in UPGRADE_CATALOG:
        prereq = upgrade.get("prerequisite")
        if prereq is not None and prereq not in catalog_ids:
            raise ValueError(
                f"Upgrade {upgrade['id']!r} declares an unknown prerequisite {prereq!r} -- "
                "no such id exists in UPGRADE_CATALOG"
            )


_validate_catalog_references()
