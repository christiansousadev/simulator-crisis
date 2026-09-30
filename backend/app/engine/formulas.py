"""pure mathematical formulas for the incidentzero simulation engine.

kept free of engine state so each function is independently testable.
"""

import math
from typing import Any, Dict, Iterable, List, Optional

# --- generic invariant-preserving clamps ---------------------------------
#
# every bounded quantity in the engine (percentages, ratios, probabilities) is clamped through
# one of these, rather than each call site repeating its own ad hoc max(...)/min(...) pair -- the
# single source of truth for "what range is this metric allowed to occupy".


def clamp(value: float, floor: float, ceiling: float) -> float:
    """CLAMP value TO [floor, ceiling], THE ONE PLACE EVERY BOUNDED METRIC'S RANGE IS ENFORCED.

    A non-finite value (NaN or +-Infinity) is treated as out of range and pinned to floor. Every
    caller here happens to already survive a non-finite input as an accidental side effect of
    argument order in max()/min() (a comparison against NaN is always False, so whichever operand
    is evaluated first "wins") -- that's fragile and would silently reverse if a call site were
    ever restructured, so this makes the guard explicit and intentional instead of incidental."""
    if not math.isfinite(value):
        return floor
    return max(floor, min(ceiling, value))


def clamp_percentage(value: float) -> float:
    """CLAMP A 0..100 METRIC (SLA%, HAPPINESS, REPUTATION) TO ITS VALID RANGE"""
    return clamp(value, 0.0, 100.0)


def clamp_tech_debt(value: float) -> int:
    """CLAMP THE TECHNICAL DEBT INDEX TO ITS VALID 0..100 INTEGER RANGE"""
    return int(clamp(value, 0, 100))


def clamp_ratio(value: float) -> float:
    """CLAMP A 0..1 RATIO (E.G. ERROR BUDGET REMAINING) TO ITS VALID RANGE"""
    return clamp(value, 0.0, 1.0)


def clamp_probability(value: float) -> float:
    """CLAMP A FAILURE PROBABILITY TO [0, MAX_FAILURE_PROBABILITY] -- THE ONLY PLACE THIS CAP IS
    APPLIED, AND ONLY AFTER EVERY MULTIPLIER (UPGRADES, TOPOLOGY, DIFFICULTY, REPUTATION,
    SPECIALIST COVERAGE, TEMPORARY HAZARD WINDOWS) HAS ALREADY BEEN FOLDED IN -- CAPPING ANY
    EARLIER WOULD LET LATER MULTIPLIERS SILENTLY PUSH THE EFFECTIVE PROBABILITY BACK OUT OF RANGE"""
    return clamp(value, 0.0, MAX_FAILURE_PROBABILITY)


def clamp_non_negative(value: float) -> float:
    """CLAMP A TIME/COUNT/COST QUANTITY THAT MUST NEVER GO NEGATIVE. A non-finite input (NaN or
    +-Infinity) is treated as 0.0 rather than being allowed to propagate into a budget, duration
    or count (see clamp's docstring for why this guard is explicit rather than incidental)."""
    if not math.isfinite(value):
        return 0.0
    return max(0.0, value)


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

# user-happiness drift mechanics -- distinct from SLA/availability: this is customer sentiment,
# driven by outage exposure and alert fatigue, not a direct function of the SLA calculation itself
HAPPINESS_MIN = 0.0
HAPPINESS_MAX = 100.0
HAPPINESS_FLOOR_WHILE_DEGRADED = 5.0
HAPPINESS_DEGRADED_DECAY_PER_TICK = 0.7
HAPPINESS_RECOVERY_PER_TICK = 0.2
HAPPINESS_RECOVERY_CEILING_TRIGGER = 98.0

SLA_BENCHMARK = 99.90
SLA_BREACH_THRESHOLD = 99.00

# error budget governance (google sre alignment). Kept explicitly distinct from SLA_BREACH_THRESHOLD:
# SLA_BENCHMARK/error-budget governs the *feature freeze* (an operational lockout of risky
# runbooks once the budget for this cycle is fully spent), while SLA_BREACH_THRESHOLD governs the
# *regulatory breach* status (an external compliance sanction) -- two different consequences on
# two different thresholds, never to be treated as the same condition.
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
    """COMPUTE THE RAW, PRE-MULTIPLIER FAILURE HAZARD P_FAILURE(I) FOR A HEALTHY SERVICE FROM
    TECH DEBT AND UPSTREAM DEPENDENCY HEALTH ALONE.

    Deliberately NOT capped to MAX_FAILURE_PROBABILITY here: the simulator folds in several more
    multipliers on top of this (upgrades, placed infrastructure, active scenario/difficulty,
    governance reputation, specialist coverage, per-service tech-debt exposure, temporary
    decision-caused hazard windows) before the effective probability is used. Capping at this
    stage would let any of those later multipliers silently push the final probability back out
    of range; call clamp_probability() exactly once, after all of them have been applied."""
    debt_multiplier = (1.0 + (tech_debt / TDI_HAZARD_DIVISOR)) ** TDI_HAZARD_EXPONENT
    dep_risk = dependency_shock_multiplier(dependency_statuses)
    return BASE_FAILURE_PROBABILITY * debt_multiplier * dep_risk


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


