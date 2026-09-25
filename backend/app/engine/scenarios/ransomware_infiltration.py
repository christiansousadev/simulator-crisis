"""ransomware infiltration scenario: contain lateral movement before the master db is encrypted"""

from typing import Any, Dict, Optional

from app.engine.scenarios.base import ScenarioEngine, register_scenario


@register_scenario
class RansomwareInfiltrationScenario(ScenarioEngine):
    scenario_id = "ransomware_infiltration"
    display_name = "Ransomware Infiltration"
    duration_ticks = 60

    LATERAL_MOVEMENT_INTERVAL_TICKS = 4
    MASTER_DB_SERVICE_ID = "srv-payment"

    def __init__(self, engine: Any):
        super().__init__(engine)
        self.infected_service_ids = {"srv-notify"}
        self.quarantined_service_ids: set = set()

    def on_tick(self) -> None:
        """PROPAGATE INFECTION ALONG UNQUARANTINED DEPENDENCY EDGES EVERY 4 TICKS"""
        if self.elapsed_ticks % self.LATERAL_MOVEMENT_INTERVAL_TICKS != 0:
            return
        newly_infected = set()
        for srv in self.engine.services:
            if srv["id"] in self.quarantined_service_ids:
                continue
            for dep_id in srv["dependencies"]:
                if dep_id in self.infected_service_ids and srv["id"] not in self.quarantined_service_ids:
                    newly_infected.add(srv["id"])
        self.infected_service_ids |= newly_infected
        for srv in self.engine.services:
            if srv["id"] in self.infected_service_ids and srv["id"] not in self.quarantined_service_ids:
                srv["status"] = "degraded"
                srv["error_rate"] = min(1.0, srv["error_rate"] + 0.15)

    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        """DEFEAT IF THE MASTER DB IS ENCRYPTED, VICTORY ON SURVIVING THE FULL WINDOW OTHERWISE"""
        master_db_encrypted = self.MASTER_DB_SERVICE_ID in self.infected_service_ids and any(
            s["id"] == self.MASTER_DB_SERVICE_ID and s["status"] == "down" for s in self.engine.services
        )
        if master_db_encrypted:
            return {
                "scenario_id": self.scenario_id,
                "outcome": "defeat",
                "master_db_encrypted": True,
                "compliant": False,
            }
        if not self.is_expired():
            return None
        return {
            "scenario_id": self.scenario_id,
            "outcome": "victory",
            "master_db_encrypted": False,
            "services_contained": len(self.quarantined_service_ids),
            "compliant": True,
        }
