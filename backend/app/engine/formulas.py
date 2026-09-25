"""pure mathematical formulas for the incidentzero simulation engine.

kept free of engine state so each function is independently testable.
"""

from typing import Any, Dict, Iterable, List

# sla weighting per service tier (formula 1)
CRITICAL_WEIGHT = 3.0
STANDARD_WEIGHT = 1.0

# cascading failure hazard model (formula 2)
BASE_FAILURE_PROBABILITY = 0.015
MAX_FAILURE_PROBABILITY = 0.65
TDI_HAZARD_DIVISOR = 35.0
TDI_HAZARD_EXPONENT = 1.8
DOWN_DEPENDENCY_SHOCK = 3.5
DEGRADED_DEPENDENCY_SHOCK = 1.8

# mtta / mttr penalty mechanics (formula 3)
ALERT_FATIGUE_START_TICK = 5
ALERT_FATIGUE_END_TICK = 11
ALERT_FATIGUE_HAPPINESS_PENALTY = 1.5
UNATTENDED_BREACH_TICK = 12
UNATTENDED_BREACH_FINE = 4500.0

SEVERITY_BASE_SURCHARGE = {
    "P1_CRITICAL": 800.0,
    "P2_HIGH": 250.0,
    "P3_MEDIUM": 100.0,
    "P4_LOW": 40.0,
}
SURCHARGE_GROWTH_RATE = 0.08
SURCHARGE_EXPONENT = 1.3

# baseline economics
PASSIVE_CLOUD_BURN = 200.0
PASSIVE_PAYROLL_BURN = 450.0
PASSIVE_BASE_BURN = PASSIVE_CLOUD_BURN + PASSIVE_PAYROLL_BURN
CHURN_BURN_MULTIPLIER = 1.5
CHURN_HAPPINESS_THRESHOLD = 40.0

SLA_BENCHMARK = 99.90
SLA_BREACH_THRESHOLD = 99.00

# error budget governance (google sre alignment)
TOTAL_ERROR_BUDGET_PCT = 100.0 - SLA_BENCHMARK

# cab dilemma cadence
CAB_DILEMMA_MIN_INTERVAL_TICKS = 40
CAB_DILEMMA_MAX_INTERVAL_TICKS = 60

# staff on-call fatigue mechanics
STRESS_BASE_GAIN_PER_TICK = 1.5
STRESS_COMPOUND_EXPONENT = 1.15
STRESS_MTTR_DOUBLE_THRESHOLD = 75
OFF_DUTY_STRESS_RECOVERY_PER_TICK = 2.0
OFF_DUTY_STAMINA_RECOVERY_PER_TICK = 3.0
ON_DUTY_STAMINA_DRAIN_PER_TICK = 0.5
HIRING_COST = 15000.0

# mitigation runbook catalog: single source of truth shared by engine + api
MITIGATION_CATALOG: List[Dict[str, Any]] = [
    {
        "id": "rollback",
        "name": "Rollback Canary",
        "description": "Revert to last immutable stable container SHA.",
        "cost": 1800.0,
        "tech_debt_delta": -2,
        "resolve_speed_multiplier": 1.5,
        "cooldown_ticks": 3,
        "category": "deployment",
    },
    {
        "id": "scale_replicas",
        "name": "Spin Replicas (+4 Pods)",
        "description": "Horizontally scale compute pool to absorb traffic spikes.",
        "cost": 3200.0,
        "tech_debt_delta": 1,
        "resolve_speed_multiplier": 1.2,
        "cooldown_ticks": 4,
        "category": "infra",
    },
    {
        "id": "circuit_breaker",
        "name": "Enable Circuit Breaker",
        "description": "Shed non-critical traffic to protect database master.",
        "cost": 800.0,
        "tech_debt_delta": 3,
        "resolve_speed_multiplier": 1.1,
        "cooldown_ticks": 5,
        "category": "resilience",
    },
    {
        "id": "emergency_patch",
        "name": "Hotfix Prod Live",
        "description": "Direct SSH hotfix. Instant cure, high technical debt.",
        "cost": 500.0,
        "tech_debt_delta": 8,
        "resolve_speed_multiplier": 2.0,
        "cooldown_ticks": 6,
        "category": "hotfix",
    },
]


def service_weight(tier: str) -> float:
    """RETURN SLA WEIGHT FOR A SERVICE TIER"""
    return CRITICAL_WEIGHT if tier == "critical" else STANDARD_WEIGHT


def unavailability_factor(status: str, latency_ms: float, error_rate: float) -> float:
    """COMPUTE PER-SERVICE UNAVAILABILITY FACTOR U_I(T)"""
    if status == "down":
        return 1.0
    if status == "degraded":
        latency_component = max(0.0, (latency_ms - 100) / 1000.0) * 0.5
        error_component = error_rate * 0.5
        return min(1.0, latency_component + error_component)
    return 0.0


