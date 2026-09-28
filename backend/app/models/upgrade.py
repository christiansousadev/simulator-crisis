from sqlalchemy import Column, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import relationship

from app.models.base import Base


class PurchasedUpgrade(Base):
    """RECORDS A PERMANENT INFRASTRUCTURE OR FACILITY UPGRADE PURCHASED DURING A SESSION"""

    __tablename__ = "purchased_upgrades"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    upgrade_id = Column(String(50), nullable=False)
    level = Column(Integer, nullable=False, default=1)
    purchased_at_tick = Column(Integer, nullable=False)
    cost_paid = Column(Numeric(12, 2), nullable=False)

    session = relationship("GameSession", back_populates="purchased_upgrades")
