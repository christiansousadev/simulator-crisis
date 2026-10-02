"""DDoS Global scenario: volumetric attack overwhelms the API gateway and cascades"""

import random
from typing import Any, Dict, List, Optional

from app.engine import formulas
from app.engine.scenarios.base import ScenarioEngine, register_scenario


@register_scenario
class DdosGlobalScenario(ScenarioEngine):
    scenario_id = "ddos_global"
    display_name = "DDoS Global Attack"
    duration_ticks = 52
    description = (
        "A coordinated volumetric DDoS attack saturates the API Gateway with synthetic "
        "flood traffic, triggering cascading latency spikes and error-rate degradation "
        "across every downstream microservice."
    )
    special_conditions = [
        "API Gateway (srv-api-gw) receives 8x synthetic flood traffic from tick 1",
        "Every healthy service gains +4ms latency/tick from collateral congestion",
        "Attack volume fluctuates in 6-tick waves — anticipate surge windows",
        "CDN scrubbing upgrade reduces effective flood multiplier by 40% when active",
    ]
    objectives_summary = [
        "Keep srv-api-gw uptime above 80% across the attack window",
        "Resolve any payment-service incidents within 6 ticks of detection",
        "Survive the full 52-tick attack without a budget breach",
    ]
    unlock_requirement = "Complete Black Friday Rush with SLA ≥ 99.5%"

    FLOOD_BASE_MULTIPLIER = 8.0
    WAVE_PERIOD_TICKS = 6

    @classmethod
    def is_unlocked(cls, career_records: List[Any], achievements: set) -> bool:
        for r in career_records:
            if (
                getattr(r, "scenario_id", None) == "black_friday_rush"
                and getattr(r, "outcome", None) == "victory"
                and getattr(r, "final_sla_percentage", 0.0) >= 99.5
            ):
                return True
        return False

    def __init__(self, engine: Any):
        super().__init__(engine)
        self._api_gw_down_ticks = 0
        self._payment_incident_breach = False

    def _wave_multiplier(self) -> float:
        """6-tick sinusoidal surge wave — attack traffic is never constant"""
        phase = (self.elapsed_ticks % self.WAVE_PERIOD_TICKS) / self.WAVE_PERIOD_TICKS
        import math
        return 1.0 + 0.45 * math.sin(2 * math.pi * phase)

    def on_start(self) -> None:
        self.engine._log_audit_event(
            event_type="DDOS_ATTACK_DETECTED",
            actor="BORDER_FIREWALL",
            details={
                "attack_type": "volumetric_syn_flood",
                "target_service": "srv-api-gw",
                "estimated_gbps": 142,
            },
            compliance_flag=True,
        )

    def on_tick(self) -> None:
        """SATURATE API GW, BLEED LATENCY ACROSS THE MESH, TRACK PAYMENT BREACH"""
        wave = self._wave_multiplier()
        effective_flood = self.FLOOD_BASE_MULTIPLIER * wave

        # check if predictive_anomaly_detection is active — scrubs 40% of flood
        if "predictive_anomaly_detection" in self.engine.purchased_upgrade_ids:
            effective_flood *= 0.60

        # API gateway bears the full brunt
        for srv in self.engine.services:
            if srv["id"] == "srv-api-gw":
                if srv["status"] == "healthy":
                    srv["latency_ms"] = int(srv["latency_ms"] * (1.0 + effective_flood * 0.04))
            elif srv["status"] == "healthy":
                # collateral congestion — every hop feels the upstream pressure
                srv["latency_ms"] = max(srv["latency_ms"], srv["latency_ms"] + 4)

        # inflate scenario hazard so incident generation reflects the flood pressure
        self.engine._scenario_hazard_multiplier = 1.0 + effective_flood * 0.18

        # track gateway downtime for objective scoring
        gw = next((s for s in self.engine.services if s["id"] == "srv-api-gw"), None)
        if gw and gw["status"] == "down":
            self._api_gw_down_ticks += 1

        # track payment breach: any active incident on srv-payment older than 6 ticks
        for inc in self.engine.incidents:
            if inc.get("status") != "resolved" and inc.get("service_id") == "srv-payment" and (self.engine.current_tick - inc.get("created_tick", 0)) > 6:
                self._payment_incident_breach = True

    def objectives(self) -> List[Dict[str, Any]]:
        gw_uptime_pct = 100.0 * (1.0 - self._api_gw_down_ticks / max(1, self.elapsed_ticks))
        return [
            {
                "id": "gw_uptime",
                "description": "Keep API Gateway uptime above 80% across the attack window",
                "done": gw_uptime_pct >= 80.0,
            },
            {
                "id": "payment_sla",
                "description": "Resolve all Payment service incidents within 6 ticks of detection",
                "done": not self._payment_incident_breach,
            },
            {
                "id": "survive_attack",
                "description": f"Survive the full {self.duration_ticks}-tick DDoS window",
                "done": self.is_expired(),
            },
        ]

    def evaluate_victory(self) -> Optional[Dict[str, Any]]:
        if not self.is_expired():
            return None
        gw_uptime_pct = 100.0 * (1.0 - self._api_gw_down_ticks / max(1, self.elapsed_ticks))
        compliant = (
            gw_uptime_pct >= 80.0
            and not self._payment_incident_breach
            and self.engine.sla_percentage >= formulas.SLA_BREACH_THRESHOLD
        )
        return {
            "scenario_id": self.scenario_id,
            "gw_uptime_pct": round(gw_uptime_pct, 1),
            "payment_breach": self._payment_incident_breach,
            "final_sla_percentage": round(self.engine.sla_percentage, 2),
            "net_runway_saved": round(self.engine.budget, 2),
            "compliant": compliant,
        }

    def snapshot_extra(self) -> Dict[str, Any]:
        return {
            "api_gw_down_ticks": self._api_gw_down_ticks,
            "payment_incident_breach": self._payment_incident_breach,
        }

    def restore_extra(self, extra: Dict[str, Any]) -> None:
        self._api_gw_down_ticks = int(extra.get("api_gw_down_ticks", 0))
        self._payment_incident_breach = bool(extra.get("payment_incident_breach", False))
