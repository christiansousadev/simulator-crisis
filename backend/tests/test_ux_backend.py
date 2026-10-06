"""coverage for the ux-overhaul backend work: state push after commands, terminal-tick achievements,
runbook guards, the third-party outage rework, the tutorial incident, health version and the
`failed` objective flag. same isolated-db bootstrapping as test_engine_features.py."""

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

_TEST_DB = os.path.join(tempfile.gettempdir(), "incidentzero_pytest_engine.db")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB}")

from alembic.config import Config  # noqa: E402

from alembic import command  # noqa: E402

command.upgrade(Config(str(Path(__file__).resolve().parents[1] / "alembic.ini")), "head")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.core.state_push import should_push_after  # noqa: E402
from app.core.version import get_app_version  # noqa: E402
from app.engine.scenarios.black_friday_rush import BlackFridayRushScenario  # noqa: E402
from app.engine.scenarios.chaos_engineering_drill import ChaosEngineeringDrillScenario  # noqa: E402
from app.engine.scenarios.ddos_global import DdosGlobalScenario  # noqa: E402
from app.engine.scenarios.deployment_rollback import DeploymentRollbackScenario  # noqa: E402
from app.engine.scenarios.ransomware_infiltration import RansomwareInfiltrationScenario  # noqa: E402
from app.engine.scenarios.third_party_outage import ThirdPartyOutageScenario  # noqa: E402
from app.engine.simulator import SimulationEngine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.achievement import Achievement  # noqa: E402
from app.models.career import CareerRecord  # noqa: E402
from app.models.incident import Incident  # noqa: E402
from app.models.session import GameSession  # noqa: E402

SESSION_ID = "incidentzero-alpha"


def _fresh_engine(player_id: str = "local-player", **kwargs) -> SimulationEngine:
    db = SessionLocal()
    try:
        existing = db.get(GameSession, SESSION_ID)
        if existing:
            db.delete(existing)
            db.commit()
    finally:
        db.close()
    return SimulationEngine(session_id=SESSION_ID, player_id=player_id, **kwargs)


def _service(engine: SimulationEngine, service_id: str) -> dict:
    return next(s for s in engine.services if s["id"] == service_id)


def _run_ticks(engine: SimulationEngine, max_ticks: int = 100) -> None:
    """DRIVE THE REAL TICK PIPELINE SYNCHRONOUSLY UNTIL THE RUN ENDS, WITH NO RANDOM FAILURES"""
    engine.is_running = True
    with patch("random.random", return_value=0.99):
        for _ in range(max_ticks):
            if not engine.is_running:
                break
            engine.current_tick += 1
            engine._update_simulation_tick()


class _FixedRng:
    def __init__(self, value: float):
        self.value = value

    def random(self) -> float:
        return self.value


# --- 1. state push after every command --------------------------------------


def test_should_push_after_only_for_successful_mutating_api_commands():
    assert should_push_after("POST", "/api/incidents/inc-1/acknowledge", 200)
    assert should_push_after("DELETE", "/api/infrastructure/nodes/n1", 200)
    assert should_push_after("POST", "/api/audits/postmortem/inc-1/interview/apply-verdict", 200)
    assert not should_push_after("POST", "/api/mitigations/execute", 400)
    assert not should_push_after("POST", "/api/incidents/inc-1/triage", 404)
    assert not should_push_after("GET", "/api/session/state", 200)
    assert not should_push_after("POST", "/api/audits/postmortem/inc-1/interview", 200)
    assert not should_push_after("POST", "/somewhere/else", 200)


def _frames_until(ws, predicate, limit: int = 6):
    for _ in range(limit):
        frame = ws.receive_json()
        if frame.get("type") == "TICK_BROADCAST" and predicate(frame):
            return frame
    raise AssertionError("expected state frame never arrived")


