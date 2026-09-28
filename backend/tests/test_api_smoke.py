"""integration smoke tests exercising the real fastapi app against an isolated sqlite file"""

import os
import tempfile

import pytest

# must be set before app.core.config/database are first imported anywhere in the test run
_TMP_DB = os.path.join(tempfile.gettempdir(), "incidentzero_pytest.db")
if os.path.exists(_TMP_DB):
    os.remove(_TMP_DB)
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP_DB}"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c


def test_health_check_reports_online(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "online"


def test_session_state_has_every_commercial_pillar_key(client):
    resp = client.get("/api/session/state")
    body = resp.json()
    for key in (
        "infrastructure_nodes",
        "achievements_unlocked",
        "prestige_points",
        "unlocked_cosmetics",
        "active_scenario",
        "mitigation_cooldowns",
    ):
        assert key in body


def test_mitigation_rejects_unknown_service(client):
    resp = client.post("/api/mitigations/execute", json={"action_id": "rollback", "service_id": "does-not-exist"})
    assert resp.status_code == 400


def test_mitigation_cooldown_is_enforced_and_reflected_in_state(client):
    first = client.post("/api/mitigations/execute", json={"action_id": "rollback", "service_id": "srv-auth"})
    assert first.status_code == 200

    # the frontend reads this map directly (telemetry.mitigation_cooldowns) rather than guessing
    # cooldown state client-side -- confirm the wire payload actually carries it
    state = client.get("/api/session/state").json()
    assert "rollback" in state["mitigation_cooldowns"]

    second = client.post("/api/mitigations/execute", json={"action_id": "rollback", "service_id": "srv-auth"})
    assert second.status_code == 400
    assert "cooldown" in second.json()["detail"].lower()


def test_upgrade_purchase_rejects_missing_prerequisite(client):
    resp = client.post("/api/upgrades/predictive_anomaly_detection/purchase")
    assert resp.status_code == 400
    assert "apm_tracing" in resp.json()["detail"]


def test_achievement_catalog_has_exactly_twelve_entries(client):
    resp = client.get("/api/achievements/catalog")
    assert len(resp.json()) == 12


def test_infrastructure_placement_requires_valid_target(client):
    resp = client.post(
        "/api/infrastructure/nodes",
        json={"node_type": "redis_cache", "grid_x": 1.0, "grid_y": 1.0, "target_service_id": "does-not-exist"},
    )
    assert resp.status_code == 400


def test_career_records_endpoint_returns_a_list(client):
    resp = client.get("/api/career/records", params={"player_id": "pytest-player", "scope": "mine"})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_reset_with_player_id_switches_career_progress(client):
    resp = client.post("/api/session/reset", json={"player_id": "pytest-player-a"})
    assert resp.status_code == 200
    assert app.state.engine.player_id == "pytest-player-a"

    resp = client.post("/api/session/reset", json={"player_id": "pytest-player-b"})
    assert resp.status_code == 200
    assert app.state.engine.player_id == "pytest-player-b"
    assert app.state.engine.achievements_unlocked == set()
