"""chaos injection timing of the data-driven custom scenario.

semantics under test: `at_tick N` fires on the N-th simulated tick of the scenario; `at_tick 0`
fires exactly once, at the start of the run (the scenario clock is bumped before on_tick, so tick 0
is never seen by on_tick)
"""

from unittest.mock import patch

from app.engine.simulator import SimulationEngine
from tests.test_engine_features import SESSION_ID, _fresh_engine


def _config(injections, duration=30):
    return {
        "duration_ticks": duration,
        "hazard_multiplier": 1.0,
        "budget_floor": 1000.0,
        "chaos_injections": injections,
    }


def _run_ticks(engine, count):
    """ADVANCE THE ENGINE LIKE _run_loop DOES, MINUS SLEEP/BROADCAST/PERSIST, WITH RANDOM HAZARDS OFF"""
    with patch.object(SimulationEngine, "_evaluate_random_failures", return_value=None):
        for _ in range(count):
            engine.current_tick += 1
            engine._update_simulation_tick()


def _incidents_for(engine, service_id):
    return [i for i in engine.incidents if i["service_id"] == service_id]


def _service(engine, service_id):
    return next(s for s in engine.services if s["id"] == service_id)


def test_injection_at_tick_zero_fires_once_at_run_start():
    engine = _fresh_engine()
    engine.load_custom_scenario(_config([{"at_tick": 0, "service_id": "srv-auth"}]))

    assert len(_incidents_for(engine, "srv-auth")) == 1
    assert _service(engine, "srv-auth")["status"] != "healthy"

    # nothing re-fires it later on (resolving it would leave it healthy; here it just must not duplicate)
    _run_ticks(engine, 5)
    assert len(_incidents_for(engine, "srv-auth")) == 1


def test_injection_at_tick_zero_does_not_touch_other_services():
    engine = _fresh_engine()
    engine.load_custom_scenario(_config([{"at_tick": 0, "service_id": "srv-auth"}]))
    assert all(s["status"] == "healthy" for s in engine.services if s["id"] != "srv-auth")


def test_injections_at_tick_one_and_five_fire_on_that_simulated_tick():
    engine = _fresh_engine()
    engine.load_custom_scenario(
        _config([{"at_tick": 1, "service_id": "srv-auth"}, {"at_tick": 5, "service_id": "srv-payment"}])
    )
    # nothing fires at load time for at_tick >= 1
    assert engine.incidents == []

    _run_ticks(engine, 1)
    assert len(_incidents_for(engine, "srv-auth")) == 1
    assert engine.active_scenario.elapsed_ticks == 1

    _run_ticks(engine, 3)  # simulated ticks 2..4
    assert _incidents_for(engine, "srv-payment") == []

    _run_ticks(engine, 1)  # simulated tick 5
    assert len(_incidents_for(engine, "srv-payment")) == 1
    assert engine.active_scenario.elapsed_ticks == 5


def test_restored_session_does_not_refire_past_injections_nor_skip_future_ones():
    engine = _fresh_engine()
    engine.load_custom_scenario(
        _config([{"at_tick": 0, "service_id": "srv-auth"}, {"at_tick": 4, "service_id": "srv-payment"}])
    )
    _run_ticks(engine, 2)
    assert len(_incidents_for(engine, "srv-auth")) == 1
    engine._persist_snapshot()

    restarted = SimulationEngine(session_id=SESSION_ID)
    scenario = restarted.active_scenario
    assert scenario is not None and scenario.scenario_id == "custom"
    assert scenario.elapsed_ticks == 2
    assert scenario._fired == {0}
    assert len(_incidents_for(restarted, "srv-auth")) == 1

    # the restored run keeps going: past injection stays single, the future one still fires at tick 4
    _run_ticks(restarted, 1)
    assert _incidents_for(restarted, "srv-payment") == []
    _run_ticks(restarted, 1)
    assert len(_incidents_for(restarted, "srv-payment")) == 1
    assert len(_incidents_for(restarted, "srv-auth")) == 1
