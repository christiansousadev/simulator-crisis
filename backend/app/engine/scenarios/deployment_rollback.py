"""Deployment Rollback Emergency: a hot-fix deploy introduced a regression —
contain blast radius and execute rollback before the SLA breach window closes."""

from typing import Any, Dict, List, Optional

from app.engine import formulas
from app.engine.scenarios.base import ScenarioEngine, register_scenario


@register_scenario
class DeploymentRollbackScenario(ScenarioEngine):
    scenario_id = "deployment_rollback"
    display_name = "Deployment Rollback Emergency"
    duration_ticks = 40
    description = (
        "A rushed hot-fix deploy introduced a silent memory leak that is steadily "
        "degrading Auth and Search services. You have 40 ticks to identify the bad "
        "commit, triage the root cause in both affected services, and execute a clean "
        "rollback before the error budget evaporates entirely."
    )
    special_conditions = [
        "Auth (srv-auth) and Search (srv-search) begin in 'degraded' state from tick 1",
        "Memory leak drives latency +6ms/tick on affected services until triage is solved",
        "Tech debt increases +2/tick to model the cost of the hasty hotfix",
        "Automated CI/CD upgrade halves rollback cost and latency growth rate",
        "A second failure wave hits at tick 20 if both services are not yet triaged",
    ]
    objectives_summary = [
        "Triage the root cause on both srv-auth and srv-search",
        "Restore both services to 'healthy' before tick 38",
        "Keep error budget above 20% through the rollback window",
    ]
    unlock_requirement = "Earn any scenario victory on 'standard' or higher difficulty"

    LEAK_LATENCY_GROWTH_PER_TICK = 6
    TECH_DEBT_GROWTH_PER_TICK = 2
    SECOND_WAVE_TICK = 20
    AFFECTED_SERVICES = {"srv-auth", "srv-search"}

    @classmethod
    def is_unlocked(cls, career_records: List[Any], achievements: set) -> bool:
        for r in career_records:
            diff = getattr(r, "difficulty", "standard") or "standard"
            if (
                getattr(r, "outcome", None) == "victory"
                and getattr(r, "scenario_id", None) is not None
                and diff in ("standard", "chaos")
            ):
                return True
        return False

    def __init__(self, engine: Any):
        super().__init__(engine)
        self._second_wave_triggered = False
        self._both_triaged_by: Optional[int] = None

    def on_start(self) -> None:
        """Pre-degrade auth and search to simulate the bad deploy already deployed"""
        for srv in self.engine.services:
            if srv["id"] in self.AFFECTED_SERVICES:
                srv["status"] = "degraded"
                srv["latency_ms"] = int(srv["latency_ms"] * 1.6)
                srv["error_rate"] = min(0.25, srv["error_rate"] + 0.12)

        self.engine._log_audit_event(
            event_type="DEPLOYMENT_REGRESSION_DETECTED",
            actor="CI_PIPELINE",
            details={
                "commit_sha": "c3f8a12",
                "affected_services": list(self.AFFECTED_SERVICES),
                "regression_type": "memory_leak",
                "deploy_environment": "production",
            },
            compliance_flag=True,
        )

    def on_tick(self) -> None:
        """APPLY LEAK GROWTH, TECH DEBT ACCUMULATION, OPTIONAL SECOND WAVE"""
        growth = self.LEAK_LATENCY_GROWTH_PER_TICK
        # automated_cicd upgrade halves growth
        if "automated_cicd" in self.engine.purchased_upgrade_ids:
            growth = growth // 2

        triaged_count = sum(
            1 for inc in self.engine.incidents
            if inc.get("service_id") in self.AFFECTED_SERVICES and inc.get("triage_solved")
        )

        for srv in self.engine.services:
            if srv["id"] in self.AFFECTED_SERVICES and srv["status"] != "down":
                srv["latency_ms"] = int(srv["latency_ms"] + growth)

        # tech debt bleeds each tick until both services are triaged
        if triaged_count < 2:
            self.engine.tech_debt = formulas.clamp_tech_debt(
                self.engine.tech_debt + self.TECH_DEBT_GROWTH_PER_TICK
            )
        else:
            if self._both_triaged_by is None:
                self._both_triaged_by = self.elapsed_ticks

        # second wave at tick 20 if neither service is healed
        if self.elapsed_ticks == self.SECOND_WAVE_TICK and triaged_count == 0 and not self._second_wave_triggered:
            self._second_wave_triggered = True
            for srv in self.engine.services:
                if srv["id"] in self.AFFECTED_SERVICES:
                    srv["error_rate"] = min(0.55, srv["error_rate"] + 0.18)
            self.engine._log_audit_event(
                event_type="SECOND_REGRESSION_WAVE",
                actor="AUTOMATED_MONITOR",
                details={"note": "Memory pool exhaustion: both affected services entering critical degradation"},
                compliance_flag=True,
            )

    def objectives(self) -> List[Dict[str, Any]]:
        triaged = {
            srv["id"] for srv in self.engine.services
            if srv["id"] in self.AFFECTED_SERVICES
            and any(i.get("service_id") == srv["id"] and i.get("triage_solved") for i in self.engine.incidents)
        }
        both_healthy = all(
            srv["status"] == "healthy"
            for srv in self.engine.services
            if srv["id"] in self.AFFECTED_SERVICES
        )
        budget_ok = self.engine.error_budget_remaining_ratio > 0.20
        return [
            {
                "id": "triage_both",
                "description": "Triage the root cause on both srv-auth and srv-search",
                "done": len(triaged) >= 2,
            },
            {
                "id": "restore_services",
                "description": "Restore both services to healthy before tick 38",
                "done": both_healthy and self.elapsed_ticks <= 38,
            },
            {
                "id": "protect_budget",
                "description": "Keep error budget above 20% through the rollback window",
                "done": budget_ok,
            },
        ]

    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        if not self.is_expired():
            return None
        both_healthy = all(
            srv["status"] == "healthy"
            for srv in self.engine.services
            if srv["id"] in self.AFFECTED_SERVICES
        )
        budget_ok = self.engine.error_budget_remaining_ratio > 0.20
        compliant = both_healthy and budget_ok and self.engine.sla_percentage >= formulas.SLA_BREACH_THRESHOLD
        return {
            "scenario_id": self.scenario_id,
            "services_restored": both_healthy,
            "error_budget_protected": budget_ok,
            "second_wave_triggered": self._second_wave_triggered,
            "both_triaged_by_tick": self._both_triaged_by,
            "final_sla_percentage": round(self.engine.sla_percentage, 2),
            "net_runway_saved": round(self.engine.budget, 2),
            "compliant": compliant,
        }

    def snapshot_extra(self) -> Dict[str, Any]:
        return {
            "second_wave_triggered": self._second_wave_triggered,
            "both_triaged_by": self._both_triaged_by,
        }

    def restore_extra(self, extra: Dict[str, Any]) -> None:
        self._second_wave_triggered = bool(extra.get("second_wave_triggered", False))
        self._both_triaged_by = extra.get("both_triaged_by")