def instant_sla_percentage(services: Iterable[Dict[str, Any]]) -> float:
    """COMPUTE INSTANTANEOUS TICK AVAILABILITY AS A 0-100 PERCENTAGE"""
    total_weight = 0.0
    weighted_unavailability = 0.0
    for srv in services:
        weight = service_weight(srv["tier"])
        total_weight += weight
        weighted_unavailability += weight * unavailability_factor(
            srv["status"], srv["latency_ms"], srv["error_rate"]
        )
    if total_weight == 0.0:
        return 100.0
    return 100.0 * (1.0 - (weighted_unavailability / total_weight))


def dependency_shock_multiplier(dependency_statuses: Iterable[str]) -> float:
    """COMPUTE COMPOUND TOPOLOGY RISK MULTIPLIER FROM UPSTREAM DEPENDENCY HEALTH"""
    multiplier = 1.0
    for status in dependency_statuses:
        if status == "down":
            multiplier *= 1.0 + DOWN_DEPENDENCY_SHOCK
        elif status == "degraded":
            multiplier *= 1.0 + DEGRADED_DEPENDENCY_SHOCK
    return multiplier


def cascading_failure_probability(tech_debt: int, dependency_statuses: Iterable[str]) -> float:
    """COMPUTE EFFECTIVE FAILURE HAZARD P_FAILURE(I) FOR A HEALTHY SERVICE"""
    debt_multiplier = (1.0 + (tech_debt / TDI_HAZARD_DIVISOR)) ** TDI_HAZARD_EXPONENT
    dep_risk = dependency_shock_multiplier(dependency_statuses)
    return min(MAX_FAILURE_PROBABILITY, BASE_FAILURE_PROBABILITY * debt_multiplier * dep_risk)


def incident_surcharge(severity: str, elapsed_ticks: int) -> float:
    """COMPUTE NON-LINEAR PER-TICK BUDGET SURCHARGE FOR AN UNRESOLVED INCIDENT"""
    base = SEVERITY_BASE_SURCHARGE.get(severity, SEVERITY_BASE_SURCHARGE["P4_LOW"])
    return base * ((1.0 + SURCHARGE_GROWTH_RATE * elapsed_ticks) ** SURCHARGE_EXPONENT)


def alert_fatigue_penalty(mtta_ticks: int) -> float:
    """RETURN HAPPINESS PENALTY WHEN AN INCIDENT SITS UNACKNOWLEDGED TOO LONG"""
    if ALERT_FATIGUE_START_TICK <= mtta_ticks <= ALERT_FATIGUE_END_TICK:
        return ALERT_FATIGUE_HAPPINESS_PENALTY
    return 0.0


def is_unattended_breach(mtta_ticks: int) -> bool:
    """CHECK WHETHER AN INCIDENT HAS CROSSED THE REGULATORY BREACH WINDOW"""
    return mtta_ticks >= UNATTENDED_BREACH_TICK


def effective_passive_burn(user_happiness: float) -> float:
    """COMPUTE BASELINE BURN RATE, ACCELERATED BY CUSTOMER CHURN UNDER LOW HAPPINESS"""
    if user_happiness < CHURN_HAPPINESS_THRESHOLD:
        return PASSIVE_BASE_BURN * CHURN_BURN_MULTIPLIER
    return PASSIVE_BASE_BURN


def find_mitigation(action_id: str) -> Dict[str, Any] | None:
    """LOOK UP A MITIGATION RUNBOOK DEFINITION BY ITS CATALOG ID"""
    return next((m for m in MITIGATION_CATALOG if m["id"] == action_id), None)


def stress_gain_for_unacked_alarm(current_stress: float, severity: str) -> float:
    """COMPUTE PER-TICK STRESS INCREASE FROM AN UNACKNOWLEDGED ALARM, COMPOUNDING ON EXISTING STRESS"""
    severity_weight = 2.0 if severity == "P1_CRITICAL" else 1.0
    return STRESS_BASE_GAIN_PER_TICK * severity_weight * ((1.0 + current_stress / 100.0) ** STRESS_COMPOUND_EXPONENT)


def apply_queue_decoupling(dependency_statuses_by_id: Dict[str, str], decoupled_ids: Iterable[str]) -> List[str]:
    """REMOVE QUEUE-ISOLATED DEPENDENCY STATUSES FROM CASCADE HAZARD EVALUATION"""
    decoupled = set(decoupled_ids)
    return [status for dep_id, status in dependency_statuses_by_id.items() if dep_id not in decoupled]
