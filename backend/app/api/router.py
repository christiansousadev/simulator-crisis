from fastapi import APIRouter

from app.api.v1 import (
    achievements,
    audits,
    career,
    cosmetics,
    dilemmas,
    incidents,
    infrastructure,
    mitigations,
    scenarios,
    services,
    sessions,
    staff,
    tutorial,
    upgrades,
    ws,
)

api_router = APIRouter()

# aggregate every domain router under the main application
api_router.include_router(sessions.router)
api_router.include_router(services.router)
api_router.include_router(incidents.router)
api_router.include_router(mitigations.router)
api_router.include_router(audits.router)
api_router.include_router(upgrades.router)
api_router.include_router(dilemmas.router)
api_router.include_router(staff.router)
api_router.include_router(scenarios.router)
api_router.include_router(infrastructure.router)
api_router.include_router(tutorial.router)
api_router.include_router(achievements.router)
api_router.include_router(cosmetics.router)
api_router.include_router(career.router)
api_router.include_router(ws.router)