# --- ai auditor financial ceilings (formula 3b) --------------------------
#
# the AI auditor persona is an argumentative evaluator, not a financial authority: its raw
# "regulatory_fine_adjustment" is a *recommendation*, capped and sign-validated here -- the one
# place that actually decides how much of it is eligible to be applied (see
# backend/app/api/v1/audits.py's apply_interview_verdict, the sole caller).

AUDIT_FINE_CEILING_BY_SEVERITY = {
    "P1_CRITICAL": 6000.0,
    "P2_HIGH": 3000.0,
    "P3_MEDIUM": 1500.0,
    "P4_LOW": 750.0,
}
AUDIT_CREDIT_CEILING = 2000.0


def eligible_audit_adjustment(verdict: str, proposed_amount: float, severity: str) -> float:
    """CLAMP THE LLM-PROPOSED regulatory_fine_adjustment TO A BACKEND-OWNED CEILING, ENFORCING
    VERDICT/SIGN COHERENCE: A NON_COMPLIANT VERDICT MAY ONLY PRODUCE A FINE (>=0, CAPPED BY
    SEVERITY), A VALID/JUSTIFIED VERDICT MAY ONLY PRODUCE A CREDIT (<=0, CAPPED), AND PENDING (OR
    ANY OTHER VALUE) IS NEVER ELIGIBLE FOR ANY ADJUSTMENT.

    A non-finite proposed_amount (NaN/+-Infinity -- e.g. from a malformed LLM response) is treated
    as no adjustment at all (0.0) here, explicitly, rather than falling through to clamp()'s
    floor-pinning behavior: for the VALID/JUSTIFIED branch below, floor is -AUDIT_CREDIT_CEILING
    (the *maximum* credit), so pinning a non-finite input to floor would hand out the largest
    possible credit instead of failing safe."""
    if not math.isfinite(proposed_amount):
        return 0.0
    if verdict == "NON_COMPLIANT":
        ceiling = AUDIT_FINE_CEILING_BY_SEVERITY.get(severity, AUDIT_FINE_CEILING_BY_SEVERITY["P4_LOW"])
        return clamp(proposed_amount, 0.0, ceiling)
    if verdict in ("VALID", "JUSTIFIED"):
        return clamp(proposed_amount, -AUDIT_CREDIT_CEILING, 0.0)
    return 0.0


def effective_passive_burn(user_happiness: float) -> float:
    """COMPUTE BASELINE BURN RATE, ACCELERATED BY CUSTOMER CHURN UNDER LOW HAPPINESS"""
    if user_happiness < CHURN_HAPPINESS_THRESHOLD:
        return PASSIVE_BASE_BURN * CHURN_BURN_MULTIPLIER
    return PASSIVE_BASE_BURN


def happiness_after_outage_drift(current: float, any_service_unhealthy: bool, dampener: float) -> float:
    """DRIFT HAPPINESS TOWARD ITS DEGRADED FLOOR WHILE ANY SERVICE IS UNHEALTHY, OR BACK TOWARD
    ITS RECOVERY CEILING WHEN EVERYTHING IS HEALTHY AGAIN"""
    if any_service_unhealthy:
        return max(HAPPINESS_FLOOR_WHILE_DEGRADED, current - HAPPINESS_DEGRADED_DECAY_PER_TICK * dampener)
    if current < HAPPINESS_RECOVERY_CEILING_TRIGGER:
        return min(HAPPINESS_MAX, current + HAPPINESS_RECOVERY_PER_TICK)
    return current


def happiness_after_alert_fatigue(current: float, penalty: float, dampener: float) -> float:
    """APPLY AN ALERT-FATIGUE HAPPINESS PENALTY, FLOORED AT TRUE ZERO (UNLIKE THE SOFTER
    HAPPINESS_FLOOR_WHILE_DEGRADED FLOOR ABOVE -- SUSTAINED UNACKNOWLEDGED ALARMS CAN CRUSH
    MORALE ALL THE WAY DOWN, NOT JUST TO THE "SOMETHING'S DOWN" BASELINE)"""
    return max(HAPPINESS_MIN, current - penalty * dampener)


