from sqlalchemy import Column, String, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base


class Achievement(Base):
    """RECORDS A CAREER ACHIEVEMENT UNLOCK, KEYED BY PLAYER SO IT OUTLIVES A SESSION RESET"""

    __tablename__ = "achievements"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    player_id = Column(String(64), nullable=False, default="local-player")
    achievement_key = Column(String(50), nullable=False)
    unlocked_at_tick = Column(Integer, nullable=False)

    # no delete-orphan cascade: an achievement is a permanent career record, not session-scoped state
    session = relationship("GameSession", back_populates="achievements")
