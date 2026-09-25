"""unit coverage for the difficulty presets, governance reputation system and the
crash/restart snapshot-restore path added on top of the simulation engine.

app.core.database binds its SQLAlchemy engine once, at first import, to whatever
DATABASE_URL is active at that moment (the same frozen-singleton shape as alembic/env.py
before it was fixed) -- so once another test module in the same pytest run has already
imported the app, every engine constructed anywhere in this process shares that one
database file. This module sets its own isolated DATABASE_URL and applies migrations
purely as a courtesy for the case where it happens to run standalone/first.

SESSION_ID deliberately reuses the same id the app hardcodes in production
("incidentzero-alpha", also used by test_api_smoke.py's TestClient-driven tests) rather
than a random one: Service.id is a bare (non-composite) primary key, so two *different*
session ids each bootstrapping their own "srv-auth" row would collide the moment they
share a database file -- which they do here once another test module has already run in
this process. Reusing the one id every other test in this suite already reuses, and
resetting it at the start of every test below, sidesteps that entirely.
"""

import asyncio
import os
import tempfile
from pathlib import Path

_TEST_DB = os.path.join(tempfile.gettempdir(), "incidentzero_pytest_engine.db")
if "DATABASE_URL" not in os.environ and os.path.exists(_TEST_DB):
    # only this module's own dedicated file, and only when nothing has claimed DATABASE_URL yet
    # (i.e. this file is running standalone/first) -- start it from a clean slate every run so
    # cruft from an earlier interrupted run can never collide with a hardcoded service id below
    os.remove(_TEST_DB)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB}")

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

_backend_root = Path(__file__).resolve().parents[1]
command.upgrade(Config(str(_backend_root / "alembic.ini")), "head")

from app.core.database import SessionLocal  # noqa: E402
from app.engine import dilemmas  # noqa: E402
from app.engine.simulator import DIFFICULTY_PRESETS, SimulationEngine  # noqa: E402
from app.models.session import GameSession  # noqa: E402

SESSION_ID = "incidentzero-alpha"


def _reset_session_row():
    """DELETE ANY PRIOR ROW FOR SESSION_ID SO THE NEXT ENGINE CONSTRUCTION BOOTSTRAPS FRESH"""
    db = SessionLocal()
    try:
        existing = db.get(GameSession, SESSION_ID)
        if existing:
            db.delete(existing)
            db.commit()
    finally:
        db.close()


def _fresh_engine(**kwargs) -> SimulationEngine:
    _reset_session_row()
    return SimulationEngine(session_id=SESSION_ID, **kwargs)


def test_difficulty_preset_sets_starting_budget_on_init():
    engine = _fresh_engine(difficulty="chaos")
    assert engine.difficulty == "chaos"
    assert engine.budget == DIFFICULTY_PRESETS["chaos"]["starting_budget"]


def test_unknown_difficulty_falls_back_to_standard():
    engine = _fresh_engine(difficulty="not-a-real-difficulty")
    assert engine.difficulty == "standard"
    assert engine.budget == DIFFICULTY_PRESETS["standard"]["starting_budget"]


def test_reset_reapplies_the_requested_difficulty_and_resets_reputation():
    engine = _fresh_engine()
    engine.reputation = 12.0  # simulate a run that tanked its governance reputation

    # reset() starts the tick loop again via asyncio.create_task, which needs a running loop
    async def _do_reset():
        engine.reset(difficulty="intern")
        engine.pause()  # stop the freshly (re)started tick loop before the event loop closes

    asyncio.run(_do_reset())

    assert engine.difficulty == "intern"
    assert engine.budget == DIFFICULTY_PRESETS["intern"]["starting_budget"]
    assert engine.reputation == 50.0


def test_dilemma_resolution_shifts_reputation_and_clamps_to_bounds():
    engine = _fresh_engine()
    assert engine.reputation == 50.0

    dilemma = dilemmas.build_dilemma(engine.current_tick, engine.reputation)
    engine.active_dilemma = dilemma
    choice = dilemma["choices"][0]

    result = engine.resolve_dilemma(dilemma["id"], choice["id"])
    assert result["success"] is True
    assert engine.reputation == max(0.0, min(100.0, 50.0 + choice.get("reputation_delta", 0)))
    assert engine.active_dilemma is None


def test_reputation_gated_dilemmas_only_appear_within_their_threshold():
    # crisis-only callback dilemma must never appear at a comfortable reputation score
    for _ in range(50):
        offer = dilemmas.build_dilemma(current_tick=0, reputation=80.0)
        assert offer["dilemma_key"] != "board_intervention"

    # and the promotion callback must never appear while reputation is still shaky
    for _ in range(50):
        offer = dilemmas.build_dilemma(current_tick=0, reputation=20.0)
        assert offer["dilemma_key"] != "executive_promotion_offer"


def test_engine_restores_core_stats_after_simulated_process_restart():
    original = _fresh_engine()
    original.current_tick = 42
    original.budget = 199999.0
    original.tech_debt = 60
    original.hire_engineer(core_competency="auth", assigned_service_id=None)
    expected_budget = original.budget  # hiring already deducted its cost from the 199999.0 set above
    original._persist_snapshot()

    # simulate the backend process restarting: a brand new engine instance is constructed
    # against the same session_id (deliberately no _reset_session_row here), and should pick
    # the run back up instead of wiping it
    restarted = SimulationEngine(session_id=SESSION_ID)
    assert restarted.current_tick == 42
    assert restarted.budget == expected_budget
    assert restarted.tech_debt == 60
    assert len(restarted.engineers) == 1


def test_engine_does_not_restore_a_terminal_or_fresh_session():
    # current_tick still 0 (never advanced) means there is nothing meaningful to resume
    _fresh_engine()
    resumed = SimulationEngine(session_id=SESSION_ID)
    assert resumed.current_tick == 0
    assert resumed.budget == DIFFICULTY_PRESETS["standard"]["starting_budget"]
