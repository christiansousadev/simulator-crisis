from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.api.router import api_router
from app.engine.simulator import SimulationEngine

# repo layout: backend/app/main.py -> alembic.ini lives one level up, in backend/
ALEMBIC_INI_PATH = Path(__file__).resolve().parents[1] / "alembic.ini"


def run_database_migrations():
    """APPLY EVERY PENDING ALEMBIC MIGRATION SO THE SCHEMA ALWAYS MATCHES THE CURRENT MODELS"""
    alembic_cfg = Config(str(ALEMBIC_INI_PATH))
    try:
        command.upgrade(alembic_cfg, "head")
    except OperationalError as exc:
        # the most common cause: a sqlite file created before alembic was introduced, whose
        # tables exist but were never stamped with a migration version, so upgrade collides
        # with "table already exists". there is no safe auto-repair for an unknown legacy
        # schema; the correct fix is to delete the old database file and let migrations
        # recreate it cleanly, which is safe for this project's regenerable simulation data.
        raise RuntimeError(
            "Database schema is out of date and predates Alembic migrations. "
            "Stop the server and delete the sqlite database file (see DATABASE_URL in your "
            "environment, e.g. backend/incidentzero.db), then restart so migrations can "
            "recreate it from scratch."
        ) from exc


@asynccontextmanager
async def lifespan(app: FastAPI):
    """MANAGE APPLICATION LIFECYCLE AND BACKGROUND TICK RUNNER"""
    run_database_migrations()
    app.state.engine = SimulationEngine(session_id="incidentzero-alpha")
    app.state.engine.start()
    yield
    # graceful shutdown of simulation loop
    app.state.engine.pause()


app = FastAPI(
    title="IncidentZero: SRE & IT Governance Simulator API",
    version="1.0.0",
    description="Real-time crisis management simulation engine and audit telemetry pipeline",
    lifespan=lifespan,
)

# configure cross origin resource sharing for frontend clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
