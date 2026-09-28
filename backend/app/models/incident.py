from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.models.base import Base


class Incident(Base):
    """REPRESENTS AN ACTIVE OR RESOLVED CRISIS INCIDENT"""
    __tablename__ = "incidents"

    id = Column(String(36), primary_key=True)
    session_id = Column(String(36), ForeignKey("game_sessions.id", ondelete="CASCADE"), nullable=False)
    service_id = Column(String(36), ForeignKey("services.id", ondelete="CASCADE"), nullable=False)
    severity = Column(String(20), nullable=False)
    title = Column(String(255), nullable=False)
    root_cause = Column(Text, nullable=False)
    mtta_seconds = Column(Integer, nullable=False, default=0)
    mttr_seconds = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="active")
    created_tick = Column(Integer, nullable=False)
    acknowledged_tick = Column(Integer, nullable=True)
    resolved_tick = Column(Integer, nullable=True)
    triage_solved = Column(Boolean, nullable=False, default=False)

    session = relationship("GameSession", back_populates="incidents")
    service = relationship("Service", back_populates="incidents")
