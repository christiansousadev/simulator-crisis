"""coverage for the evolution pass: circadian load, traffic throttling, war room / status page and
engineer progression"""

from app.engine import formulas, war_room
from tests.test_engine_features import _fresh_engine


def _first_incident(engine, service_id="srv-auth", root_cause=None):
    srv = next(s for s in engine.services if s["id"] == service_id)
    return engine._trigger_service_failure(srv, root_cause=root_cause)


# --- circadian load --------------------------------------------------------


def test_circadian_factor_peaks_at_lunch_and_evening_and_drops_overnight():
    # tick 0 reads 08:00 (CLOCK_START_HOUR), so hour h sits at tick (h - 8) mod 24
    at = lambda hour: formulas.circadian_traffic_factor((hour - formulas.CLOCK_START_HOUR) % 24)  # noqa: E731
    assert at(12) == formulas.PEAK_TRAFFIC_FACTOR
    assert at(20) == formulas.PEAK_TRAFFIC_FACTOR
    assert at(3) == formulas.NIGHT_TRAFFIC_FACTOR
    assert at(8) == 1.0 and at(17) == 1.0


def test_circadian_multipliers_are_monotonic_in_traffic():
    assert formulas.circadian_hazard_multiplier(1.5) > formulas.circadian_hazard_multiplier(1.0) > formulas.circadian_hazard_multiplier(0.4)
    assert formulas.circadian_surcharge_multiplier(1.5) > 1.0 > formulas.circadian_surcharge_multiplier(0.4)


def test_peak_traffic_amplifies_sla_impact_and_night_softens_it():
    services = [{"tier": "critical", "status": "degraded", "latency_ms": 600, "error_rate": 0.2}]
    base = formulas.instant_sla_percentage(services)
    assert formulas.instant_sla_percentage(services, traffic_factor=1.5) < base < formulas.instant_sla_percentage(
        services, traffic_factor=0.4
    )
    down = [{"tier": "critical", "status": "down", "latency_ms": 0, "error_rate": 1.0}]
    assert formulas.instant_sla_percentage(down, traffic_factor=1.5) == 0.0  # capped at total outage


def test_incident_surcharge_is_higher_at_peak_than_overnight():
    peak_tick = 12 - formulas.CLOCK_START_HOUR + 24
    night_tick = 3 - formulas.CLOCK_START_HOUR + 24
    costs = []
    for tick in (peak_tick, night_tick):
        engine = _fresh_engine()
        engine.current_tick = tick
        engine.traffic_factor = formulas.circadian_traffic_factor(tick)
        before = engine.budget
        _first_incident(engine)
        engine._apply_budget_burn()
        costs.append(before - engine.budget)
    assert costs[0] > costs[1]


# --- traffic throttling ----------------------------------------------------


def test_throttle_sheds_load_without_resolving_and_respects_cooldown():
    engine = _fresh_engine()
    engine.budget = 100000.0
    _first_incident(engine)
    srv = next(s for s in engine.services if s["id"] == "srv-auth")
    latency_before, errors_before, budget_before = srv["latency_ms"], srv["error_rate"], engine.budget

    result = engine.throttle_service("srv-auth")
    assert result["success"] is True
    assert srv["latency_ms"] < latency_before and srv["error_rate"] < errors_before
    assert srv["status"] != "healthy"  # throttling is not a fix
    assert engine.budget == budget_before - formulas.THROTTLE_COST
    assert any(e["event_type"] == "TRAFFIC_THROTTLED" for e in engine.audit_logs)

    again = engine.throttle_service("srv-auth")
    assert again["success"] is False and "cooldown" in again["error"]
    engine.current_tick += formulas.THROTTLE_COOLDOWN_TICKS
    assert engine.throttle_service("srv-auth")["success"] is True


def test_throttle_requires_an_open_incident_and_funds():
    engine = _fresh_engine()
    assert engine.throttle_service("srv-auth")["success"] is False
    assert engine.throttle_service("nope")["success"] is False
    _first_incident(engine)
    engine.budget = formulas.THROTTLE_COST - 1
    assert "Insufficient" in engine.throttle_service("srv-auth")["error"]


