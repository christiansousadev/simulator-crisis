"""Third-Party Outage: an unannounced upstream provider failure causes cascading payment degradation"""

from typing import Any, Dict, List, Optional

from app.engine import formulas
from app.engine.scenarios.base import ScenarioEngine, register_scenario


@register_scenario
class ThirdPartyOutageScenario(ScenarioEngine):
    scenario_id = "third_party_outage"
    display_name = "Third-Party Provider Outage"
    duration_ticks = 45
    description = (
        "Your payment processor and SMS gateway provider declared a \"maintenance window\" "
        "at 3 AM without notice. srv-payment and srv-notify are now unreachable, and "
        "you have no rollback path — only damage mitigation until the provider recovers."
    )
    special_conditions = [
        "srv-payment and srv-notify start in forced 'down' state — no operational fix available",
        "Provider recovery is random: 20% chance per tick after tick 15",
        "Every downstream service (srv-auth, srv-api-gw) loses 8% error-rate per downed provider",
        "Espresso machine upgrade improves team morale, reducing stress accumulation by 50%",
        "SLA penalty clock runs from tick 1 — mitigate blast radius aggressively",
    ]
    objectives_summary = [
        "Keep srv-auth and srv-api-gw latency below 500ms on average",
        "Maintain team morale (happiness) above 40% through the outage",
        "Survive without budget breach until the provider recovers",
    ]
    unlock_requirement = "Complete any scenario on 'chaos' difficulty"

    PROVIDER_SERVICES = {"srv-payment", "srv-notify"}
    DOWNSTREAM_AFFECTED = {"srv-auth", "srv-api-gw"}
    RECOVERY_START_TICK = 15
    RECOVERY_CHANCE_PER_TICK = 0.20
    DOWNSTREAM_ERROR_RATE_PENALTY = 0.08

    @classmethod
    def is_unlocked(cls, career_records: List[Any], achievements: set) -> bool:
        for r in career_records:
            if (
                getattr(r, "difficulty", None) == "chaos"
                and getattr(r, "outcome", None) == "victory"
            ):
                return True
        return False

    def __init__(self, engine: Any):
        super().__init__(engine)
        self._provider_recovered = False
        self._recovery_tick: Optional[int] = None
        import random
        self._rng = random.Random(engine.session_id if hasattr(engine, "session_id") else 42)

    def on_start(self) -> None:
        """Force provider services down and notify the team"""
        for srv in self.engine.services:
            if srv["id"] in self.PROVIDER_SERVICES:
                srv["status"] = "down"
                srv["error_rate"] = 1.0
                srv["latency_ms"] = 9999

        self.engine._log_audit_event(
            event_type="THIRD_PARTY_PROVIDER_OUTAGE",
            actor="EXTERNAL_MONITOR",
            details={
                "provider": "PayStream Inc. / SMSRelay",
                "affected_services": list(self.PROVIDER_SERVICES),
                "estimated_recovery": "unknown",
                "status_page": "https://status.paystream.example.com",
            },
            compliance_flag=True,
        )

    def on_tick(self) -> None:
        """PROPAGATE BLAST RADIUS, ROLL RECOVERY CHANCE, TRACK MORALE DRAIN"""
        # downstream services bleed error rate from the downed providers
        if not self._provider_recovered:
            for srv in self.engine.services:
                if srv["id"] in self.DOWNSTREAM_AFFECTED:
                    srv["error_rate"] = min(0.75, srv["error_rate"] + self.DOWNSTREAM_ERROR_RATE_PENALTY)
                    srv["latency_ms"] = min(9000, srv["latency_ms"] + 12)

            # provider recovery lottery — starts at tick 15
            if self.elapsed_ticks >= self.RECOVERY_START_TICK:
                if self._rng.random() < self.RECOVERY_CHANCE_PER_TICK:
                    self._provider_recovered = True
                    self._recovery_tick = self.elapsed_ticks
                    for srv in self.engine.services:
                        if srv["id"] in self.PROVIDER_SERVICES:
                            srv["status"] = "healthy"
                            srv["error_rate"] = 0.01
                            srv["latency_ms"] = 80
                    self.engine._log_audit_event(
                        event_type="THIRD_PARTY_PROVIDER_RECOVERED",
                        actor="EXTERNAL_MONITOR",
                        details={"recovered_at_tick": self._recovery_tick},
                        compliance_flag=False,
                    )

        # morale drain: espresso machine halves it
        drain = 0.8 if "espresso_machine" in self.engine.purchased_upgrade_ids else 1.6
        self.engine.user_happiness = formulas.clamp_percentage(
            self.engine.user_happiness - drain
        )

    def objectives(self) -> List[Dict[str, Any]]:
        affected_latencies = [
            srv["latency_ms"] for srv in self.engine.services
            if srv["id"] in self.DOWNSTREAM_AFFECTED
        ]
        avg_latency = sum(affected_latencies) / max(1, len(affected_latencies))
        return [
            {
                "id": "downstream_latency",
                "description": "Keep srv-auth and srv-api-gw average latency below 500ms",
                "done": avg_latency < 500,
            },
            {
                "id": "team_morale",
                "description": "Maintain team happiness above 40% through the outage",
                "done": self.engine.user_happiness >= 40.0,
            },
            {
                "id": "survive_outage",
                "description": "Survive without budget breach until the provider recovers",
                "done": self._provider_recovered and self.engine.budget > 0,
            },
        ]

    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        # victory condition: provider has recovered AND scenario duration elapsed
        if not self.is_expired():
            if not self._provider_recovered:
                return None
        compliant = (
            self.engine.user_happiness >= 40.0
            and self.engine.sla_percentage >= formulas.SLA_BREACH_THRESHOLD
            and (self._provider_recovered or self.is_expired())
        )
        return {
            "scenario_id": self.scenario_id,
            "provider_recovered": self._provider_recovered,
            "recovery_tick": self._recovery_tick,
            "final_happiness": round(self.engine.user_happiness, 1),
            "final_sla_percentage": round(self.engine.sla_percentage, 2),
            "net_runway_saved": round(self.engine.budget, 2),
            "compliant": compliant,
        }

    def snapshot_extra(self) -> Dict[str, Any]:
        return {
            "provider_recovered": self._provider_recovered,
            "recovery_tick": self._recovery_tick,
        }

    def restore_extra(self, extra: Dict[str, Any]) -> None:
        self._provider_recovered = bool(extra.get("provider_recovered", False))
        self._recovery_tick = extra.get("recovery_tick")
