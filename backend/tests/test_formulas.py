"""unit tests for the pure formula library, no engine state or database involved"""

from app.engine import formulas


def test_service_weight_critical_vs_standard():
    assert formulas.service_weight("critical") == formulas.CRITICAL_WEIGHT
    assert formulas.service_weight("standard") == formulas.STANDARD_WEIGHT


def test_unavailability_factor_healthy_is_zero():
    assert formulas.unavailability_factor("healthy", 30, 0.0001) == 0.0


def test_unavailability_factor_down_is_full():
    assert formulas.unavailability_factor("down", 9999, 1.0) == 1.0


def test_unavailability_factor_degraded_is_between_bounds():
    value = formulas.unavailability_factor("degraded", 600, 0.5)
    assert 0.0 < value <= 1.0


def test_instant_sla_percentage_all_healthy_is_100():
    services = [
        {"tier": "critical", "status": "healthy", "latency_ms": 30, "error_rate": 0.0001},
        {"tier": "standard", "status": "healthy", "latency_ms": 40, "error_rate": 0.0001},
    ]
    assert formulas.instant_sla_percentage(services) == 100.0


def test_instant_sla_percentage_single_critical_down_matches_worked_example():
    # matches the documented worked example: one down critical service among five weights to 72.73%
    services = [
        {"tier": "critical", "status": "down", "latency_ms": 0, "error_rate": 0},
        {"tier": "critical", "status": "healthy", "latency_ms": 30, "error_rate": 0.0001},
        {"tier": "critical", "status": "healthy", "latency_ms": 30, "error_rate": 0.0001},
        {"tier": "standard", "status": "healthy", "latency_ms": 30, "error_rate": 0.0001},
        {"tier": "standard", "status": "healthy", "latency_ms": 30, "error_rate": 0.0001},
    ]
    assert round(formulas.instant_sla_percentage(services), 2) == 72.73


def test_instant_sla_percentage_empty_topology_defaults_full():
    assert formulas.instant_sla_percentage([]) == 100.0


def test_dependency_shock_multiplier_no_dependencies_is_identity():
    assert formulas.dependency_shock_multiplier([]) == 1.0


def test_dependency_shock_multiplier_down_dependency_amplifies():
    multiplier = formulas.dependency_shock_multiplier(["down"])
    assert multiplier == 1.0 + formulas.DOWN_DEPENDENCY_SHOCK


def test_cascading_failure_probability_never_exceeds_cap():
    probability = formulas.cascading_failure_probability(100, ["down", "down", "down"])
    assert probability <= formulas.MAX_FAILURE_PROBABILITY


def test_cascading_failure_probability_increases_with_tech_debt():
    low_debt = formulas.cascading_failure_probability(0, [])
    high_debt = formulas.cascading_failure_probability(80, [])
    assert high_debt > low_debt


def test_incident_surcharge_grows_with_elapsed_ticks():
    early = formulas.incident_surcharge("P1_CRITICAL", 0)
    late = formulas.incident_surcharge("P1_CRITICAL", 20)
    assert late > early


def test_incident_surcharge_unknown_severity_falls_back_to_p4():
    assert formulas.incident_surcharge("NOT_A_REAL_SEVERITY", 0) == formulas.SEVERITY_BASE_SURCHARGE["P4_LOW"]


def test_alert_fatigue_penalty_only_fires_in_window():
    assert formulas.alert_fatigue_penalty(0) == 0.0
    assert formulas.alert_fatigue_penalty(formulas.ALERT_FATIGUE_START_TICK) == formulas.ALERT_FATIGUE_HAPPINESS_PENALTY
    assert formulas.alert_fatigue_penalty(formulas.ALERT_FATIGUE_END_TICK + 1) == 0.0


def test_is_unattended_breach_threshold():
    assert formulas.is_unattended_breach(formulas.UNATTENDED_BREACH_TICK - 1) is False
    assert formulas.is_unattended_breach(formulas.UNATTENDED_BREACH_TICK) is True


def test_effective_passive_burn_accelerates_under_low_happiness():
    normal = formulas.effective_passive_burn(90.0)
    churning = formulas.effective_passive_burn(10.0)
    assert churning == normal * formulas.CHURN_BURN_MULTIPLIER


def test_find_mitigation_known_and_unknown_ids():
    assert formulas.find_mitigation("rollback") is not None
    assert formulas.find_mitigation("does-not-exist") is None


def test_stress_gain_compounds_with_existing_stress():
    low = formulas.stress_gain_for_unacked_alarm(0, "P2_HIGH")
    high = formulas.stress_gain_for_unacked_alarm(90, "P2_HIGH")
    assert high > low


def test_stress_gain_p1_weighs_more_than_p2():
    p1 = formulas.stress_gain_for_unacked_alarm(50, "P1_CRITICAL")
    p2 = formulas.stress_gain_for_unacked_alarm(50, "P2_HIGH")
    assert p1 > p2


def test_apply_queue_decoupling_removes_only_named_producer():
    statuses = {"srv-a": "down", "srv-b": "healthy"}
    result = formulas.apply_queue_decoupling(statuses, decoupled_ids=["srv-a"])
    assert result == ["healthy"]


def test_apply_queue_decoupling_no_decoupling_returns_all_statuses():
    statuses = {"srv-a": "down", "srv-b": "degraded"}
    result = formulas.apply_queue_decoupling(statuses, decoupled_ids=[])
    assert set(result) == {"down", "degraded"}
