"""prestige-point cosmetic shop: catalog contract, unlock rules, career persistence and the REST surface.

Every engine here gets its own random player_id, so the permanent UnlockedCosmetic ledger rows one
test writes can never leak into another test's career rehydration (the rows are keyed by player and
deliberately survive session resets). The DATABASE_URL / migration preamble mirrors
test_engine_features.py so this module also runs standalone.
"""

import asyncio
import os
import tempfile
import uuid
from pathlib import Path

_TEST_DB = os.path.join(tempfile.gettempdir(), "incidentzero_pytest_cosmetics.db")
if "DATABASE_URL" not in os.environ and os.path.exists(_TEST_DB):
    os.remove(_TEST_DB)
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_TEST_DB}")

from alembic.config import Config  # noqa: E402

from alembic import command  # noqa: E402

_backend_root = Path(__file__).resolve().parents[1]
command.upgrade(Config(str(_backend_root / "alembic.ini")), "head")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.engine import cosmetics  # noqa: E402
from app.engine.simulator import SimulationEngine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.cosmetic import UnlockedCosmetic  # noqa: E402
from app.models.session import GameSession  # noqa: E402

SESSION_ID = "incidentzero-alpha"
# the frontend ships localized copy and reskin art for exactly these ids (CosmeticIdKey,
# BreakRoom.tsx, ReceptionLobby.tsx); a catalog change must be mirrored there
FRONTEND_COSMETIC_IDS = {"golden_coffee_machine", "executive_leather_sofa", "marble_reception_desk"}


def _engine(player_id: str) -> SimulationEngine:
    db = SessionLocal()
    try:
        existing = db.get(GameSession, SESSION_ID)
        if existing:
            db.delete(existing)
            db.commit()
    finally:
        db.close()
    return SimulationEngine(session_id=SESSION_ID, player_id=player_id)


@pytest.fixture()
def player_id() -> str:
    return f"pytest-cosmetics-{uuid.uuid4().hex[:10]}"


def _ledger_rows(player_id: str):
    db = SessionLocal()
    try:
        return db.query(UnlockedCosmetic).filter(UnlockedCosmetic.player_id == player_id).all()
    finally:
        db.close()


def test_catalog_contract_matches_the_frontend():
    ids = [c["id"] for c in cosmetics.COSMETIC_CATALOG]
    assert len(ids) == len(set(ids)), "cosmetic ids must be unique"
    assert set(ids) == FRONTEND_COSMETIC_IDS
    for entry in cosmetics.COSMETIC_CATALOG:
        assert set(entry) >= {"id", "name", "description", "prestige_cost"}
        assert isinstance(entry["prestige_cost"], int) and entry["prestige_cost"] > 0


def test_find_cosmetic_looks_up_by_id():
    assert cosmetics.find_cosmetic("marble_reception_desk")["prestige_cost"] == 300
    assert cosmetics.find_cosmetic("does-not-exist") is None


def test_unlock_rejects_an_unknown_id_without_charging(player_id):
    engine = _engine(player_id)
    engine.prestige_points = 1000
    result = engine.unlock_cosmetic("platinum_toaster")
    assert result == {"success": False, "error": "Unknown cosmetic id"}
    assert engine.prestige_points == 1000
    assert engine.unlocked_cosmetics == set()


def test_unlock_rejects_an_insufficient_balance(player_id):
    engine = _engine(player_id)
    engine.prestige_points = 149
    result = engine.unlock_cosmetic("executive_leather_sofa")
    assert result == {"success": False, "error": "Insufficient prestige points"}
    assert engine.prestige_points == 149
    assert _ledger_rows(player_id) == []


def test_unlock_spends_the_exact_cost_records_the_ledger_and_audits(player_id):
    engine = _engine(player_id)
    engine.prestige_points = 150
    result = engine.unlock_cosmetic("executive_leather_sofa")
    assert result == {"success": True, "cosmetic_id": "executive_leather_sofa", "prestige_points": 0}
    assert engine.prestige_points == 0
    assert "executive_leather_sofa" in engine.unlocked_cosmetics
    assert [row.cosmetic_id for row in _ledger_rows(player_id)] == ["executive_leather_sofa"]
    # the telemetry payload every client reads carries the new balance and the installed prop
    payload = engine.get_state_payload()
    assert payload["prestige_points"] == 0
    assert "executive_leather_sofa" in payload["unlocked_cosmetics"]


def test_unlock_is_idempotent_and_never_charges_twice(player_id):
    engine = _engine(player_id)
    engine.prestige_points = 1000
    assert engine.unlock_cosmetic("golden_coffee_machine")["success"] is True
    again = engine.unlock_cosmetic("golden_coffee_machine")
    assert again == {"success": False, "error": "Cosmetic already unlocked"}
    assert engine.prestige_points == 800
    assert len(_ledger_rows(player_id)) == 1


def test_unlocks_survive_a_process_restart_and_stay_paid_for(player_id):
    engine = _engine(player_id)
    engine.prestige_points = 300
    assert engine.unlock_cosmetic("marble_reception_desk")["success"] is True

    # a new engine for the same player rehydrates career progress from the ledger: the desk is still
    # installed and its cost stays deducted from whatever the achievements earned (none here)
    restarted = _engine(player_id)
    assert restarted.unlocked_cosmetics == {"marble_reception_desk"}
    assert restarted.prestige_points == 0


def test_unlocks_survive_a_new_game(player_id):
    engine = _engine(player_id)
    engine.prestige_points = 500
    assert engine.unlock_cosmetic("golden_coffee_machine")["success"] is True

    # reset() restarts the tick loop via asyncio.create_task, which needs a running loop; stop it
    # again before the loop closes so no coroutine is left un-awaited
    async def _new_game():
        engine.reset(player_id=player_id)
        engine.pause()

    asyncio.run(_new_game())
    assert "golden_coffee_machine" in engine.unlocked_cosmetics


# --- REST surface -----------------------------------------------------------------------------


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_catalog_endpoint_serves_the_engine_catalog(client):
    resp = client.get("/api/cosmetics/catalog")
    assert resp.status_code == 200
    assert resp.json() == cosmetics.COSMETIC_CATALOG


def test_unlock_endpoint_maps_engine_errors_to_400(client):
    engine = client.app.state.engine
    engine.prestige_points = 0
    unknown = client.post("/api/cosmetics/platinum_toaster/unlock")
    assert unknown.status_code == 400
    assert unknown.json()["detail"] == "Unknown cosmetic id"

    target = next(c for c in cosmetics.COSMETIC_CATALOG if c["id"] not in engine.unlocked_cosmetics)
    broke = client.post(f"/api/cosmetics/{target['id']}/unlock")
    assert broke.status_code == 400
    assert broke.json()["detail"] == "Insufficient prestige points"


def test_unlock_endpoint_returns_the_new_balance(client):
    engine = client.app.state.engine
    target = next((c for c in cosmetics.COSMETIC_CATALOG if c["id"] not in engine.unlocked_cosmetics), None)
    if target is None:
        pytest.skip("every cosmetic is already owned by the shared app player in this database")
    engine.prestige_points = target["prestige_cost"] + 25
    resp = client.post(f"/api/cosmetics/{target['id']}/unlock")
    assert resp.status_code == 200
    assert resp.json() == {"success": True, "cosmetic_id": target["id"], "prestige_points": 25}
    state = client.get("/api/session/state").json()
    assert target["id"] in state["unlocked_cosmetics"]
    assert state["prestige_points"] == 25
