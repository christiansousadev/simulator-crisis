import pytest
from app.engine.scenarios import SCENARIO_REGISTRY
from app.engine.scenarios.ddos_global import DdosGlobalScenario
from app.engine.scenarios.deployment_rollback import DeploymentRollbackScenario
from app.engine.scenarios.third_party_outage import ThirdPartyOutageScenario
from app.engine.simulator import SimulationEngine


from unittest.mock import patch
from app.core.database import SessionLocal
from app.models.session import GameSession

SESSION_ID = "incidentzero-test-scenarios"

def _make_engine():
    with patch.object(SimulationEngine, "_persist_bootstrap", return_value=None):
        engine = SimulationEngine(session_id="incidentzero-alpha")
        return engine


def test_registry_contains_all_six_scenarios():
    assert "black_friday_rush" in SCENARIO_REGISTRY
    assert "ransomware_infiltration" in SCENARIO_REGISTRY
    assert "chaos_engineering_drill" in SCENARIO_REGISTRY
    assert "ddos_global" in SCENARIO_REGISTRY
    assert "deployment_rollback" in SCENARIO_REGISTRY
    assert "third_party_outage" in SCENARIO_REGISTRY
    assert len(SCENARIO_REGISTRY) == 6


def test_ddos_global_scenario_lifecycle():
    engine = _make_engine()
    scenario = DdosGlobalScenario(engine)
    assert scenario.scenario_id == "ddos_global"
    assert scenario.duration_ticks > 0

    # test tick execution
    scenario.elapsed_ticks += 1
    scenario.on_tick()
    assert scenario.elapsed_ticks == 1

    objs = scenario.objectives()
    assert len(objs) > 0

    scenario.elapsed_ticks = scenario.duration_ticks
    outcome = scenario.evaluate_victory()
    assert outcome is not None
    assert outcome["scenario_id"] == "ddos_global"


def test_deployment_rollback_scenario_lifecycle():
    engine = _make_engine()
    scenario = DeploymentRollbackScenario(engine)
    assert scenario.scenario_id == "deployment_rollback"
    assert scenario.duration_ticks > 0

    scenario.elapsed_ticks += 1
    scenario.on_tick()
    assert scenario.elapsed_ticks == 1

    objs = scenario.objectives()
    assert len(objs) > 0

    scenario.elapsed_ticks = scenario.duration_ticks
    outcome = scenario.evaluate_victory()
    assert outcome is not None
    assert outcome["scenario_id"] == "deployment_rollback"


def test_third_party_outage_scenario_lifecycle():
    engine = _make_engine()
    scenario = ThirdPartyOutageScenario(engine)
    assert scenario.scenario_id == "third_party_outage"
    assert scenario.duration_ticks > 0

    scenario.elapsed_ticks += 1
    scenario.on_tick()
    assert scenario.elapsed_ticks == 1

    objs = scenario.objectives()
    assert len(objs) > 0

    scenario.elapsed_ticks = scenario.duration_ticks
    outcome = scenario.evaluate_victory()
    assert outcome is not None
    assert outcome["scenario_id"] == "third_party_outage"