def test_commands_push_fresh_state_over_websocket_while_paused():
    with TestClient(app) as client:
        client.post("/api/session/reset")
        with client.websocket_connect("/ws/telemetry") as ws:
            ws.receive_json()  # initial snapshot

            client.post("/api/session/pause")
            paused = _frames_until(ws, lambda f: f["is_running"] is False)
            tick_when_paused = paused["tick"]

            resp = client.post("/api/tutorial/incident")
            assert resp.status_code == 200
            incident_id = resp.json()["incident"]["id"]
            raised = _frames_until(ws, lambda f: any(i["id"] == incident_id for i in f["active_incidents"]))
            assert raised["is_running"] is False and raised["tick"] == tick_when_paused

            assert client.post(f"/api/incidents/{incident_id}/acknowledge").status_code == 200
            acked = _frames_until(
                ws, lambda f: any(i["id"] == incident_id and i["status"] == "acknowledged" for i in f["active_incidents"])
            )
            assert acked["tick"] == tick_when_paused

            assert client.post("/api/staff/hire", json={"core_competency": "auth"}).status_code == 200
            _frames_until(ws, lambda f: len(f["engineers"]) == 1)


def test_failed_command_does_not_broadcast():
    with TestClient(app) as client:
        client.post("/api/session/reset")
        client.post("/api/session/pause")
        engine = app.state.engine
        with patch.object(type(engine), "broadcast_state") as spy:
            assert client.post("/api/incidents/nope/acknowledge").status_code == 404
            assert client.post("/api/mitigations/execute", json={"action_id": "x", "service_id": "y"}).status_code == 400
            assert client.get("/api/session/state").status_code == 200
            spy.assert_not_called()


def test_push_with_zero_clients_is_a_cheap_noop():
    with TestClient(app) as client:
        client.post("/api/session/reset")
        engine = app.state.engine
        assert not engine.active_websockets
        with patch.object(type(engine), "get_state_payload") as payload:
            assert client.post("/api/session/pause").status_code == 200
            payload.assert_not_called()


# --- 2. achievements on the terminal tick -----------------------------------


def _unlocked_in_db(player_id: str) -> set:
    db = SessionLocal()
    try:
        return {a.achievement_key for a in db.query(Achievement).filter(Achievement.player_id == player_id)}
    finally:
        db.close()


def test_sandbox_victory_unlocks_soc2_and_counts_prestige_in_career_record():
    engine = _fresh_engine(player_id="t-ach-sandbox")
    engine.current_tick = 719
    engine.is_running = True
    with patch("random.random", return_value=0.99):
        engine.current_tick += 1
        engine._update_simulation_tick()
    assert engine.status == "victory" and engine.is_running is False
    assert "soc2_type_ii_certified" in engine.achievements_unlocked
    assert engine.prestige_points >= 150
    assert "soc2_type_ii_certified" in _unlocked_in_db("t-ach-sandbox")
    db = SessionLocal()
    try:
        record = (
            db.query(CareerRecord).filter(CareerRecord.player_id == "t-ach-sandbox").order_by(CareerRecord.recorded_at.desc()).first()
        )
        assert record.prestige_earned >= 150
    finally:
        db.close()


def test_ransomware_scenario_victory_unlocks_ransomware_repelled():
    engine = _fresh_engine(player_id="t-ach-ransom")
    engine.active_scenario = RansomwareInfiltrationScenario(engine)
    engine.active_scenario.elapsed_ticks = engine.active_scenario.duration_ticks - 1
    engine.current_tick = 59
    _run_ticks(engine, 1)
    assert engine.active_scenario.completed and engine.active_scenario.outcome["compliant"] is True
    assert "ransomware_repelled" in engine.achievements_unlocked
    assert "ransomware_repelled" in _unlocked_in_db("t-ach-ransom")


def test_chaos_drill_compliant_run_unlocks_chaos_survivor():
    engine = _fresh_engine(player_id="t-ach-chaos")
    engine.active_scenario = ChaosEngineeringDrillScenario(engine)
    engine.active_scenario.elapsed_ticks = engine.active_scenario.duration_ticks - 1
    engine.current_tick = 39
    _run_ticks(engine, 1)
    assert engine.active_scenario.outcome["compliant"] is True
    assert "chaos_survivor" in engine.achievements_unlocked
    assert "chaos_survivor" in _unlocked_in_db("t-ach-chaos")