def test_throttle_window_halves_the_incident_surcharge():
    engine = _fresh_engine()
    engine.budget = 100000.0
    engine.current_tick = 4  # 12:00 -> same traffic factor for both measurements
    engine.traffic_factor = formulas.circadian_traffic_factor(engine.current_tick)
    inc = _first_incident(engine)
    inc["mttr_seconds"] = 5

    before = engine.budget
    engine._apply_budget_burn()
    unthrottled = before - engine.budget - formulas.effective_passive_burn(engine.user_happiness)

    inc["accrued_surcharge"] = 0.0
    inc["throttled_until_tick"] = engine.current_tick + 3
    before = engine.budget
    engine._apply_budget_burn()
    throttled = before - engine.budget - formulas.effective_passive_burn(engine.user_happiness)
    assert abs(throttled - unthrottled * formulas.THROTTLE_SURCHARGE_FACTOR) < 0.01


# --- war room / status page --------------------------------------------------


def test_stakeholder_messages_arrive_on_schedule_and_never_duplicate():
    engine = _fresh_engine()
    inc = _first_incident(engine)
    inc["severity"] = "P1_CRITICAL"
    for _ in range(12):
        engine.current_tick += 1
        engine._progress_stakeholders()
    kinds = [m["kind"] for m in engine.stakeholder_feed if m["incident_id"] == inc["id"]]
    assert kinds == ["ceo_inquiry", "support_surge", "legal_sla", "board_pressure"]


def test_low_severity_incidents_do_not_page_stakeholders():
    engine = _fresh_engine()
    inc = _first_incident(engine)
    inc["severity"] = "P4_LOW"
    engine.current_tick += 20
    engine._progress_stakeholders()
    assert engine.stakeholder_feed == []


def test_truthful_status_update_soothes_and_answers_stakeholders():
    engine = _fresh_engine()
    inc = _first_incident(engine)
    inc["severity"] = "P1_CRITICAL"
    engine.current_tick += 2
    engine._progress_stakeholders()
    engine.user_happiness = 70.0
    result = engine.post_status_update(inc["id"], "investigating")
    assert result["success"] and result["truthful"]
    assert engine.user_happiness == 70.0 + war_room.STATUS_UPDATE_HAPPINESS_BONUS
    assert all(m["answered"] for m in engine.stakeholder_feed if m["incident_id"] == inc["id"])
    # the same (or an earlier) stage cannot be posted twice
    assert engine.post_status_update(inc["id"], "investigating")["success"] is False


def test_misleading_status_update_costs_reputation_and_flags_the_ledger():
    engine = _fresh_engine()
    inc = _first_incident(engine)
    reputation = engine.reputation
    result = engine.post_status_update(inc["id"], "identified")  # root cause not confirmed yet
    assert result["success"] and result["truthful"] is False
    assert engine.reputation == reputation - war_room.STATUS_LIE_REPUTATION_PENALTY
    event = next(e for e in engine.audit_logs if e["event_type"] == "STATUS_PAGE_UPDATED")
    assert event["compliance_flag"] is False


def test_silence_accelerates_happiness_decay_and_updates_soften_it():
    open_incident = {"id": "i", "severity": "P1_CRITICAL", "created_tick": 0, "status": "active"}
    assert war_room.communication_decay_multiplier([open_incident], 1) == 1.0  # within the grace window
    assert war_room.communication_decay_multiplier([open_incident], 10) == war_room.SILENCE_DECAY_MULTIPLIER
    open_incident["status_page_rank"] = 1
    assert war_room.communication_decay_multiplier([open_incident], 10) == war_room.COMMUNICATED_DECAY_MULTIPLIER
    assert war_room.communication_decay_multiplier([], 10) == 1.0


def test_status_update_rejects_unknown_stage_and_resolved_incidents():
    engine = _fresh_engine()
    inc = _first_incident(engine)
    assert engine.post_status_update(inc["id"], "bogus")["success"] is False
    assert engine.post_status_update("inc-missing", "investigating")["success"] is False


# --- engineer progression ----------------------------------------------------


def test_engineer_levels_follow_thresholds():
    assert [formulas.engineer_level(x) for x in (0, 1, 2, 5, 9, 14, 99)] == [1, 1, 2, 3, 4, 5, 5]
    assert formulas.xp_to_next_level(0) == 2 and formulas.xp_to_next_level(14) is None
    assert formulas.level_stress_multiplier(14) < formulas.level_stress_multiplier(0) == 1.0


