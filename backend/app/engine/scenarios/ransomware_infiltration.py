"""ransomware infiltration scenario: contain lateral movement before the master db is encrypted"""

from typing import Any, Dict, List, Optional

from app.engine.scenarios.base import ScenarioEngine, register_scenario


@register_scenario
class RansomwareInfiltrationScenario(ScenarioEngine):
    scenario_id = "ransomware_infiltration"
    display_name = "Ransomware Infiltration"
    duration_ticks = 60
    description = "Active hostile intrusion into peripheral workers propagating laterally along outbound dependency links toward the master database."
    special_conditions = [
        "Patient Zero compromise begins in notification worker (srv-notify)",
        "Lateral movement attempts every 4 ticks along outbound dependencies",
        "+15% error rate per tick on unquarantined infected nodes",
        "Instant defeat if payment database (srv-payment) is encrypted and downed",
    ]
    objectives_summary = [
        "Prevent srv-payment (Master DB) from being compromised",
        "Quarantine every compromised service before expiration",
    ]
    unlock_requirement = "Complete Chaos Engineering Drill or earn 75+ lifetime prestige"

    @classmethod
    def is_unlocked(cls, career_records: List[Any], achievements: set) -> bool:
        if "chaos_survivor" in achievements:
            return True
        for r in career_records:
            if getattr(r, "scenario_id", None) == "chaos_engineering_drill" and getattr(r, "outcome", None) == "victory":
                return True
        lifetime_prestige = sum(
            getattr(r, "prestige_earned", 0) for r in career_records
        )
        return lifetime_prestige >= 75

    LATERAL_MOVEMENT_INTERVAL_TICKS = 4
    MASTER_DB_SERVICE_ID = "srv-payment"

    def __init__(self, engine: Any):
        super().__init__(engine)
        self.infected_service_ids = {"srv-notify"}
        self.quarantined_service_ids: set = set()
        # this scenario's OWN, dedicated lateral-movement relation -- frozen from the engine's
        # topology at construction time rather than read live off service["dependencies"] every
        # tick. reuses the same ids/topology (no new generic security system), but is a distinct,
        # explicit attribute: a future change to how operational dependencies are modeled can
        # never silently change what this scenario considers a valid pivot target, and vice versa
        # (see on_tick's docstring for why operational-cascade direction and lateral-movement
        # direction are different concepts that happen to reuse the same graph). safe to build
        # from `engine.services` regardless of whether this is a fresh construction or a
        # restore-from-snapshot reconstruction: each service's `dependencies` list is part of the
        # fixed catalog topology and never varies per-session/per-restore, only status/latency/
        # error_rate do.
        self._lateral_movement_map: Dict[str, List[str]] = {
            srv["id"]: list(srv["dependencies"]) for srv in engine.services
        }

    def on_start(self) -> None:
        """LOG THE INITIAL COMPROMISE AS A REAL, TIMESTAMPED GOVERNANCE EVENT -- SO THE RUN'S
        AUDIT TRAIL (AND ANY LATER HISTORICAL RECONSTRUCTION) RECORDS PATIENT ZERO EXPLICITLY,
        RATHER THAN IT ONLY EVER BEING VISIBLE AS AN IMPLICIT STARTING SET IN infected_service_ids"""
        self.engine._log_audit_event(
            event_type="PATIENT_ZERO_IDENTIFIED",
            actor="AUTOMATED_MONITOR",
            details={"service_id": next(iter(self.infected_service_ids))},
            compliance_flag=False,
        )

    def on_tick(self) -> None:
        """PROPAGATE COMPROMISE ALONG self._lateral_movement_map EVERY 4 TICKS -- I.E. FROM A
        COMPROMISED SERVICE INTO THE SERVICES IT ITSELF DEPENDS ON/CALLS (ITS OWN FROZEN LATERAL-
        MOVEMENT TARGETS, SEE __init__), MODELING AN ATTACKER PIVOTING OUTWARD USING THE
        COMPROMISED HOST'S OWN OUTBOUND CREDENTIALS/CONNECTIONS.

        THIS IS DELIBERATELY THE OPPOSITE DIRECTION FROM THE OPERATIONAL FAILURE CASCADE (SEE
        formulas.cascading_failure_probability, WHERE AN UNHEALTHY UPSTREAM DEPENDENCY RAISES ITS
        DOWNSTREAM DEPENDENTS' HAZARD -- i.e. "X DOWN HURTS WHOEVER DEPENDS ON X"). AVAILABILITY
        PROBLEMS AND A SECURITY COMPROMISE SPREAD FOR DIFFERENT REASONS ALONG DIFFERENT EDGES OF
        THE SAME GRAPH, SO THIS MUST NOT REUSE THAT DIRECTION -- REUSING IT IS ALSO WHY THIS
        SCENARIO USED TO BE UNABLE TO SPREAD FROM ITS STARTING SERVICE (srv-notify) AT ALL:
        NOTHING IN THE FIXED TOPOLOGY DEPENDS ON srv-notify, SO "INFECT WHOEVER DEPENDS ON AN
        INFECTED SERVICE" HAD NOWHERE TO GO FROM THAT STARTING POINT. WALKING srv-notify'S OWN
        dependencies INSTEAD (["srv-api-gw"]) GIVES IT SOMEWHERE TO PIVOT TO IMMEDIATELY."""
        if self.elapsed_ticks % self.LATERAL_MOVEMENT_INTERVAL_TICKS != 0:
            return
        newly_infected = set()
        for infected_id in self.infected_service_ids:
            for dep_id in self._lateral_movement_map.get(infected_id, []):
                if dep_id not in self.quarantined_service_ids:
                    newly_infected.add(dep_id)
        self.infected_service_ids |= newly_infected
        for srv in self.engine.services:
            if srv["id"] in self.infected_service_ids and srv["id"] not in self.quarantined_service_ids:
                srv["status"] = "degraded"
                srv["error_rate"] = min(1.0, srv["error_rate"] + 0.15)

    def snapshot_extra(self) -> Dict[str, Any]:
        """PERSIST INFECTION SPREAD AND QUARANTINE PROGRESS -- WITHOUT THIS, A RESTART WOULD
        SILENTLY RE-SHRINK THE INFECTION BACK TO ITS STARTING FOOTPRINT AND FORGET ANY
        QUARANTINE ALREADY WON"""
        return {
            "infected_service_ids": sorted(self.infected_service_ids),
            "quarantined_service_ids": sorted(self.quarantined_service_ids),
        }

    def restore_extra(self, extra: Dict[str, Any]) -> None:
        self.infected_service_ids = set(extra.get("infected_service_ids", ["srv-notify"]))
        self.quarantined_service_ids = set(extra.get("quarantined_service_ids", []))

    def objectives(self) -> List[Dict[str, Any]]:
        """TWO CONCRETE, BACKEND-DERIVED OBJECTIVES -- NEITHER IS A SEPARATELY TRACKED FLAG; BOTH
        ARE RECOMPUTED FROM infected_service_ids/quarantined_service_ids EVERY CALL"""
        return [
            {
                "id": "protect_master_db",
                "description": f"Prevent {self.MASTER_DB_SERVICE_ID} from being compromised",
                "done": self.MASTER_DB_SERVICE_ID not in self.infected_service_ids,
            },
            {
                "id": "contain_spread",
                "description": "Quarantine every compromised service",
                "done": bool(self.infected_service_ids) and self.infected_service_ids <= self.quarantined_service_ids,
            },
        ]

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
