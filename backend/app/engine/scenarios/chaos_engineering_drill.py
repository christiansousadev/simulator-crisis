"""chaos engineering drill scenario: randomized pod termination stress test"""

import random
from typing import Any, Dict, List, Optional

from app.engine.scenarios.base import ScenarioEngine, register_scenario


@register_scenario
class ChaosEngineeringDrillScenario(ScenarioEngine):
    scenario_id = "chaos_engineering_drill"
    display_name = "Chaos Engineering Drill"
    duration_ticks = 40
    description = "Automated game-day stress drill simulating sudden pod evictions and randomized service degradation."
    special_conditions = [
        "20% probability per tick of spontaneous chaos disruption",
        "Disruptions strike healthy services independent of Technical Debt",
        "Strict zero-breach audit enforcement across drill window",
    ]
    objectives_summary = [
        "Finish the drill with zero regulatory breach flags",
        "Survive the 40-tick chaos drill",
    ]
    unlock_requirement = "Complete any previous run or unlock the Century Club achievement"

    @classmethod
    def is_unlocked(cls, career_records: List[Any], achievements: set) -> bool:
        if bool(career_records):
            return True
        return "century_club" in achievements

    CHAOS_STRIKE_PROBABILITY_PER_TICK = 0.20

    def on_tick(self) -> None:
        """RANDOMLY DEGRADE A HEALTHY SERVICE EACH TICK, INDEPENDENT OF THE NATURAL HAZARD MODEL"""
        if random.random() >= self.CHAOS_STRIKE_PROBABILITY_PER_TICK:
            return
        healthy = [s for s in self.engine.services if s["status"] == "healthy"]
        if not healthy:
            return
        target = random.choice(healthy)
        self.engine._trigger_service_failure(target)
        self.engine._log_audit_event(
            event_type="CHAOS_STRIKE",
            actor="AUTOMATED_MONITOR",
            details={"service_id": target["id"]},
            compliance_flag=True,
        )

    def _breach_flags_in_window(self) -> int:
        """COUNT REGULATORY BREACH FLAGS LOGGED SINCE THIS DRILL'S OWN WINDOW STARTED -- SHARED BY
        objectives() AND evaluate_victory() SO THE TWO NEVER DRIFT APART"""
        window_start = self.engine.current_tick - self.duration_ticks
        return sum(
            1 for entry in self.engine.audit_logs
            if entry["compliance_flag"] is False and entry["tick"] >= window_start
        )

    def objectives(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "zero_breach_flags",
                "description": "Finish the drill with zero regulatory breach flags",
                "done": self._breach_flags_in_window() == 0,
                # breach flags are never removed from the audit trail, so once seen the objective stays failed
                "failed": self._breach_flags_in_window() > 0,
            },
            {
                "id": "survive_drill",
                "description": f"Survive the {self.duration_ticks}-tick chaos drill",
                "done": self.is_expired(),
            },
        ]

    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        """SCORE RESILIENCE: ZERO REGULATORY BREACH FLAGS ACROSS THE FULL DRILL WINDOW"""
        if not self.is_expired():
            return None
        breach_flags = self._breach_flags_in_window()
        return {
            "scenario_id": self.scenario_id,
            "regulatory_breach_flags": breach_flags,
            "compliant": breach_flags == 0,
            "final_sla_percentage": round(self.engine.sla_percentage, 2),
        }
