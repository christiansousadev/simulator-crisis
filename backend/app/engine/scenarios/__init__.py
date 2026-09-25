"""scripted crisis challenge modes layered over the core simulation engine"""

from app.engine.scenarios import black_friday_rush, chaos_engineering_drill, ransomware_infiltration
from app.engine.scenarios.base import SCENARIO_REGISTRY, ScenarioEngine

__all__ = ["ScenarioEngine", "SCENARIO_REGISTRY"]