# --- 3. runbook needs something to fix --------------------------------------


def test_runbook_requires_an_open_incident_on_a_healthy_service():
    engine = _fresh_engine()
    budget, debt = engine.budget, engine.tech_debt
    result = engine.apply_mitigation("rollback", "srv-auth")
    assert result["success"] is False
    assert "No open incident" in result["error"]
    assert (engine.budget, engine.tech_debt) == (budget, debt)
    assert "rollback" not in engine.mitigation_last_fired_tick
    assert _service(engine, "srv-auth")["status"] == "healthy"

    engine._trigger_service_failure(_service(engine, "srv-auth"))
    assert engine.apply_mitigation("rollback", "srv-auth")["success"] is True


def test_runbook_still_works_on_scenario_degraded_services_without_an_incident():
    # deployment rollback pre-degrades auth/search with no incident row
    engine = _fresh_engine()
    engine.active_scenario = DeploymentRollbackScenario(engine)
    engine.active_scenario.on_start()
    assert _service(engine, "srv-auth")["status"] == "degraded" and not engine.incidents
    assert engine.apply_mitigation("rollback", "srv-auth")["success"] is True
    assert _service(engine, "srv-auth")["status"] == "healthy"

    # black friday latency creep leaves status "healthy" but visibly slow
    engine = _fresh_engine()
    engine.active_scenario = BlackFridayRushScenario(engine)
    _service(engine, "srv-search")["latency_ms"] = 900
    assert engine.apply_mitigation("scale_replicas", "srv-search")["success"] is True
    assert _service(engine, "srv-search")["latency_ms"] < 100


def test_ransomware_circuit_breaker_quarantine_works_without_an_incident():
    engine = _fresh_engine()
    engine.active_scenario = RansomwareInfiltrationScenario(engine)
    assert not engine.incidents
    result = engine.apply_mitigation("circuit_breaker", "srv-notify")
    assert result["success"] is True
    assert "srv-notify" in engine.active_scenario.quarantined_service_ids
    # a service the attacker has not reached is still refused
    assert engine.apply_mitigation("rollback", "srv-search")["success"] is False


# --- 4. third-party outage --------------------------------------------------


def _third_party_engine(player_id: str = "t-3p") -> SimulationEngine:
    engine = _fresh_engine(player_id=player_id)
    scenario = ThirdPartyOutageScenario(engine)
    scenario._rng = _FixedRng(0.99)
    engine.active_scenario = scenario
    scenario.on_start()
    return engine


def test_third_party_runbooks_on_provider_services_are_rejected_until_recovery():
    engine = _third_party_engine()
    budget = engine.budget
    for service_id in ("srv-payment", "srv-notify"):
        result = engine.apply_mitigation("circuit_breaker", service_id)
        assert result["success"] is False
        assert "External provider outage" in result["error"]
        assert _service(engine, service_id)["status"] == "down"
    assert engine.budget == budget

    # nothing can leave a provider healed either: the scenario re-pins it every tick
    _service(engine, "srv-payment")["status"] = "healthy"
    engine.current_tick += 1
    engine.is_running = True
    with patch("random.random", return_value=0.99):
        engine._update_simulation_tick()
    assert _service(engine, "srv-payment")["status"] == "down"


def test_third_party_scenario_can_be_won_when_provider_recovers():
    engine = _third_party_engine()
    engine.active_scenario._rng = _FixedRng(0.0)  # recover as soon as the lottery opens (tick 15)
    _run_ticks(engine)
    scenario = engine.active_scenario
    assert scenario.completed and scenario.outcome["compliant"] is True
    assert scenario.outcome["provider_recovered"] is True
    assert scenario.outcome["recovery_tick"] == ThirdPartyOutageScenario.RECOVERY_START_TICK
    assert engine.status == "victory"
    # the rolling sla sits far below 99% yet the run is won: sla is not part of the victory rule
    assert engine.sla_percentage < 99.0
    objectives = {o["id"]: o["done"] for o in scenario.objectives()}
    assert objectives == {"downstream_latency": True, "team_morale": True, "survive_outage": True}