def test_specialist_resolution_grants_xp_and_levels_up_with_an_audit_event():
    engine = _fresh_engine()
    engine.budget = 500000.0
    hired = engine.hire_engineer("auth", "srv-auth")["engineer"]
    inc = _first_incident(engine, "srv-auth", root_cause="Memory leak in connection pooling thread")
    inc["triage_solved"] = True
    inc["triage_accuracy"] = 1.0

    assert engine.apply_mitigation("rollback", "srv-auth")["success"] is True
    assert hired["xp"] == formulas.XP_PER_SPECIALIST_RESOLUTION + formulas.XP_CLEAN_TRIAGE_BONUS
    assert hired["level"] == 2
    assert any(e["event_type"] == "ENGINEER_LEVELED_UP" for e in engine.audit_logs)


def test_mismatched_engineer_earns_no_xp():
    engine = _fresh_engine()
    engine.budget = 500000.0
    hired = engine.hire_engineer("payments", "srv-auth")["engineer"]
    _first_incident(engine, "srv-auth", root_cause="Memory leak in connection pooling thread")
    engine.apply_mitigation("emergency_patch", "srv-auth")
    assert hired["xp"] == 0


def test_engineer_level_improves_coverage_quality():
    base = {"on_call_status": "on_duty", "core_competency": "auth", "stress_index": 0, "xp": 0}
    seasoned = {**base, "xp": 14}
    cmap = {"srv-auth": "auth"}
    assert formulas.specialist_quality(seasoned, cmap, "srv-auth") >= formulas.specialist_quality(base, cmap, "srv-auth")
    mismatched = {**base, "core_competency": "payments"}
    assert formulas.specialist_quality({**mismatched, "xp": 14}, cmap, "srv-auth") > formulas.specialist_quality(mismatched, cmap, "srv-auth")


def test_engineer_xp_survives_a_snapshot_round_trip():
    engine = _fresh_engine()
    engine.budget = 500000.0
    hired = engine.hire_engineer("auth", "srv-auth")["engineer"]
    hired["xp"] = 5
    engine.current_tick = 3  # restore only resumes a run that has actually started
    engine._persist_session_scalars()
    engine._persist_engineer(hired)
    restored = _restore_engine()
    assert next(e for e in restored.engineers if e["id"] == hired["id"])["xp"] == 5


def _restore_engine():
    from app.engine.simulator import SimulationEngine
    from tests.test_engine_features import SESSION_ID

    return SimulationEngine(session_id=SESSION_ID)


def test_new_command_endpoints_validate_their_input():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as client:
        client.post("/api/session/reset")
        client.post("/api/session/pause")
        assert client.post("/api/services/srv-auth/throttle").status_code == 400
        assert client.post("/api/incidents/inc-nope/status-update", json={"stage": "bogus"}).status_code == 422
        assert client.post("/api/incidents/inc-nope/status-update", json={"stage": "investigating"}).status_code == 400
        state = client.get("/api/session/state").json()
        assert "traffic_factor" in state and "stakeholder_feed" in state


def test_downstream_services_follow_the_dependency_graph_nearest_first():
    from app.api.v1.audits import _build_causal_chain, _downstream_services

    engine = _fresh_engine()
    assert _downstream_services("srv-auth", engine.services)[:2] == ["srv-payment", "srv-api-gw"]
    assert "srv-auth" not in _downstream_services("srv-auth", engine.services)
    assert _downstream_services("srv-notify", engine.services) == []

    dossier = {
        "service_id": "srv-auth", "root_cause": "OOM killer invoked by kernel", "root_cause_confirmed": True,
        "mitigations": [{"action": "Rollback Canary", "fully_resolved": False}],
    }
    chain = _build_causal_chain(dossier, engine.services)
    assert chain["cause_category"] == "capacity_saturation" and chain["best_runbook_id"] == "scale_replicas"
    unconfirmed = _build_causal_chain({**dossier, "root_cause_confirmed": False}, engine.services)
    assert unconfirmed["cause_category"] is None and unconfirmed["best_runbook_id"] is None