def error_budget_burn_ratio(sla_percentage: float) -> float:
    """FRACTION OF THE TOTAL MONTHLY ERROR BUDGET ALREADY CONSUMED BY CURRENT SLA PERFORMANCE.
    Distinct from `sla_percentage` (the availability metric itself) and from
    `error_budget_remaining_ratio` (the inverse, clamped view used to gate the feature freeze)."""
    unavailability_pct = 100.0 - sla_percentage
    return unavailability_pct / TOTAL_ERROR_BUDGET_PCT


def error_budget_remaining_ratio(burn_ratio: float) -> float:
    """REMAINING FRACTION OF THE ERROR BUDGET, CLAMPED TO A VALID 0..1 RATIO"""
    return clamp_ratio(1.0 - burn_ratio)


def error_budget_burn_rate(history: List[float]) -> float:
    """ROLLING RATE OF ERROR-BUDGET CONSUMPTION ACROSS A SHORT SAMPLE WINDOW, FOR TREND DISPLAY"""
    if len(history) < 2:
        return 0.0
    return (history[-1] - history[0]) / (len(history) - 1)


def find_mitigation(action_id: str) -> Dict[str, Any] | None:
    """LOOK UP A MITIGATION RUNBOOK DEFINITION BY ITS CATALOG ID"""
    return next((m for m in MITIGATION_CATALOG if m["id"] == action_id), None)


# --- cause <-> mitigation compatibility ---------------------------------
#
# each incident's root cause narrative (event_generator.ROOT_CAUSE_POOL) is tagged with one of
# these 4 categories (event_generator.cause_category_for_root_cause). This matrix says how well
# each of the 4 existing MITIGATION_CATALOG runbooks actually addresses each category -- a
# specialist tool (rollback/scale_replicas/circuit_breaker) only clears the full-resolution
# threshold on its own home category; emergency_patch is the deliberately universal-but-costly
# option (its price is paid in tech debt/cascade risk, not in immediate reliability).
MITIGATION_EFFECTIVENESS: Dict[str, Dict[str, float]] = {
    "rollback": {
        "deploy_regression": 1.00,
        "capacity_saturation": 0.55,
        "dependency_fault": 0.40,
        "acute_defect": 0.35,
    },
    "scale_replicas": {
        "deploy_regression": 0.40,
        "capacity_saturation": 1.00,
        "dependency_fault": 0.45,
        "acute_defect": 0.35,
    },
    "circuit_breaker": {
        "deploy_regression": 0.35,
        "capacity_saturation": 0.55,
        "dependency_fault": 1.00,
        "acute_defect": 0.40,
    },
    "emergency_patch": {
        "deploy_regression": 0.80,
        "capacity_saturation": 0.80,
        "dependency_fault": 0.80,
        "acute_defect": 1.00,
    },
}
DEFAULT_MITIGATION_EFFECTIVENESS = 0.50
MITIGATION_FULL_RESOLUTION_THRESHOLD = 0.70
# extra tech-debt points at maximal mismatch severity (a poorly-fit action bolts a workaround
# onto the wrong problem); scales linearly down to 0 at the resolution threshold
MISMATCH_TECH_DEBT_TAX_SCALE = 6.0


def mitigation_effectiveness(action_id: str, cause_category: str, resolve_speed_multiplier: float) -> float:
    """HOW WELL A GIVEN RUNBOOK ADDRESSES A GIVEN INCIDENT CAUSE CATEGORY, 0..1"""
    base = MITIGATION_EFFECTIVENESS.get(action_id, {}).get(cause_category, DEFAULT_MITIGATION_EFFECTIVENESS)
    # the catalog's resolve_speed_multiplier (previously unused anywhere in the engine) nudges
    # effectiveness by up to +-15%, rewarding faster-acting runbook classes without letting it
    # single-handedly flip a bad diagnosis into a full resolution
    speed_factor = 0.85 + 0.15 * (resolve_speed_multiplier / 2.0)
    return min(1.0, base * speed_factor)


def interpolate_partial_recovery(current_value: float, healthy_target: float, effectiveness: float) -> float:
    """BLEND A SICK METRIC TOWARD ITS HEALTHY BASELINE, PROPORTIONAL TO MITIGATION FIT QUALITY"""
    return current_value - (current_value - healthy_target) * effectiveness


def mismatch_tech_debt_tax(effectiveness: float) -> int:
    """EXTRA TECH-DEBT POINTS FOR APPLYING A POORLY-FIT RUNBOOK, PROPORTIONAL TO THE MISMATCH"""
    mismatch = max(0.0, MITIGATION_FULL_RESOLUTION_THRESHOLD - effectiveness)
    return round(mismatch * MISMATCH_TECH_DEBT_TAX_SCALE)


def dependents_count(service_id: str, all_services: Iterable[Dict[str, Any]]) -> int:
    """COUNT HOW MANY OTHER SERVICES DECLARE service_id AS A DEPENDENCY (FAN-IN / BLAST RADIUS)"""
    return sum(1 for s in all_services if service_id in s.get("dependencies", []))