def test_third_party_provider_is_guaranteed_back_by_deadline_and_late_recovery_loses_on_morale():
    engine = _third_party_engine()
    _run_ticks(engine)  # the lottery never fires
    scenario = engine.active_scenario
    assert scenario.outcome["recovery_tick"] == ThirdPartyOutageScenario.RECOVERY_DEADLINE_TICK
    assert scenario.outcome["morale_ok"] is False
    assert scenario.outcome["compliant"] is False


def test_third_party_event_flags_outage_is_non_compliant_and_recovery_is_compliant():
    engine = _third_party_engine()
    engine.active_scenario._rng = _FixedRng(0.0)
    _run_ticks(engine)
    flags = {e["event_type"]: e["compliance_flag"] for e in engine.audit_logs}
    assert flags["THIRD_PARTY_PROVIDER_OUTAGE"] is False
    assert flags["THIRD_PARTY_PROVIDER_RECOVERED"] is True


def test_third_party_snapshot_roundtrip_keeps_latency_average():
    engine = _third_party_engine()
    scenario = engine.active_scenario
    scenario._latency_sum, scenario._latency_samples = 300.0, 3
    clone = ThirdPartyOutageScenario(engine)
    clone.restore_extra(scenario.snapshot_extra())
    assert clone._downstream_avg_latency() == pytest.approx(100.0)


# --- 5. tutorial incident ---------------------------------------------------


def test_tutorial_incident_is_deterministic_rollback_fixable_and_hides_the_answer():
    engine = _fresh_engine()
    result = engine.spawn_tutorial_incident()
    assert result["success"] is True
    public = result["incident"]
    assert public["service_id"] == "srv-notify" and public["severity"] == "P2_HIGH"
    assert public["root_cause"] is None
    assert "log_lines" not in public and "root_cause_line_id" not in public

    inc = engine.incidents[0]
    assert inc["root_cause"] == "Memory leak in connection pooling thread"
    assert inc["tech_debt_at_creation"] == engine.tech_debt
    assert any(line["id"] == inc["root_cause_line_id"] for line in inc["log_lines"])
    assert any(e["event_type"] == "INCIDENT_RAISED" for e in engine.audit_logs)
    db = SessionLocal()
    try:
        assert db.get(Incident, inc["id"]) is not None
    finally:
        db.close()

    # a second one is refused while the first is open
    again = engine.spawn_tutorial_incident()
    assert again["success"] is False and "already open" in again["error"]

    assert engine.apply_mitigation("rollback", "srv-notify")["success"] is True
    assert not engine.incidents and _service(engine, "srv-notify")["status"] == "healthy"


def test_tutorial_incident_refused_when_run_is_terminal():
    engine = _fresh_engine()
    engine.status = "victory"
    result = engine.spawn_tutorial_incident()
    assert result["success"] is False and "ended" in result["error"]


def test_tutorial_endpoint_works_paused_and_conflicts_when_incident_open():
    with TestClient(app) as client:
        client.post("/api/session/reset")
        client.post("/api/session/pause")
        first = client.post("/api/tutorial/incident")
        assert first.status_code == 200
        body = first.json()
        assert body["success"] is True and body["incident"]["service_id"] == "srv-notify"
        assert "log_lines" not in body["incident"]
        second = client.post("/api/tutorial/incident")
        assert second.status_code == 409
        assert "already open" in second.json()["detail"]
        # the log endpoint is what serves the stream, with the root-cause line inside it
        logs = client.get(f"/api/incidents/{body['incident']['id']}/logs").json()["lines"]
        assert logs


# --- 6. health version ------------------------------------------------------


