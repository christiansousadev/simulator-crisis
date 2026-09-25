from sqlalchemy import Column, Integer, Numeric, String, Text

from app.models.base import Base


class MitigationAction(Base):
    """REPRESENTS A CATALOGED SRE RUNBOOK ACTION AVAILABLE TO THE PLAYER"""

    __tablename__ = "mitigation_actions"

    id = Column(String(36), primary_key=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=False)
    cost = Column(Numeric(10, 2), nullable=False)
    tech_debt_delta = Column(Integer, nullable=False)
    resolve_speed_multiplier = Column(Numeric(4, 2), nullable=False, default=1.00)
    cooldown_ticks = Column(Integer, nullable=False, default=5)
    category = Column(String(50), nullable=False, default="infra")
