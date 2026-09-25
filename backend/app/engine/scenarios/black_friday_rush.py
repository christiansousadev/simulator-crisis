"""black friday rush scenario: sustained 4x traffic surge over 48 ticks"""

from typing import Any, Dict, Optional

from app.engine import formulas
from app.engine.scenarios.base import ScenarioEngine, register_scenario


@register_scenario
class BlackFridayRushScenario(ScenarioEngine):
    scenario_id = "black_friday_rush"
    display_name = "Black Friday Rush"
    duration_ticks = 48

    TRAFFIC_MULTIPLIER = 4.0
    CLOUD_BURN_ACCELERATION = 2.5

    def on_tick(self) -> None:
        """APPLY 4X QUERY LOAD, HAZARD PRESSURE, AND ACCELERATED CLOUD BURN"""
        for srv in self.engine.services:
            if srv["status"] == "healthy":
                srv["latency_ms"] = int(srv["latency_ms"] * 1.02)
        # inflates the effective hazard read at the failure evaluation call site only,
        # never the persisted tech_debt stat itself
        self.engine._scenario_hazard_multiplier = self.TRAFFIC_MULTIPLIER / 4.0 + 1.0
        self.engine.budget = max(
            0.0, self.engine.budget - (formulas.PASSIVE_CLOUD_BURN * (self.CLOUD_BURN_ACCELERATION - 1.0))
        )

    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        """SCORE SURVIVAL OF THE 48-TICK SURGE WINDOW"""
        if not self.is_expired():
            return None
        compliant = self.engine.sla_percentage >= formulas.SLA_BREACH_THRESHOLD
        return {
            "scenario_id": self.scenario_id,
            "sla_maintained": compliant,
            "final_sla_percentage": round(self.engine.sla_percentage, 2),
            "net_runway_saved": round(self.engine.budget, 2),
            "compliant": compliant,
        }