def test_health_reports_version_from_pyproject():
    with TestClient(app) as client:
        body = client.get("/api/health").json()
    assert body["version"] == get_app_version() == "1.0.0"
    for key in ("status", "engine_active", "current_tick", "active_clients"):
        assert key in body


# --- 7. objective "failed" flag --------------------------------------------


def test_black_friday_maintain_sla_is_done_at_tick_zero_but_fails_once_violated():
    engine = _fresh_engine()
    scenario = BlackFridayRushScenario(engine)
    sla = next(o for o in scenario.objectives() if o["id"] == "maintain_sla")
    assert sla["done"] is True and sla["failed"] is False

    engine.sla_percentage = 90.0
    scenario.elapsed_ticks = BlackFridayRushScenario.SLA_GRACE_TICKS + 1
    scenario.on_tick()
    engine.sla_percentage = 100.0  # recovered, but the violation is remembered
    sla = next(o for o in scenario.objectives() if o["id"] == "maintain_sla")
    assert sla["done"] is True and sla["failed"] is True

    clone = BlackFridayRushScenario(engine)
    clone.restore_extra(scenario.snapshot_extra())
    assert next(o for o in clone.objectives() if o["id"] == "maintain_sla")["failed"] is True


def test_black_friday_early_sla_noise_inside_grace_window_is_not_a_failure():
    engine = _fresh_engine()
    scenario = BlackFridayRushScenario(engine)
    engine.sla_percentage = 90.0
    scenario.elapsed_ticks = 3
    scenario.on_tick()
    assert next(o for o in scenario.objectives() if o["id"] == "maintain_sla")["failed"] is False


def test_chaos_drill_zero_breach_objective_fails_after_a_breach_flag():
    engine = _fresh_engine()
    scenario = ChaosEngineeringDrillScenario(engine)
    obj = scenario.objectives()[0]
    assert obj["done"] is True and obj["failed"] is False
    engine._log_audit_event("UNATTENDED_ALERT_VIOLATION", "AUDIT_SYSTEM", {}, compliance_flag=False)
    obj = scenario.objectives()[0]
    assert obj["done"] is False and obj["failed"] is True


def test_deployment_rollback_budget_objective_fails_once_error_budget_dips():
    engine = _fresh_engine()
    scenario = DeploymentRollbackScenario(engine)
    protect = lambda: next(o for o in scenario.objectives() if o["id"] == "protect_budget")  # noqa: E731
    assert protect()["failed"] is False
    engine.error_budget_remaining_ratio = 0.1
    scenario.on_tick()
    engine.error_budget_remaining_ratio = 1.0
    assert protect()["failed"] is True
    clone = DeploymentRollbackScenario(engine)
    clone.restore_extra(scenario.snapshot_extra())
    assert clone._error_budget_breached is True


def test_ddos_objectives_carry_failed_flags_and_persist_them():
    engine = _fresh_engine()
    scenario = DdosGlobalScenario(engine)
    assert all(o["failed"] is False for o in scenario.objectives() if o["id"] != "survive_attack")
    _service(engine, "srv-api-gw")["status"] = "down"
    scenario.elapsed_ticks = 3  # one down tick out of three: 66% uptime, under the 80% line
    scenario.on_tick()
    gw = next(o for o in scenario.objectives() if o["id"] == "gw_uptime")
    assert gw["failed"] is True
    clone = DdosGlobalScenario(engine)
    clone.restore_extra(scenario.snapshot_extra())
    assert clone._gw_uptime_violated is True


def test_failed_flag_is_served_by_rest_and_telemetry():
    with TestClient(app) as client:
        client.post("/api/session/reset", json={"scenario_id": "black_friday_rush"})
        client.post("/api/session/pause")
        active = client.get("/api/scenarios/active").json()
        assert all("failed" in o for o in active["objectives"] if o["id"] == "maintain_sla")
        telemetry = client.get("/api/session/state").json()["active_scenario"]
        sla = next(o for o in telemetry["objectives"] if o["id"] == "maintain_sla")
        assert sla["done"] is True and sla["failed"] is False
        client.post("/api/session/reset")
