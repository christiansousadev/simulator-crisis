"""aggregate model imports so Base.metadata is aware of every table"""

from app.models.achievement import Achievement
from app.models.audit import AuditLog
from app.models.base import Base
from app.models.career import CareerRecord
from app.models.cosmetic import UnlockedCosmetic
from app.models.dilemma import DilemmaEvent
from app.models.engineer import Engineer
from app.models.incident import Incident
from app.models.infrastructure import InfrastructureNode
from app.models.mitigation import MitigationAction
from app.models.service import Service
from app.models.session import GameSession
from app.models.upgrade import PurchasedUpgrade

__all__ = [
    "Base",
    "GameSession",
    "Service",
    "Incident",
    "MitigationAction",
    "AuditLog",
    "PurchasedUpgrade",
    "DilemmaEvent",
    "Engineer",
    "InfrastructureNode",
    "Achievement",
    "UnlockedCosmetic",
    "CareerRecord",
]
