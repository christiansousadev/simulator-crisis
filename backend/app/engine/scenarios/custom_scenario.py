"""data-driven custom scenario, configured entirely by player-supplied json"""

from typing import Any, Dict, List, Optional

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

    def on_tick(self) -> None:
        """APPLY THE CONFIGURED HAZARD MULTIPLIER AND FIRE ANY SCHEDULED CHAOS INJECTIONS"""
        self.engine._scenario_hazard_multiplier = self.config["hazard_multiplier"]
        for injection in self.config["chaos_injections"]:
            if injection["at_tick"] == self.elapsed_ticks:
                srv = next((s for s in self.engine.services if s["id"] == injection["service_id"]), None)
                if srv and srv["status"] == "healthy":
                    self.engine._trigger_service_failure(srv)

    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        """DEFEAT IF BUDGET DROPS TO THE CONFIGURED FLOOR, VICTORY ON SURVIVING THE FULL WINDOW"""
        if self.engine.budget <= self.config["budget_floor"]:
            return {"scenario_id": self.scenario_id, "outcome": "defeat", "compliant": False}
        if not self.is_expired():
            return None
        return {"scenario_id": self.scenario_id, "outcome": "victory", "compliant": True}
