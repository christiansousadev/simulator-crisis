"""data-driven custom scenario, configured entirely by player-supplied json"""

from typing import Any, Dict, List, Optional

from app.engine import formulas
from app.engine.scenarios.base import ScenarioEngine

# deliberately not registered in SCENARIO_REGISTRY: it has no fixed id to look up by,
# it is always instantiated directly with a config via SimulationEngine.load_custom_scenario


class CustomScenario(ScenarioEngine):
    scenario_id = "custom"
    display_name = "Custom Scenario"

    def __init__(self, engine: Any, config: Dict[str, Any]):
        super().__init__(engine)
        self.config = config
        self.duration_ticks = config["duration_ticks"]

    def on_start(self) -> None:
        """APPLY THE OPTIONAL starting_budget/starting_tech_debt OVERRIDES FROM THE PLAYER-SUPPLIED
        (ALREADY SCHEMA-VALIDATED AND BOUNDED, SEE CustomScenarioConfig) CONFIG, ONCE, WHEN THIS
        SCENARIO IS FIRST ATTACHED -- NEVER RE-APPLIED ON A RESTORE-FROM-SNAPSHOT (SEE
        ScenarioEngine.on_start's DOCSTRING). NEITHER KEY IS REQUIRED: A CONFIG THAT OMITS THEM
        JUST KEEPS WHATEVER reset() ALREADY SET FROM THE SELECTED DIFFICULTY PRESET."""
        if self.config.get("starting_budget") is not None:
            self.engine.budget = float(self.config["starting_budget"])
        if self.config.get("starting_tech_debt") is not None:
            self.engine.tech_debt = formulas.clamp_tech_debt(self.config["starting_tech_debt"])

    def on_tick(self) -> None:
        """APPLY THE CONFIGURED HAZARD MULTIPLIER AND FIRE ANY SCHEDULED CHAOS INJECTIONS"""
        self.engine._scenario_hazard_multiplier = self.config["hazard_multiplier"]
        for injection in self.config["chaos_injections"]:
            if injection["at_tick"] == self.elapsed_ticks:
                srv = next((s for s in self.engine.services if s["id"] == injection["service_id"]), None)
                if srv and srv["status"] == "healthy":
                    self.engine._trigger_service_failure(srv)

    def snapshot_extra(self) -> Dict[str, Any]:
        """PERSIST THE PLAYER-SUPPLIED CONFIG ITSELF -- restore_extra() IS NOT USED HERE SINCE
        CustomScenario NEEDS config AT CONSTRUCTION TIME; SEE SimulationEngine._try_restore_from_snapshot"""
        return {"config": self.config}

    def objectives(self) -> List[Dict[str, Any]]:
        """TWO CONCRETE OBJECTIVES DERIVED DIRECTLY FROM THE VALIDATED CONFIG AND CURRENT ENGINE
        STATE -- MIRRORS evaluate_victory'S OWN TWO CONDITIONS BELOW SO THE PLAYER-FACING
        CHECKLIST NEVER DRIFTS FROM WHAT ACTUALLY DECIDES THE OUTCOME"""
        return [
            {
                "id": "stay_above_budget_floor",
                "description": f"Keep budget above ${self.config['budget_floor']:,.2f}",
                "done": self.engine.budget > self.config["budget_floor"],
            },
            {
                "id": "survive_duration",
                "description": f"Survive {self.duration_ticks} ticks",
                "done": self.is_expired(),
            },
        ]

    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        """DEFEAT IF BUDGET DROPS TO THE CONFIGURED FLOOR, VICTORY ON SURVIVING THE FULL WINDOW"""
        if self.engine.budget <= self.config["budget_floor"]:
            return {"scenario_id": self.scenario_id, "outcome": "defeat", "compliant": False}
        if not self.is_expired():
            return None
        return {"scenario_id": self.scenario_id, "outcome": "victory", "compliant": True}
