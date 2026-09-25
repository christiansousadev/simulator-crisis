"""integration test for the alembic migration path itself, independent of the api layer"""

import os
import tempfile
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect

EXPECTED_TABLES = {
    "game_sessions",
    "services",
    "incidents",
    "audit_logs",
    "mitigation_actions",
    "purchased_upgrades",
    "dilemma_events",
    "engineers",
    "infrastructure_nodes",
    "achievements",
    "unlocked_cosmetics",
    "career_records",
    "alembic_version",
}


def _run_upgrade_head():
    from alembic import command
    from alembic.config import Config

    backend_root = Path(__file__).resolve().parents[1]
    alembic_cfg = Config(str(backend_root / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")


@pytest.fixture()
def migrated_db_url():
    # a fresh, uniquely-named file per test avoids windows' brief post-close sqlite file lock
    # from bleeding between test runs; the temp dir is swept by the os eventually either way
    db_path = os.path.join(tempfile.gettempdir(), f"incidentzero_pytest_migrations_{uuid.uuid4().hex[:8]}.db")
    url = f"sqlite:///{db_path}"
    os.environ["DATABASE_URL"] = url

    _run_upgrade_head()

    yield url
    try:
        if os.path.exists(db_path):
            os.remove(db_path)
    except PermissionError:
        # harmless: a lingering handle in a temp dir the os cleans up eventually
        pass


def test_migration_creates_every_expected_table(migrated_db_url):
    engine = create_engine(migrated_db_url)
    tables = set(inspect(engine).get_table_names())
    engine.dispose()
    assert EXPECTED_TABLES <= tables


def test_migration_is_idempotent(migrated_db_url):
    """running upgrade head twice against an up-to-date db must not raise"""
    _run_upgrade_head()  # second run, should be a no-op


def test_new_columns_present_on_previously_existing_tables(migrated_db_url):
    """regression guard for the exact bug this migration setup fixes: columns added to
    tables that existed since before alembic was introduced must be present after a
    fresh migration run"""
    engine = create_engine(migrated_db_url)
    inspector = inspect(engine)

    achievement_cols = {c["name"] for c in inspector.get_columns("achievements")}
    assert "player_id" in achievement_cols

    cosmetic_cols = {c["name"] for c in inspector.get_columns("unlocked_cosmetics")}
    assert "player_id" in cosmetic_cols

    session_cols = {c["name"] for c in inspector.get_columns("game_sessions")}
    assert "prestige_points" in session_cols

    incident_cols = {c["name"] for c in inspector.get_columns("incidents")}
    assert "triage_solved" in incident_cols

    engine.dispose()
