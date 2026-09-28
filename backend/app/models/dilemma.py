from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class DilemmaEvent(Base):
    """RECORDS A CAB DILEMMA OFFERED TO THE PLAYER AND ITS ULTIMATE RESOLUTION"""

    __tablename__ = "dilemma_events"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    dilemma_key = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    offered_at_tick = Column(Integer, nullable=False)
    expires_at_tick = Column(Integer, nullable=False)
    resolved_at_tick = Column(Integer, nullable=True)
    resolved_choice_id = Column(String(50), nullable=True)
    was_auto_resolved = Column(Boolean, nullable=False, default=False)
    choices_json = Column(Text, nullable=False)

    session = relationship("GameSession", back_populates="dilemma_events")
