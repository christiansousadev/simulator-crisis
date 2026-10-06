"""Third-Party Outage: an unannounced upstream provider failure causes cascading payment degradation"""

import random
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
        "Provider recovery is random: 20% chance per tick after tick 15, guaranteed by tick 40",
        "Runbooks are rejected on srv-payment and srv-notify until the provider recovers",
        "The scenario ends the moment the provider recovers: win with morale at 40% or more, budget above zero and average downstream latency under 500ms",
        "Every downstream service (srv-auth, srv-api-gw) loses 8% error-rate per downed provider",
        "Espresso machine upgrade improves team morale, reducing stress accumulation by 50%",
        "SLA penalty clock runs from tick 1 — mitigate blast radius aggressively",
    ]
    objectives_summary = [
        "Keep srv-auth and srv-api-gw latency below 500ms on average across the outage",
        "Maintain team morale (happiness) at 40% or more through the outage",
        "Survive without budget breach until the provider recovers",
    ]
    unlock_requirement = "Complete any scenario on 'chaos' difficulty"

    PROVIDER_SERVICES = {"srv-payment", "srv-notify"}
    DOWNSTREAM_AFFECTED = {"srv-auth", "srv-api-gw"}
    RECOVERY_START_TICK = 15
    # the provider is guaranteed back by this tick so the run always has a verdict inside the window
    RECOVERY_DEADLINE_TICK = 40
    MORALE_THRESHOLD = 40.0
    DOWNSTREAM_LATENCY_LIMIT_MS = 500
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
        # running mean of the downstream average latency over the outage: a single incident spiking
        # one service on the very tick the provider recovers must not decide the run
        self._latency_sum = 0.0
        self._latency_samples = 0
        # unseeded on purpose: seeding from the (constant) session id replayed the identical recovery tick every run
        self._rng = random.Random()

    def _force_providers_down(self) -> None:
        """PIN THE VENDOR-OWNED SERVICES TO 'down' -- THEY ARE NOT OURS TO REPAIR, SO NOTHING (A
        RANDOM FAILURE ROLL, A STRAY RUNBOOK) MAY LEAVE THEM HEALED BEFORE THE PROVIDER ITSELF RECOVERS"""
        for srv in self.engine.services:
            if srv["id"] in self.PROVIDER_SERVICES:
                srv["status"] = "down"
                srv["error_rate"] = 1.0
                srv["latency_ms"] = 9999

    def _downstream_latency_now(self) -> float:
        latencies = [srv["latency_ms"] for srv in self.engine.services if srv["id"] in self.DOWNSTREAM_AFFECTED]
        return sum(latencies) / max(1, len(latencies))

    def _downstream_avg_latency(self) -> float:
        """MEAN DOWNSTREAM LATENCY ACROSS THE OUTAGE SO FAR (THE LIVE VALUE BEFORE THE FIRST SAMPLE)"""
        if self._latency_samples == 0:
            return self._downstream_latency_now()
        return self._latency_sum / self._latency_samples

    def mitigation_block_reason(self, action_id: str, service_id: str) -> Optional[str]:
        """NO RUNBOOK CAN FIX A VENDOR'S OUTAGE -- A US$800 CIRCUIT BREAKER MUST NOT 'HEAL' IT"""
        if service_id in self.PROVIDER_SERVICES and not self._provider_recovered:
            return "External provider outage: no internal fix is available, wait for the provider to recover"
        return None

    def on_start(self) -> None:
        """Force provider services down and notify the team"""
        self._force_providers_down()

        self.engine._log_audit_event(
            event_type="THIRD_PARTY_PROVIDER_OUTAGE",
            actor="EXTERNAL_MONITOR",
            details={
                "provider": "PayStream Inc. / SMSRelay",
                "affected_services": list(self.PROVIDER_SERVICES),
                "estimated_recovery": "unknown",
                "status_page": "https://status.paystream.example.com",
            },
            # the outage is a non-compliant (adverse) event; the recovery below is the compliant one
            compliance_flag=False,
        )

    def on_tick(self) -> None:
        """PROPAGATE BLAST RADIUS, ROLL RECOVERY CHANCE, TRACK MORALE DRAIN"""
        # downstream services bleed error rate from the downed providers
        if not self._provider_recovered:
            self._force_providers_down()
            for srv in self.engine.services:
                if srv["id"] in self.DOWNSTREAM_AFFECTED:
                    srv["error_rate"] = min(0.75, srv["error_rate"] + self.DOWNSTREAM_ERROR_RATE_PENALTY)
                    srv["latency_ms"] = min(9000, srv["latency_ms"] + 12)

            # provider recovery lottery — starts at tick 15, guaranteed by the deadline tick
            if self.elapsed_ticks >= self.RECOVERY_START_TICK:
                if (
                    self.elapsed_ticks >= self.RECOVERY_DEADLINE_TICK
                    or self._rng.random() < self.RECOVERY_CHANCE_PER_TICK
                ):
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
                        compliance_flag=True,
                    )

        self._latency_sum += self._downstream_latency_now()
        self._latency_samples += 1

        # morale drain: espresso machine halves it
        drain = 0.8 if "espresso_machine" in self.engine.purchased_upgrade_ids else 1.6
        self.engine.user_happiness = formulas.clamp_percentage(
            self.engine.user_happiness - drain
        )

    def objectives(self) -> List[Dict[str, Any]]:
        """THE THREE OBJECTIVES ARE EXACTLY THE VICTORY RULE'S THREE CONDITIONS (SEE evaluate_victory)"""
        return [
            {
                "id": "downstream_latency",
                "description": "Keep srv-auth and srv-api-gw average latency below 500ms across the outage",
                "done": self._downstream_avg_latency() < self.DOWNSTREAM_LATENCY_LIMIT_MS,
            },
            {
                "id": "team_morale",
                "description": "Maintain team happiness at 40% or more through the outage",
                "done": self.engine.user_happiness >= self.MORALE_THRESHOLD,
            },
            {
                "id": "survive_outage",
                "description": "Survive without budget breach until the provider recovers",
                "done": self._provider_recovered and self.engine.budget > 0,
            },
        ]

    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        """THE RUN ENDS WHEN THE PROVIDER RECOVERS (OR, DEFENSIVELY, WHEN THE WINDOW EXPIRES FIRST).
        VICTORY = MORALE >= 40%, BUDGET > 0 AND DOWNSTREAM LATENCY UNDER 500ms AT THAT MOMENT. THE
        ROLLING SLA IS DELIBERATELY NOT PART OF IT: THE TWO VENDOR SERVICES ARE UNFIXABLE BY DESIGN
        AND KEEP IT FAR BELOW THE 99% BREACH LINE FOR THE WHOLE OUTAGE, SO GATING ON IT MADE
        VICTORY UNREACHABLE (IT IS STILL REPORTED IN THE OUTCOME)."""
        if not self._provider_recovered and not self.is_expired():
            return None
        morale_ok = self.engine.user_happiness >= self.MORALE_THRESHOLD
        budget_ok = self.engine.budget > 0
        latency_ok = self._downstream_avg_latency() < self.DOWNSTREAM_LATENCY_LIMIT_MS
        compliant = self._provider_recovered and morale_ok and budget_ok and latency_ok
        return {
            "scenario_id": self.scenario_id,
            "provider_recovered": self._provider_recovered,
            "recovery_tick": self._recovery_tick,
            "morale_ok": morale_ok,
            "downstream_latency_ok": latency_ok,
            "final_happiness": round(self.engine.user_happiness, 1),
            "final_sla_percentage": round(self.engine.sla_percentage, 2),
            "net_runway_saved": round(self.engine.budget, 2),
            "compliant": compliant,
        }

    def snapshot_extra(self) -> Dict[str, Any]:
        return {
            "provider_recovered": self._provider_recovered,
            "recovery_tick": self._recovery_tick,
            "latency_sum": self._latency_sum,
            "latency_samples": self._latency_samples,
        }

    def restore_extra(self, extra: Dict[str, Any]) -> None:
        self._provider_recovered = bool(extra.get("provider_recovered", False))
        self._recovery_tick = extra.get("recovery_tick")
        self._latency_sum = float(extra.get("latency_sum", 0.0))
        self._latency_samples = int(extra.get("latency_samples", 0))
