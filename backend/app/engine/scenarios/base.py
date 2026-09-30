"""base contract and registry for scripted crisis scenarios"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional

SCENARIO_REGISTRY: Dict[str, type] = {}


class ScenarioEngine(ABC):
    """BASE CLASS FOR A SCRIPTED CRISIS CHALLENGE MODE LAYERED OVER THE CORE SIMULATION ENGINE"""

    scenario_id: str = ""
    display_name: str = ""
    duration_ticks: int = 0
    description: str = ""
    special_conditions: List[str] = []
    objectives_summary: List[str] = []
    unlock_requirement: Optional[str] = None

    @classmethod
    def is_unlocked(cls, career_records: List[Any], achievements: set) -> bool:
        """AUTHORITATIVE UNLOCK CHECK EVALUATED AGAINST REAL CAREER DATA"""
        return True

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

    def on_start(self) -> None:
        """OPTIONAL: APPLY ONE-TIME INITIAL-CONDITION OVERRIDES (STARTING BUDGET/TECH DEBT, AN
        INITIAL AUDIT EVENT, SEEDED STATE) THE MOMENT THIS SCENARIO IS FIRST ATTACHED TO A FRESH
        RUN. CALLED EXACTLY ONCE BY SimulationEngine.reset()/load_custom_scenario(), RIGHT AFTER
        CONSTRUCTION -- NEVER ON A RESTORE-FROM-SNAPSHOT (THAT PATH RECONSTRUCTS STATE VIA
        restore_extra() INSTEAD, SO INITIAL CONDITIONS ARE NEVER RE-APPLIED ON TOP OF A RESUMED
        RUN). BASE IMPLEMENTATION: NOTHING TO DO."""
        return None

    def objectives(self) -> List[Dict[str, Any]]:
        """RETURN THIS SCENARIO'S PLAYER-FACING OBJECTIVES AS [{id, description, done}, ...],
        RECOMPUTED FRESH FROM CURRENT ENGINE/SCENARIO STATE ON EVERY CALL -- NEVER A SEPARATELY
        TRACKED FLAG THAT COULD DESYNC FROM REALITY (SAME PHILOSOPHY THE ACHIEVEMENT SYSTEM
        ALREADY USES: DERIVED FROM ACTUAL STATE, NOT A STORED BOOLEAN). THE BACKEND IS THE SOLE
        AUTHORITY FOR "done" -- A CLIENT NEVER DECLARES AN OBJECTIVE COMPLETE LOCALLY. BASE
        IMPLEMENTATION: NO OBJECTIVES."""
        return []

    # --- persistence: restore-relevant state beyond elapsed_ticks/completed/outcome -------
    #
    # the engine already captures elapsed_ticks/completed/outcome generically for every scenario;
    # a subclass with its own extra runtime state (e.g. ransomware's infection spread, custom's
    # player-supplied config) overrides these two so a restart resumes it faithfully instead of
    # silently reverting to the scenario's fresh-start state.

    def snapshot_extra(self) -> Dict[str, Any]:
        """SCENARIO-SPECIFIC EXTRA STATE TO PERSIST. BASE IMPLEMENTATION: NONE."""
        return {}

    def restore_extra(self, extra: Dict[str, Any]) -> None:
        """REHYDRATE SCENARIO-SPECIFIC EXTRA STATE FROM A PRIOR snapshot_extra() PAYLOAD.
        BASE IMPLEMENTATION: NOTHING TO DO."""
        return None


def register_scenario(cls: type) -> type:
    """DECORATOR: REGISTER A SCENARIOENGINE SUBCLASS BY ITS SCENARIO_ID.

    REFUSES A DUPLICATE scenario_id INSTEAD OF SILENTLY SHADOWING THE EARLIER REGISTRATION -- A
    COPY-PASTED/TYPO'D scenario_id WOULD OTHERWISE SILENTLY LOAD THE WRONG SCENARIO CLASS FOR ITS
    OWN ID, ONLY DISCOVERABLE AT RUNTIME."""
    if cls.scenario_id in SCENARIO_REGISTRY:
        raise ValueError(
            f"Duplicate scenario_id {cls.scenario_id!r}: already registered by "
            f"{SCENARIO_REGISTRY[cls.scenario_id].__name__}"
        )
    SCENARIO_REGISTRY[cls.scenario_id] = cls
    return cls