def tech_debt_exposure_multiplier(dependents: int) -> float:
    """EXTRA CASCADE-HAZARD SENSITIVITY FOR A SERVICE MANY OTHERS DEPEND ON"""
    return 1.0 + 0.05 * dependents


# --- investigation reward (forward-looking only, never rewrites elapsed history) -------

TRIAGE_WRONG_ATTEMPT_STRESS = 3.0
TRIAGE_ACCURACY_DECAY_PER_WRONG_ATTEMPT = 0.22
TRIAGE_MIN_ACCURACY = 0.15
TRIAGE_COST_DISCOUNT_MAX = 0.50
TRIAGE_EFFECTIVENESS_BONUS_MAX = 0.15


def triage_accuracy(wrong_attempts: int) -> float:
    """CORRECT-GUESS REWARD QUALITY, ERODED BY EACH WRONG ATTEMPT MADE FIRST -- FLOORS ABOVE ZERO
    SO A LATE-BUT-EVENTUALLY-CORRECT GUESS STILL COUNTS AS INVESTIGATION, JUST A WEAKER ONE"""
    return max(TRIAGE_MIN_ACCURACY, 1.0 - TRIAGE_ACCURACY_DECAY_PER_WRONG_ATTEMPT * wrong_attempts)


# --- staff specialization and coverage quality ---------------------------

SPECIALIST_MISMATCH_BASE_QUALITY = 0.45
SPECIALIST_QUALITY_STRESS_EROSION = 0.70
SPECIALIST_QUALITY_FLOOR = 0.30


def competency_match(engineer: Optional[Dict[str, Any]], competency_map: Dict[str, str], service_id: str) -> bool:
    """WHETHER AN ASSIGNED ENGINEER'S CORE COMPETENCY MATCHES THE SERVICE THEY'RE COVERING"""
    return bool(engineer) and competency_map.get(service_id) == engineer["core_competency"]


def specialist_quality(engineer: Optional[Dict[str, Any]], competency_map: Dict[str, str], service_id: str) -> float:
    """0.0 (NO ON-DUTY COVERAGE) .. 1.0 (IDEAL: ON-DUTY, RIGHT SPECIALTY, LOW STRESS) COVERAGE SCORE"""
    if not engineer or engineer["on_call_status"] != "on_duty":
        return 0.0
    base = 1.0 if competency_match(engineer, competency_map, service_id) else SPECIALIST_MISMATCH_BASE_QUALITY
    stress_factor = max(SPECIALIST_QUALITY_FLOOR, 1.0 - engineer["stress_index"] / 100.0 * SPECIALIST_QUALITY_STRESS_EROSION)
    return round(base * stress_factor, 3)


def specialist_burn_multiplier(quality: float) -> float:
    """CONTINUOUS REPLACEMENT FOR THE OLD BINARY stress>75 => 2x MTTR-BURN PENALTY.
    NO COVERAGE AT ALL STAYS NEUTRAL (1.0, TODAY'S BASELINE); GOOD COVERAGE SPEEDS RECOVERY BURN
    DOWN TO 0.65x, A STRESSED/MISMATCHED ASSIGNMENT CAN STILL RUN HOTTER THAN BASELINE (UP TO 1.3x)"""
    if quality <= 0.0:
        return 1.0
    return max(0.65, 1.3 - 0.65 * quality)


def specialist_hazard_discount(quality: float) -> float:
    """MULTIPLIER ON FAILURE PROBABILITY: GOOD SPECIALIST COVERAGE CATCHES PROBLEMS EARLY"""
    return 1.0 - 0.35 * quality


def specialist_stress_gain_multiplier(matched: bool) -> float:
    """A COMPETENCY-MATCHED ENGINEER IS LESS RATTLED BY A FAMILIAR ALARM; A MISMATCHED ONE MORE SO"""
    return 0.7 if matched else 1.3


def stress_gain_for_unacked_alarm(current_stress: float, severity: str) -> float:
    """COMPUTE PER-TICK STRESS INCREASE FROM AN UNACKNOWLEDGED ALARM, COMPOUNDING ON EXISTING STRESS"""
    severity_weight = 2.0 if severity == "P1_CRITICAL" else 1.0
    return STRESS_BASE_GAIN_PER_TICK * severity_weight * ((1.0 + current_stress / 100.0) ** STRESS_COMPOUND_EXPONENT)


def apply_queue_decoupling(dependency_statuses_by_id: Dict[str, str], decoupled_ids: Iterable[str]) -> List[str]:
    """REMOVE QUEUE-ISOLATED DEPENDENCY STATUSES FROM CASCADE HAZARD EVALUATION"""
    decoupled = set(decoupled_ids)
    return [status for dep_id, status in dependency_statuses_by_id.items() if dep_id not in decoupled]
