"""scripted crisis challenge modes layered over the core simulation engine"""

# imported purely for the @register_scenario side effect (each module populates
# SCENARIO_REGISTRY on import); not part of this package's public surface, hence the noqa
# rather than an __all__ entry that would invite `from app.engine.scenarios import black_friday_rush`
from app.engine.scenarios import (  # noqa: F401
    black_friday_rush,
    chaos_engineering_drill,
    ddos_global,
    deployment_rollback,
    ransomware_infiltration,
    third_party_outage,
)
from app.engine.scenarios.base import SCENARIO_REGISTRY, ScenarioEngine

__all__ = ["ScenarioEngine", "SCENARIO_REGISTRY"]
