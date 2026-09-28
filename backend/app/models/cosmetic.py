from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from app.models.base import Base


class UnlockedCosmetic(Base):
    """RECORDS A PRESTIGE-POINT COSMETIC UNLOCK, KEYED BY PLAYER SO IT OUTLIVES A SESSION RESET"""

    __tablename__ = "unlocked_cosmetics"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(String(64), nullable=False, default="local-player")
    cosmetic_id = Column(String(50), nullable=False)
    unlocked_at_tick = Column(Integer, nullable=False)

    # no delete-orphan cascade: a cosmetic unlock is a permanent career record, not session-scoped state
    session = relationship("GameSession", back_populates="unlocked_cosmetics")
