"""black friday rush scenario: sustained 4x traffic surge over 48 ticks"""

from typing import Any, Dict, List, Optional

from app.engine import formulas
from app.engine.scenarios.base import ScenarioEngine, register_scenario


@register_scenario
class BlackFridayRushScenario(ScenarioEngine):
    scenario_id = "black_friday_rush"
    display_name = "Black Friday Rush"
    duration_ticks = 48
    description = "Sustained 4.0x retail query traffic surge challenging operational capacity and cloud infrastructure spend."
    special_conditions = [
        "4.0x global query traffic multiplier",
        "2.5x accelerated passive cloud infrastructure burn",
        "Continuous latency creep (+2%/tick) across healthy services",
    ]
    objectives_summary = [
        "Keep SLA at or above 99.0% through the surge",
        "Survive the 48-tick traffic surge window",
    ]
    unlock_requirement = None

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
        # routed through the engine's centralized financial-event method (same one every other
        # cash movement uses), categorized as ordinary operational expense rather than mutating
        # engine.budget directly from outside the engine
        extra_cloud_burn = formulas.PASSIVE_CLOUD_BURN * (self.CLOUD_BURN_ACCELERATION - 1.0)
        self.engine._apply_financial_event(category="operational_expense", amount=-extra_cloud_burn)

    def objectives(self) -> List[Dict[str, Any]]:
        """TWO CONCRETE OBJECTIVES MIRRORING evaluate_victory'S OWN CONDITION -- BOTH RECOMPUTED
        FROM LIVE ENGINE STATE, NEVER A SEPARATELY TRACKED FLAG"""
        return [
            {
                "id": "maintain_sla",
                "description": f"Keep SLA at or above {formulas.SLA_BREACH_THRESHOLD:.0f}% through the surge",
                "done": self.engine.sla_percentage >= formulas.SLA_BREACH_THRESHOLD,
            },
            {
                "id": "survive_surge",
                "description": f"Survive the {self.duration_ticks}-tick traffic surge",
                "done": self.is_expired(),
            },
        ]

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
