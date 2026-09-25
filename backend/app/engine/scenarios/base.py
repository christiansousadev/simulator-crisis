"""base contract and registry for scripted crisis scenarios"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

SCENARIO_REGISTRY: Dict[str, type] = {}


class ScenarioEngine(ABC):
    """BASE CLASS FOR A SCRIPTED CRISIS CHALLENGE MODE LAYERED OVER THE CORE SIMULATION ENGINE"""

    scenario_id: str = ""
    display_name: str = ""
    duration_ticks: int = 0

    def __init__(self, engine: Any):
        self.engine = engine
        self.elapsed_ticks: int = 0
        self.completed: bool = False
        self.outcome: Optional[Dict[str, Any]] = None

    @abstractmethod
    def on_tick(self) -> None:
        """APPLY SCENARIO-SPECIFIC STATE MUTATIONS FOR THE CURRENT TICK"""
        raise NotImplementedError

    @abstractmethod
    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        """RETURN A SCORING PAYLOAD IF THE SCENARIO HAS CONCLUDED, ELSE NONE"""
        raise NotImplementedError

    def is_expired(self) -> bool:
        """CHECK WHETHER THE SCENARIO'S FIXED DURATION HAS ELAPSED"""
        return self.elapsed_ticks >= self.duration_ticks


def register_scenario(cls: type) -> type:
    """DECORATOR: REGISTER A SCENARIOENGINE SUBCLASS BY ITS SCENARIO_ID"""
    SCENARIO_REGISTRY[cls.scenario_id] = cls
    return cls
